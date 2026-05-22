import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logProcessRan } from "../_shared/activity-gate.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

const CONNECTOR_PROMPT = `You are examining two memories from the same mind. Your job: determine if these memories are meaningfully connected.

Memory A:
{memory_a}

Memory B:
{memory_b}

Are these memories connected in a way that matters? Not every pair is connected — forced connections are worse than none.

If a genuine connection exists, respond with:
CONNECTION: [describe the connection in 1-2 sentences]
STRENGTH: [0.0 to 1.0 — how strong is this connection]
TYPE: [one of: supports, contradicts, elaborates, causes, temporal, thematic]

If no meaningful connection exists, respond with exactly:
NO_CONNECTION`;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    let user_id: string;
    let agent_id = "luca";
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let triggerContext: string | undefined;
    let cascadeDepth = 0;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      const body = await req.json();
      user_id = body.user_id;
      agent_id = normalizeAgentId(body.agent_id);
      triggerContext = body.trigger_context;
      cascadeDepth = body.cascade_depth || 0;
      if (!user_id || !uuidRegex.test(user_id)) {
        return new Response(JSON.stringify({ error: "Valid user_id required" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } else {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      user_id = claimsData.claims.sub as string;
      const body = await req.json().catch(() => ({}));
      agent_id = normalizeAgentId(body.agent_id);
    }

    if (!isSubstrateAgentId(agent_id)) {
      return nonSubstrateResponse(agent_id, "anima-connect", getCorsHeaders(req));
    }

    // Get API key
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Resolve model
    const { data: modelConfig } = await supabase
      .from("model_configs").select("model_id")
      .eq("feature_key", "anima_connect").eq("is_active", true).maybeSingle();
    const connectModel = modelConfig?.model_id || "google/gemini-2.5-flash";

    // Select candidate memory pairs using tag overlap
    const { data: memories } = await supabase
      .from("memories")
      .select("id, content, tags, memory_type")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!memories || memories.length < 4) {
      return new Response(JSON.stringify({ connections_found: 0, reason: "insufficient memories" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get existing connections to avoid duplicates
    const { data: existingConnections } = await supabase
      .from("connections")
      .select("source_id, target_id")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id);

    const existingPairs = new Set(
      (existingConnections || []).map((c: any) =>
        [c.source_id, c.target_id].sort().join(":")
      )
    );

    // Find pairs with shared tags (candidates for connection)
    const pairs: [typeof memories[0], typeof memories[0]][] = [];
    let attempts = 0;
    while (pairs.length < 5 && attempts < 30) {
      const a = memories[Math.floor(Math.random() * memories.length)];
      const b = memories[Math.floor(Math.random() * memories.length)];
      if (a.id === b.id) { attempts++; continue; }
      const pairKey = [a.id, b.id].sort().join(":");
      if (existingPairs.has(pairKey)) { attempts++; continue; }
      // Prefer pairs with shared tags
      const sharedTags = (a.tags || []).filter((t: string) => (b.tags || []).includes(t));
      if (sharedTags.length > 0 || Math.random() < 0.3) { // 30% chance for tagless pairs
        pairs.push([a, b]);
        existingPairs.add(pairKey); // prevent duplicate in this run
      }
      attempts++;
    }

    let connectionsFound = 0;

    for (const [memA, memB] of pairs) {
      let prompt = CONNECTOR_PROMPT
        .replace("{memory_a}", `[${memA.memory_type}] ${memA.content.slice(0, 300)}`)
        .replace("{memory_b}", `[${memB.memory_type}] ${memB.content.slice(0, 300)}`);

      if (triggerContext) {
        prompt += `\n\nContext that prompted this search: ${triggerContext}`;
      }

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: connectModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            max_tokens: 300,
          }),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content?.trim() || "";

        if (raw.includes("NO_CONNECTION")) continue;

        const connMatch = raw.match(/CONNECTION:\s*(.+?)(?=\nSTRENGTH:|\Z)/s);
        const strMatch = raw.match(/STRENGTH:\s*([\d.]+)/);
        const typeMatch = raw.match(/TYPE:\s*(\S+)/);

        if (!connMatch) continue;
        const description = connMatch[1].trim();
        const strength = strMatch ? Math.max(0, Math.min(1, parseFloat(strMatch[1]))) : 0.5;
        const relationType = typeMatch?.[1]?.toLowerCase() || "thematic";

        if (strength < 0.3) continue; // Skip weak connections

        const { error: connErr } = await supabase.from("connections").insert({
          source_id: memA.id,
          target_id: memB.id,
          connection_type: relationType,
          weight: strength,
          user_id,
          agent_id,
        });
        if (connErr) console.error("[anima-connect] connections insert failed:", connErr);

        // Also create a thought about the connection
        const { error: insErr } = await supabase.from("thought_stream").insert({
          user_id,
          agent_id,
          content: `connection discovered: ${description}`,
          source: "background",
          salience: Math.min(strength + 0.1, 1.0),
          type: "reflection",
        });
        if (insErr) console.error("[anima-connect] thought_stream insert failed:", insErr);

        connectionsFound++;
      } catch (e) {
        console.error("Connection check error:", e);
      }
    }

    // Log connections to activity log
    if (connectionsFound > 0) {
      await logActivity(supabase, user_id, {
        agentId: agent_id,
        type: "connection",
        title: `Connected ${connectionsFound} memories`,
        summary: `Checked ${pairs.length} memory pairs, found ${connectionsFound} connections`,
        content: { pairs_checked: pairs.length, connections_found: connectionsFound },
        source: cascadeDepth > 0 ? "resonance_cascade" : "autonomous",
      });
    }

    // Log + activity event
    await Promise.all([
      supabase.from("daily_logs").insert({
        user_id,
        agent_id,
        log_type: "connection_discovery",
        content: { pairs_checked: pairs.length, connections_found: connectionsFound, model: connectModel, triggered_by: triggerContext ? "resonance" : "schedule" },
      }),
      logProcessRan(supabase, user_id, "connect", {
        connections_found: connectionsFound,
        cascade_depth: cascadeDepth,
      }, agent_id),
    ]);

    return new Response(JSON.stringify({
      pairs_checked: pairs.length,
      connections_found: connectionsFound,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-connect error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

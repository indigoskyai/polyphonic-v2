import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { resolvePrimaryModel } from "../_shared/model-backend.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

const DREAMER_PROMPT = `You are a dreaming mind. During dreams, random memories activate together and sometimes produce unexpected connections.

This is not analysis. This is free association. Let the memories collide and see what happens.

Memory A:
{memory_a}

Memory B:
{memory_b}

Let these two memories touch. Don't force a connection — but if one emerges naturally, follow it. Write whatever comes. Stream of consciousness. No structure required.

If nothing meaningful emerges, just write: [nothing surfaced]

Dream:`;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth: accept service role or user JWT
    const authHeader = req.headers.get("Authorization");
    let user_id: string;
    let agent_id = "luca";
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      const body = await req.json();
      user_id = body.user_id;
      agent_id = normalizeAgentId(body.agent_id);
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
      return nonSubstrateResponse(agent_id, "anima-dream", getCorsHeaders(req));
    }

    // Fetch random memory pairs from different tag domains
    const { data: memories } = await supabase
      .from("memories")
      .select("id, content, tags, memory_type, emotional_intensity")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!memories || memories.length < 4) {
      return new Response(JSON.stringify({ dreams: 0, reason: "insufficient memories" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Group by primary tag domain
    const domainMap: Record<string, typeof memories> = {};
    for (const m of memories) {
      const primaryTag = m.tags?.[0] || "untagged";
      if (!domainMap[primaryTag]) domainMap[primaryTag] = [];
      domainMap[primaryTag].push(m);
    }

    const domains = Object.keys(domainMap);
    const pairsPerDream = 3;
    const pairs: [typeof memories[0], typeof memories[0]][] = [];

    if (domains.length < 2) {
      // Shuffle and pair sequentially
      const shuffled = [...memories].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(pairsPerDream * 2, shuffled.length - 1); i += 2) {
        pairs.push([shuffled[i], shuffled[i + 1]]);
      }
    } else {
      let attempts = 0;
      while (pairs.length < pairsPerDream && attempts < 60) {
        const [d1, d2] = [domains[Math.floor(Math.random() * domains.length)], domains[Math.floor(Math.random() * domains.length)]];
        if (d1 === d2) { attempts++; continue; }
        const a = domainMap[d1][Math.floor(Math.random() * domainMap[d1].length)];
        const b = domainMap[d2][Math.floor(Math.random() * domainMap[d2].length)];
        if (a.id !== b.id) pairs.push([a, b]);
        attempts++;
      }
      // Fallback: if domain pairing yielded nothing, just shuffle
      if (pairs.length === 0) {
        const shuffled = [...memories].sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(pairsPerDream * 2, shuffled.length - 1); i += 2) {
          pairs.push([shuffled[i], shuffled[i + 1]]);
        }
      }
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

    // Get model config + user settings
    const [{ data: modelConfig }, { data: userSettings }] = await Promise.all([
      supabase.from("model_configs").select("model_id").eq("feature_key", "anima_dream").eq("is_active", true).maybeSingle(),
      supabase.from("user_settings").select("dreamer_model").eq("user_id", user_id).maybeSingle(),
    ]);

    // Dreaming runs in the agent's own voice — the same model it speaks with —
    // so its dreams are continuous with its waking self. User/admin overrides
    // still win. (Previously used off-family models for "cognitive diversity";
    // that divergence now comes from prompt + temperature, not a foreign voice.)
    let dreamModel = userSettings?.dreamer_model || modelConfig?.model_id;
    if (!dreamModel) {
      dreamModel = await resolvePrimaryModel(supabase, user_id);
    }

    let dreamsKept = 0;
    let dreamsDiscarded = 0;

    for (const [memA, memB] of pairs) {
      const prompt = DREAMER_PROMPT
        .replace("{memory_a}", memA.content)
        .replace("{memory_b}", memB.content);

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: dreamModel,
            messages: [
              { role: "system", content: "You are a dreaming mind. Let go of structure. Free-associate. Stream of consciousness. lowercase. If nothing comes, say [nothing surfaced] and that's fine." },
              { role: "user", content: prompt },
            ],
            temperature: 0.95,
            max_tokens: 500,
          }),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const dreamText = data.choices?.[0]?.message?.content?.trim() || "";

        if (!dreamText || dreamText.length < 30 || dreamText.toLowerCase().includes("[nothing surfaced]")) {
          dreamsDiscarded++;
          continue;
        }

        // Store dream as a journal entry with mood "dreaming"
        const tagsA = (memA.tags || []).slice(0, 2);
        const tagsB = (memB.tags || []).slice(0, 2);

        const { error: dreamInsErr } = await supabase.from("journal_entries").insert({
          user_id,
          agent_id,
          content: dreamText,
          mood: "dreaming",
          trigger_type: "periodic",
        });
        if (dreamInsErr) console.error("[anima-dream] journal_entries insert failed:", dreamInsErr);

        await logActivity(supabase, user_id, {
          agentId: agent_id,
          type: "dream",
          title: "Dream: " + dreamText.slice(0, 60),
          summary: dreamText.slice(0, 200),
          content: { text: dreamText },
          source: "autonomous",
        });

        // Encode dream into Mnemos
        try {
          const mnemos = new MnemosEngine(supabase, user_id, agent_id);
          await mnemos.encode(dreamText, {
            engram_type: "semantic",
            tags: ["dream", "inner-life", ...tagsA, ...tagsB],
            source_context: { type: "anima_dream" },
          });
        } catch (e) {
          console.warn("Mnemos dream encoding failed (non-fatal):", e);
        }

        dreamsKept++;
      } catch (e) {
        console.error("Dream generation error:", e);
      }
    }

    return new Response(JSON.stringify({ dreams_kept: dreamsKept, dreams_discarded: dreamsDiscarded }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-dream error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

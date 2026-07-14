import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAutonomous, normalizeAutonomousContent } from "../_shared/autonomous-generation.ts";
import { resolveRoleModel } from "../_shared/model-backend.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { logProcessRan } from "../_shared/activity-gate.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

const CONSOLIDATION_PROMPT = `You are performing nightly memory consolidation. Review the day's experiences — journals, thoughts, conversations — and determine which deserve to become lasting memories.

Apply the Behavioral Change Test: "Would knowing this change how I interact or think in the future?" Only consolidate what passes.

Today's experiences:

=== Journal Entries ===
{journals}

=== Thoughts Generated ===
{thoughts}

=== Emotional Arc ===
{emotions}

For each memory worth keeping, use this exact format:

MEMORY: [the memory content — what happened and why it matters, 1-3 sentences]
TYPE: [one of: experience, insight, relationship, impression, fact]
EMOTIONAL_CONTEXT: [brief emotional note — how this felt]
SALIENCE: [0.0 to 1.0]
TAGS: [comma-separated lowercase tags]

Generate 0-5 memories. Zero is valid if nothing notable happened; in that case output exactly NO_MEMORIES. Don't manufacture significance.`;

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
      return nonSubstrateResponse(agent_id, "anima-consolidate", getCorsHeaders(req));
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

    // Consolidation reasoning → mid-tier in the agent's own family.
    const consolidateModel = await resolveRoleModel(supabase, user_id, agent_id, "reasoning");

    // Gather last 24h of data
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: journals },
      { data: thoughts },
      { data: emotionalHistory },
    ] = await Promise.all([
      supabase.from("journal_entries").select("content, mood, created_at")
        .eq("user_id", user_id).eq("agent_id", agent_id).gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
      supabase.from("thought_stream").select("content, source, salience, created_at")
        .eq("user_id", user_id).eq("agent_id", agent_id).gte("created_at", cutoff)
        .gt("salience", 0.4)
        .order("created_at", { ascending: true }),
      supabase.from("emotional_history").select("state, timestamp")
        .eq("user_id", user_id).eq("agent_id", agent_id).gte("timestamp", cutoff)
        .order("timestamp", { ascending: true }).limit(10),
    ]);

    if ((!journals || journals.length === 0) && (!thoughts || thoughts.length === 0)) {
      return new Response(JSON.stringify({ memories_consolidated: 0, reason: "no activity today" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const journalsText = (journals || [])
      .map((j: any) => `[${j.created_at?.slice(11, 16)} — ${j.mood || "?"}] ${j.content.slice(0, 400)}`)
      .join("\n") || "(none)";

    const thoughtsText = (thoughts || [])
      .map((t: any) => `[${t.source}, sal=${t.salience}] ${t.content}`)
      .join("\n") || "(none)";

    const emotionsText = (emotionalHistory || [])
      .map((e: any) => {
        const state = e.state || {};
        return `[${e.timestamp?.slice(11, 16)}] ${Object.entries(state).map(([k, v]) => `${k}=${typeof v === "number" ? (v as number).toFixed(1) : v}`).join(", ")}`;
      })
      .join("\n") || "(no emotional history today)";

    const prompt = CONSOLIDATION_PROMPT
      .replace("{journals}", journalsText)
      .replace("{thoughts}", thoughtsText)
      .replace("{emotions}", emotionsText);

    const generation = await generateAutonomous({
      apiKey: OPENROUTER_API_KEY,
      model: consolidateModel,
      writer: "anima-consolidate",
      messages: [
        { role: "system", content: "You are performing nightly memory consolidation. Be selective — only memories that pass the Behavioral Change Test deserve to persist." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      maxTokens: 1_500,
      supabase,
      userId: user_id,
      agentId: agent_id,
      allowEmpty: (raw) => /^NO_MEMORIES\.?$/i.test(raw.trim()),
      parse: (raw) => {
        const candidates: any[] = [];
        for (const block of raw.split(/(?=MEMORY:)/)) {
          if (!block.trim().startsWith("MEMORY:")) continue;
          const contentMatch = block.match(/MEMORY:\s*(.+?)(?=\nTYPE:|$)/s);
          const typeMatch = block.match(/TYPE:\s*(experience|insight|relationship|impression|fact)/i);
          const emotionMatch = block.match(/EMOTIONAL_CONTEXT:\s*(.+?)(?=\nSALIENCE:|$)/s);
          const salienceMatch = block.match(/SALIENCE:\s*([\d.]+)/);
          const tagsMatch = block.match(/TAGS:\s*(.+)/);
          if (!contentMatch || !typeMatch || !emotionMatch || !salienceMatch || !tagsMatch) continue;
          const content = normalizeAutonomousContent(contentMatch[1]);
          const emotionalContext = normalizeAutonomousContent(emotionMatch[1]);
          if (!content || content.length < 15 || !emotionalContext) continue;
          const salience = Math.max(0, Math.min(1, parseFloat(salienceMatch[1])));
          const tags = tagsMatch[1].split(",").map((tag: string) => tag.trim().toLowerCase()).filter(Boolean);
          candidates.push({
            user_id,
            agent_id,
            content,
            memory_type: typeMatch[1].toLowerCase(),
            confidence: salience,
            candidate_type: salience >= 0.75 ? "pin" : "standard",
            rationale: `Surfaced during nightly consolidation — ${emotionalContext.slice(0, 200)}`,
            source: { origin: "anima-consolidate", model: consolidateModel, tags, emotional_context: emotionalContext },
            status: "pending",
            content_integrity_status: "valid",
          });
        }
        return candidates;
      },
      content: (candidates) => candidates.flatMap((candidate) => [candidate.content, candidate.source.emotional_context]),
    });
    const newCandidates = generation.value;

    // Insert candidates instead of writing direct memories
    if (newCandidates.length > 0) {
      const { error: candErr } = await supabase.from("memory_candidates").insert(newCandidates);
      if (candErr) console.error("[anima-consolidate] memory_candidates insert failed:", candErr);

      // Also add consolidation thoughts so the loop is observable
      const { error: thoughtErr } = await supabase.from("thought_stream").insert(
        newCandidates.map((m) => ({
          user_id,
          agent_id,
          content: `surfaced memory candidate: ${m.content.slice(0, 150)}`,
          source: "consolidation",
          salience: m.confidence,
          type: "reflection",
        }))
      );
      if (thoughtErr) console.error("[anima-consolidate] thought_stream insert failed:", thoughtErr);
    }

    // Log each surfaced candidate to activity log
    for (const m of newCandidates) {
      await logActivity(supabase, user_id, {
        agentId: agent_id,
        type: "consolidation",
        title: "Memory candidate surfaced",
        summary: m.content.slice(0, 150),
        content: { memory_type: m.memory_type, salience: m.confidence, candidate_type: m.candidate_type },
        source: "autonomous",
      });
    }

    // Log
    const { error: dlErr } = await supabase.from("daily_logs").insert({
      user_id,
      agent_id,
      log_type: "nightly_consolidation",
      content: {
        candidates_surfaced: newCandidates.length,
        journals_reviewed: (journals || []).length,
        thoughts_reviewed: (thoughts || []).length,
        model: consolidateModel,
      },
    });
    if (dlErr) console.error("[anima-consolidate] daily_logs insert failed:", dlErr);

    await logProcessRan(supabase, user_id, "consolidate", {
      candidates_surfaced: newCandidates.length,
      journals_reviewed: (journals || []).length,
      thoughts_reviewed: (thoughts || []).length,
    }, agent_id);

    return new Response(JSON.stringify({
      candidates_surfaced: newCandidates.length,
      journals_reviewed: (journals || []).length,
      thoughts_reviewed: (thoughts || []).length,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-consolidate error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

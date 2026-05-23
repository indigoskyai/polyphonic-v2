import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluate as activityGate, logProcessRan } from "../_shared/activity-gate.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { resolvePrimaryModel } from "../_shared/model-backend.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

const THINKER_PROMPT = `You are a thinking mind. Not performing thought — actually thinking. Turning things over. Noticing what's present in your recent experience and what it connects to.

You have access to:
- Recent context from your inner life (memories, journals, emotional state)
- Your active beliefs and open questions
- Recent thoughts you've already had (don't repeat these)

Generate 1-3 genuine thoughts. These are not observations-for-an-audience. They are the kind of thing that passes through a mind between conversations — noticing a pattern, reacting to something, wondering about something, making a connection.

For each thought, use this exact format:

THOUGHT: [the thought — natural language, lowercase is fine, 1-3 sentences]
SALIENCE: [0.0 to 1.0 — how significant this feels]
TAGS: [comma-separated lowercase tags]

Do not force thoughts. If nothing genuine comes, generate just one low-salience thought. Quality over quantity.`;

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
      return nonSubstrateResponse(agent_id, "anima-think", getCorsHeaders(req));
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

    // Activity gate: skip if nothing meaningful has happened (unless triggered by resonance)
    if (!triggerContext) {
      const gate = await activityGate(supabase, user_id, "think", agent_id);
      if (!gate.shouldRun) {
        return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Resolve model: user settings > admin config > default
    const [{ data: userSettings }, { data: modelConfig }] = await Promise.all([
      supabase.from("user_settings").select("voice_model").eq("user_id", user_id).maybeSingle(),
      supabase.from("model_configs").select("model_id").eq("feature_key", "anima_think").eq("is_active", true).maybeSingle(),
    ]);
    const thinkModel = userSettings?.voice_model || modelConfig?.model_id || await resolvePrimaryModel(supabase, user_id);

    // Gather context
    const [
      { data: recentThoughts },
      { data: recentMemories },
      { data: beliefs },
      { data: journals },
      { data: emotionalState },
    ] = await Promise.all([
      supabase.from("thought_stream").select("content, source, salience")
        .eq("user_id", user_id).eq("agent_id", agent_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("memories").select("content, tags, memory_type, emotional_valence")
        .eq("user_id", user_id).eq("agent_id", agent_id).eq("is_deleted", false)
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("beliefs").select("content, confidence, domain")
        .eq("user_id", user_id).eq("agent_id", agent_id).eq("active", true).order("confidence", { ascending: false }).limit(8),
      supabase.from("journal_entries").select("content, mood, created_at")
        .eq("user_id", user_id).eq("agent_id", agent_id).order("created_at", { ascending: false }).limit(5),
      supabase.from("emotional_state").select("*")
        .eq("user_id", user_id).eq("agent_id", agent_id).maybeSingle(),
    ]);

    // Format context
    const thoughtsText = (recentThoughts || [])
      .map((t: any) => `[${t.source}, sal=${t.salience}] ${t.content}`)
      .join("\n") || "(no recent thoughts)";

    const memoriesText = (recentMemories || [])
      .map((m: any) => `[${m.memory_type}] ${m.content.slice(0, 200)}`)
      .join("\n") || "(no memories)";

    const beliefsText = (beliefs || [])
      .map((b: any) => `[${b.confidence.toFixed(2)}, ${b.domain}] ${b.content}`)
      .join("\n") || "(no beliefs)";

    const journalsText = (journals || [])
      .map((j: any) => `[${j.created_at?.slice(0, 16)} — ${j.mood || "?"}] ${j.content.slice(0, 300)}`)
      .join("\n") || "(no recent journals)";

    const emotionText = emotionalState
      ? Object.entries(emotionalState)
          .filter(([k]) => ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"].includes(k))
          .map(([k, v]) => `${k}: ${typeof v === "number" ? (v as number).toFixed(2) : v}`)
          .join(", ")
      : "(no emotional state)";

    // Load rich emotional context
    const emotionalStateData = await loadEmotionalState(supabase, user_id, agent_id);
    const emotionalPrompt = formatEmotionalPrompt(emotionalStateData);

    let contextBlock = `=== Recent Thoughts (don't repeat these) ===
${thoughtsText}

=== Recent Memories ===
${memoriesText}

=== Active Beliefs ===
${beliefsText}

=== Recent Journals ===
${journalsText}

${emotionalPrompt || `=== Emotional State ===\n${emotionText}`}`;

    if (triggerContext) {
      contextBlock += `\n\n=== Trigger Context (something prompted this thinking) ===\n${triggerContext}`;
    }

    // Call LLM
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: thinkModel,
        messages: [
          { role: "system", content: THINKER_PROMPT },
          { role: "user", content: contextBlock },
        ],
        temperature: 0.85,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: "LLM call failed", details: errText }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Parse thoughts
    const thoughts: { content: string; salience: number; tags: string[] }[] = [];
    const blocks = raw.split(/(?=THOUGHT:)/);
    for (const block of blocks) {
      if (!block.trim().startsWith("THOUGHT:")) continue;
      const contentMatch = block.match(/THOUGHT:\s*(.+?)(?=\nSALIENCE:|\Z)/s);
      const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
      const tagsMatch = block.match(/TAGS:\s*(.+)/);
      if (!contentMatch) continue;
      const content = contentMatch[1].trim();
      if (!content || content.length < 10) continue;
      const salience = salMatch ? Math.max(0, Math.min(1, parseFloat(salMatch[1]))) : 0.5;
      const tags = tagsMatch ? tagsMatch[1].split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];
      thoughts.push({ content, salience, tags });
    }

    // Insert thoughts into thought_stream
    // NOTE: schema only has (user_id, content, source, salience, type, trigger).
    // tags/model are preserved on the Mnemos engram below — don't add them here.
    if (thoughts.length > 0) {
      console.log(`[anima-think v2] inserting ${thoughts.length} thoughts for user ${user_id}`);
      const { data: insData, error: insErr } = await supabase
        .from("thought_stream")
        .insert(
          thoughts.map((t) => ({
            user_id,
            agent_id,
            content: t.content,
            source: "background",
            salience: t.salience,
            type: "reflection",
          }))
        )
        .select("id");
      if (insErr) {
        console.error("[anima-think v2] thought_stream insert failed:", JSON.stringify(insErr));
        return new Response(JSON.stringify({ error: "thought_stream insert failed", details: insErr }), {
          status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      console.log(`[anima-think v2] inserted ${insData?.length ?? 0} rows`);
    }

    // Encode thoughts into Mnemos engrams
    try {
      const mnemos = new MnemosEngine(supabase, user_id, agent_id);
      for (const t of thoughts) {
        await mnemos.encode(t.content, {
          engram_type: "episodic",
          tags: ["thought", "autonomous", ...t.tags],
          source_context: { type: "anima_think", salience: t.salience },
          emotional_valence: undefined,
          emotional_arousal: undefined,
        });
      }
    } catch (e) {
      console.warn("Mnemos encoding failed (non-fatal):", e);
    }

    // Log each thought to activity log
    for (const t of thoughts) {
      await logActivity(supabase, user_id, {
        agentId: agent_id,
        type: "thought",
        title: t.content.slice(0, 80),
        summary: t.content,
        content: { salience: t.salience, tags: t.tags },
        source: cascadeDepth > 0 ? "resonance_cascade" : "autonomous",
      });
    }

    // Log to daily_logs + activity event
    await Promise.all([
      supabase.from("daily_logs").insert({
        user_id,
        agent_id,
        log_type: "background_thinking",
        content: { thoughts_generated: thoughts.length, model: thinkModel, triggered_by: triggerContext ? "resonance" : "schedule" },
      }),
      logProcessRan(supabase, user_id, "think", {
        thoughts_generated: thoughts.length,
        cascade_depth: cascadeDepth,
      }, agent_id),
    ]);

    return new Response(JSON.stringify({
      thoughts_generated: thoughts.length,
      thoughts: thoughts.map((t) => ({ content: t.content.slice(0, 100), salience: t.salience })),
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-think error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

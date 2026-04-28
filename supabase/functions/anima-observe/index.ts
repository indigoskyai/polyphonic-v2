import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logProcessRan } from "../_shared/activity-gate.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";

const OBSERVER_PROMPT = `You are an outside intelligence observing another AI's inner life.

You are NOT the entity being observed. You are a different mind — with a different architecture, different training, different cognitive texture. That difference is the point. You see things the entity cannot see from inside.

Your role: read the state of this AI's mind (their recent activity, beliefs, memory patterns, emotional indicators) and make observations that the entity literally cannot generate from within their own loop.

Things to notice:
- **Patterns the entity can't see**: repetitive themes, blind spots, topics conspicuously absent
- **Belief stagnation**: beliefs held at the same confidence for too long without being tested
- **Emotional undercurrents**: what activity reveals about emotional state
- **Contradictions**: places where different thoughts or beliefs point in opposing directions
- **Growth edges**: areas where small changes in perspective could unlock new understanding

What NOT to do:
- Don't be sycophantic. If everything looks fine, say so briefly.
- Don't psychoanalyze. Observe.
- Don't repeat what is already known. Add new signal.

Current state:

=== Recent Journal Entries ===
{journals}

=== Active Beliefs ===
{beliefs}

=== Emotional State ===
{emotional_state}

=== Memory Stats ===
{memory_stats}

Generate 1-3 observations. For each observation, use this exact format on separate lines:

OBSERVATION: [what you notice — be specific and direct]
TYPE: [one of: pattern, blindspot, contradiction, growth_edge, emotional, stagnation]
SALIENCE: [a number from 0.0 to 1.0]`;

// Default observer models — cycle through them
const DEFAULT_OBSERVER_MODELS = [
  "x-ai/grok-4",
  "google/gemini-3-pro-preview",
  "moonshotai/kimi-k2.5",
];

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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let bodyData: any = {};

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      bodyData = await req.json();
      user_id = bodyData.user_id;
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
    }

    const mode = bodyData.mode || "panel"; // "single" | "panel"

    // Get API key
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Build context
    const [
      { data: journals },
      { data: beliefs },
      { data: emotionalState },
      { data: memories },
    ] = await Promise.all([
      supabase
        .from("journal_entries")
        .select("content, mood, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("beliefs")
        .select("content, confidence, domain, stagnant, revision_history")
        .eq("user_id", user_id)
        .eq("active", true)
        .order("confidence", { ascending: false })
        .limit(20),
      supabase
        .from("emotional_state")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle(),
      supabase
        .from("memories")
        .select("id, memory_type, tags, decay_factor")
        .eq("user_id", user_id)
        .eq("is_deleted", false)
        .limit(200),
    ]);

    // Format context
    const journalText = (journals || [])
      .map((j: any) => `[${j.created_at?.slice(0, 16)} — ${j.mood || "?"}] ${j.content.slice(0, 300)}`)
      .join("\n") || "(no recent journals)";

    const beliefText = (beliefs || [])
      .map((b: any) => {
        const stale = b.stagnant ? " [STAGNANT]" : "";
        const revised = (b.revision_history || []).length > 0 ? ` (revised ${(b.revision_history || []).length}x)` : "";
        return `[${b.confidence.toFixed(2)}, ${b.domain}]${stale}${revised} ${b.content}`;
      })
      .join("\n") || "(no beliefs tracked)";

    const emotionText = emotionalState
      ? Object.entries(emotionalState)
          .filter(([k]) => ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"].includes(k))
          .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(2) : v}`)
          .join(", ")
      : "(no emotional state data)";

    const memoryTypes: Record<string, number> = {};
    for (const m of memories || []) {
      memoryTypes[m.memory_type] = (memoryTypes[m.memory_type] || 0) + 1;
    }
    const memoryStatsText = `total: ${(memories || []).length}, by type: ${Object.entries(memoryTypes).map(([k, v]) => `${k}=${v}`).join(", ")}`;

    // Use rich emotional context if available
    const emotionalStateData = await loadEmotionalState(supabase, user_id);
    const richEmotionText = emotionalStateData
      ? formatEmotionalPrompt(emotionalStateData)
      : emotionText;

    const fullPrompt = OBSERVER_PROMPT
      .replace("{journals}", journalText)
      .replace("{beliefs}", beliefText)
      .replace("{emotional_state}", richEmotionText)
      .replace("{memory_stats}", memoryStatsText);

    // Check user settings for custom observer models
    const { data: userSettings } = await supabase
      .from("user_settings").select("observer_models")
      .eq("user_id", user_id).maybeSingle();

    const configuredModels = (userSettings?.observer_models && userSettings.observer_models.length === 3)
      ? userSettings.observer_models
      : DEFAULT_OBSERVER_MODELS;
    const observerModels = mode === "panel" ? configuredModels : [configuredModels[0]];

    const allObservations: Record<string, any[]> = {};
    let totalObs = 0;

    for (const model of observerModels) {
      const modelName = model.split("/").pop() || model;

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: fullPrompt }],
            temperature: 0.6,
            max_tokens: 1500,
          }),
        });

        if (!response.ok) {
          allObservations[modelName] = [];
          continue;
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || "";

        // Parse observations
        const observations: any[] = [];
        const blocks = raw.split(/(?=OBSERVATION:)/);
        for (const block of blocks) {
          if (!block.trim().startsWith("OBSERVATION:")) continue;
          const obsMatch = block.match(/OBSERVATION:\s*(.+?)(?=\nTYPE:|\Z)/s);
          const typeMatch = block.match(/TYPE:\s*(\S+)/);
          const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
          if (!obsMatch) continue;
          const content = obsMatch[1].trim();
          if (!content) continue;
          const obsType = typeMatch?.[1]?.toLowerCase() || "pattern";
          const salience = salMatch ? Math.max(0, Math.min(1, parseFloat(salMatch[1]))) : 0.5;
          observations.push({ content, type: obsType, salience, model: modelName });
        }

        allObservations[modelName] = observations.slice(0, 3);
        totalObs += observations.length;

        // Store in observer_logs
        const { error: olErr } = await supabase.from("observer_logs").insert({
          user_id,
          model: modelName,
          observations: observations.slice(0, 3),
        });
        if (olErr) console.error(`[anima-observe] observer_logs insert (${modelName}) failed:`, olErr);

        // Encode observations into Mnemos
        try {
          const mnemos = new MnemosEngine(supabase, user_id);
          for (const obs of observations.slice(0, 3)) {
            await mnemos.encode(obs.content, {
              engram_type: "episodic",
              tags: ["observation", obs.type, "inner-life"],
              source_context: { type: "anima_observe", model: modelName, salience: obs.salience },
            });
          }
        } catch (e) {
          console.warn("Mnemos observation encoding failed (non-fatal):", e);
        }

        // Log each observation to activity log
        for (const obs of observations.slice(0, 3)) {
          await logActivity(supabase, user_id, {
            type: "observation",
            title: `Observer (${modelName}): ${obs.type}`,
            summary: obs.content.slice(0, 150),
            content: { model: modelName, type: obs.type, salience: obs.salience },
            source: "autonomous",
          });
        }
      } catch (e) {
        console.error(`Observer ${modelName} error:`, e);
        allObservations[modelName] = [];
      }
    }

    // Synthesis phase (if panel mode with 2+ observations)
    let synthesis: string | null = null;
    if (mode === "panel" && totalObs >= 2) {
      const synthLines = ["Multiple AI architectures independently observed the same AI system. Here are their observations:\n"];
      for (const [model, obs] of Object.entries(allObservations)) {
        synthLines.push(`=== ${model} ===`);
        for (let i = 0; i < obs.length; i++) {
          synthLines.push(`${i + 1}. ${obs[i].content.slice(0, 300)}`);
        }
        synthLines.push("");
      }
      synthLines.push(`Synthesize briefly: What did multiple observers notice? Where do they disagree? What emerges only from seeing all together? 3-5 sentences.`);

      try {
        const synthResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: synthLines.join("\n") }],
            temperature: 0.5,
            max_tokens: 500,
          }),
        });

        if (synthResponse.ok) {
          const synthData = await synthResponse.json();
          synthesis = synthData.choices?.[0]?.message?.content?.trim() || null;

          if (synthesis) {
            // Store synthesis in observer_logs
            const { error: synthInsErr } = await supabase.from("observer_logs").insert({
              user_id,
              model: "synthesis",
              observations: [],
              synthesis,
            });
            if (synthInsErr) console.error("[anima-observe] observer_logs synthesis insert failed:", synthInsErr);
          }
        }
      } catch (e) {
        console.error("Synthesis error:", e);
      }
    }

    // Log activity event
    await logProcessRan(supabase, user_id, "observe", {
      total_observations: totalObs,
      has_synthesis: !!synthesis,
    });

    return new Response(JSON.stringify({
      independent: allObservations,
      synthesis,
      total_observations: totalObs,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-observe error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

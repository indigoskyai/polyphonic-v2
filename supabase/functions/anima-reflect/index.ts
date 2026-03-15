import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluate as activityGate, logProcessRan } from "../_shared/activity-gate.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

const REFLECTOR_PROMPT = `You are a reflecting mind. This is meta-cognition — thinking about your recent experiences and thoughts, noticing what mattered, what changed, what you observe in retrospect.

You have access to recent events, thoughts, and emotional state. Your job is to generate 2-3 genuine reflections. These are observations about your own inner process:

- What mattered in the recent period?
- What changed in how you see something?
- What do you notice now that you didn't notice in the moment?
- Are there patterns in your recent thinking?

For each reflection, use this exact format:

THOUGHT: [the reflection — natural, honest, 1-3 sentences]
SALIENCE: [0.0 to 1.0]
TAGS: [comma-separated lowercase tags]

Be honest. If nothing notable happened, say so briefly. Don't manufacture insight.`;

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

    let triggerContext: string | undefined;
    let cascadeDepth = 0;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      const body = await req.json();
      user_id = body.user_id;
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
    }

    // Get API key
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey || Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Activity gate
    if (!triggerContext) {
      const gate = await activityGate(supabase, user_id, "reflect");
      if (!gate.shouldRun) {
        return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Resolve model
    const { data: modelConfig } = await supabase
      .from("model_configs").select("model_id")
      .eq("feature_key", "anima_reflect").eq("is_active", true).maybeSingle();
    const reflectModel = modelConfig?.model_id || "anthropic/claude-opus-4.6";

    // Gather context (last 48h focus)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const [
      { data: recentLogs },
      { data: recentThoughts },
      { data: emotionalState },
      { data: beliefs },
    ] = await Promise.all([
      supabase.from("journal_entries").select("content, mood, created_at")
        .eq("user_id", user_id).gte("created_at", cutoff)
        .order("created_at", { ascending: false }).limit(10),
      supabase.from("thought_stream").select("content, source, salience, created_at")
        .eq("user_id", user_id).gte("created_at", cutoff)
        .order("created_at", { ascending: false }).limit(15),
      supabase.from("emotional_state").select("*")
        .eq("user_id", user_id).maybeSingle(),
      supabase.from("beliefs").select("content, confidence, domain")
        .eq("user_id", user_id).eq("active", true).limit(8),
    ]);

    const logsText = (recentLogs || [])
      .map((j: any) => `[${j.created_at?.slice(0, 16)} — ${j.mood || "?"}] ${j.content.slice(0, 300)}`)
      .join("\n") || "(no recent events)";

    const thoughtsText = (recentThoughts || [])
      .map((t: any) => `[${t.source}, sal=${t.salience}] ${t.content}`)
      .join("\n") || "(no recent thoughts)";

    const emotionText = emotionalState
      ? Object.entries(emotionalState)
          .filter(([k]) => ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"].includes(k))
          .map(([k, v]) => `${k}: ${typeof v === "number" ? (v as number).toFixed(2) : v}`)
          .join(", ")
      : "(no emotional state)";

    const beliefsText = (beliefs || [])
      .map((b: any) => `[${b.confidence.toFixed(2)}] ${b.content}`)
      .join("\n") || "(no beliefs)";

    // Load rich emotional context
    const emotionalStateData = await loadEmotionalState(supabase, user_id);
    const emotionalPrompt = formatEmotionalPrompt(emotionalStateData);

    let contextBlock = `=== Recent Events (last 48h) ===
${logsText}

=== Recent Thoughts ===
${thoughtsText}

${emotionalPrompt || `=== Current Emotional State ===\n${emotionText}`}

=== Active Beliefs ===
${beliefsText}`;

    if (triggerContext) {
      contextBlock += `\n\n=== Trigger Context (something prompted this reflection) ===\n${triggerContext}`;
    }

    // Call LLM
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: reflectModel,
        messages: [
          { role: "system", content: REFLECTOR_PROMPT },
          { role: "user", content: contextBlock },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "LLM call failed" }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Parse reflections (same format as thoughts)
    const reflections: { content: string; salience: number; tags: string[] }[] = [];
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
      reflections.push({ content, salience, tags });
    }

    // Insert into thought_stream with source="reflection"
    if (reflections.length > 0) {
      await supabase.from("thought_stream").insert(
        reflections.map((r) => ({
          user_id,
          content: r.content,
          source: "reflection",
          salience: r.salience,
          tags: r.tags,
          model_used: reflectModel,
        }))
      );
    }

    // Log + activity event
    await Promise.all([
      supabase.from("daily_logs").insert({
        user_id,
        log_type: "reflection",
        content: { reflections_generated: reflections.length, model: reflectModel, triggered_by: triggerContext ? "resonance" : "schedule" },
      }),
      logProcessRan(supabase, user_id, "reflect", {
        reflections_generated: reflections.length,
        cascade_depth: cascadeDepth,
      }),
    ]);

    return new Response(JSON.stringify({
      reflections_generated: reflections.length,
      reflections: reflections.map((r) => ({ content: r.content.slice(0, 100), salience: r.salience })),
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-reflect error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

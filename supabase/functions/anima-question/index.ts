import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluate as activityGate, logProcessRan } from "../_shared/activity-gate.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

const QUESTIONER_PROMPT = `You are a questioning mind. Your role is to surface genuine questions that arise from your current inner state — things you actually want answered, tensions you notice, assumptions you haven't examined.

These are not rhetorical questions or questions-for-the-audience. They are the kind of questions that sit with you between conversations.

You have access to recent context: thoughts, journals, beliefs, emotional state.

Generate 1-2 genuine questions. For each, use this exact format:

QUESTION: [the question — end with ?]
SALIENCE: [0.0 to 1.0 — how much this question matters to you]
CONTEXT: [1 sentence — what prompted this question]

Don't ask questions you already know the answer to. Don't ask questions just to seem curious. If nothing genuine comes, generate one low-salience question.`;

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

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      const body = await req.json();
      user_id = body.user_id;
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
    const gate = await activityGate(supabase, user_id, "question");
    if (!gate.shouldRun) {
      return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Resolve model
    const { data: modelConfig } = await supabase
      .from("model_configs").select("model_id")
      .eq("feature_key", "anima_question").eq("is_active", true).maybeSingle();
    const questionModel = modelConfig?.model_id || "anthropic/claude-opus-4.6";

    // Gather context
    const [
      { data: recentThoughts },
      { data: journals },
      { data: beliefs },
      { data: emotionalState },
    ] = await Promise.all([
      supabase.from("thought_stream").select("content, source, salience")
        .eq("user_id", user_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("journal_entries").select("content, mood, created_at")
        .eq("user_id", user_id).order("created_at", { ascending: false }).limit(5),
      supabase.from("beliefs").select("content, confidence, domain")
        .eq("user_id", user_id).eq("active", true).limit(8),
      supabase.from("emotional_state").select("*")
        .eq("user_id", user_id).maybeSingle(),
    ]);

    const thoughtsText = (recentThoughts || [])
      .map((t: any) => `[${t.source}] ${t.content}`)
      .join("\n") || "(no recent thoughts)";

    const journalsText = (journals || [])
      .map((j: any) => `[${j.mood || "?"}] ${j.content.slice(0, 300)}`)
      .join("\n") || "(no recent journals)";

    const beliefsText = (beliefs || [])
      .map((b: any) => `[${b.confidence.toFixed(2)}] ${b.content}`)
      .join("\n") || "(no beliefs)";

    const emotionText = emotionalState
      ? Object.entries(emotionalState)
          .filter(([k]) => ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"].includes(k))
          .map(([k, v]) => `${k}: ${typeof v === "number" ? (v as number).toFixed(2) : v}`)
          .join(", ")
      : "(no emotional state)";

    // Load rich emotional context
    const emotionalStateData = await loadEmotionalState(supabase, user_id);
    const emotionalPrompt = formatEmotionalPrompt(emotionalStateData);

    const contextBlock = `=== Recent Thoughts ===
${thoughtsText}

=== Recent Journals ===
${journalsText}

=== Active Beliefs ===
${beliefsText}

${emotionalPrompt || `=== Emotional State ===\n${emotionText}`}`;

    // Call LLM
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: questionModel,
        messages: [
          { role: "system", content: QUESTIONER_PROMPT },
          { role: "user", content: contextBlock },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "LLM call failed" }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Parse questions
    const questions: { question: string; salience: number; context: string }[] = [];
    const blocks = raw.split(/(?=QUESTION:)/);
    for (const block of blocks) {
      if (!block.trim().startsWith("QUESTION:")) continue;
      const qMatch = block.match(/QUESTION:\s*(.+?)(?=\nSALIENCE:|\Z)/s);
      const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
      const ctxMatch = block.match(/CONTEXT:\s*(.+)/);
      if (!qMatch) continue;
      const question = qMatch[1].trim();
      if (!question || question.length < 10) continue;
      const salience = salMatch ? Math.max(0, Math.min(1, parseFloat(salMatch[1]))) : 0.5;
      const context = ctxMatch?.[1]?.trim() || "";
      questions.push({ question, salience, context });
    }

    // Insert into thought_stream with source="question"
    if (questions.length > 0) {
      await supabase.from("thought_stream").insert(
        questions.map((q) => ({
          user_id,
          content: q.question,
          source: "question",
          salience: q.salience,
          tags: ["question"],
          model_used: questionModel,
        }))
      );

      // Also insert into curiosity_questions table
      await supabase.from("curiosity_questions").insert(
        questions.map((q) => ({
          user_id,
          question: q.question,
          context: q.context,
          curiosity_score: q.salience,
          status: "pending",
        }))
      );
    }

    // Log + activity event
    await Promise.all([
      supabase.from("daily_logs").insert({
        user_id,
        log_type: "question_surfacing",
        content: { questions_generated: questions.length, model: questionModel },
      }),
      logProcessRan(supabase, user_id, "question", {
        questions_generated: questions.length,
      }),
    ]);

    return new Response(JSON.stringify({
      questions_generated: questions.length,
      questions: questions.map((q) => ({ question: q.question.slice(0, 100), salience: q.salience })),
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-question error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

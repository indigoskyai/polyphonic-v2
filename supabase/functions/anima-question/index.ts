import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAutonomous, normalizeAutonomousContent } from "../_shared/autonomous-generation.ts";
import { resolveRoleModel } from "../_shared/model-backend.ts";
import { evaluate as activityGate, logProcessRan } from "../_shared/activity-gate.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

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
      return nonSubstrateResponse(agent_id, "anima-question", getCorsHeaders(req));
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

    // Activity gate
    const gate = await activityGate(supabase, user_id, "question", agent_id);
    if (!gate.shouldRun) {
      return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Curiosity surfacing is REASONING → mid-tier in the agent's own family.
    const questionModel = await resolveRoleModel(supabase, user_id, agent_id, "reasoning");

    // Gather context
    const [
      { data: recentThoughts },
      { data: journals },
      { data: beliefs },
      { data: emotionalState },
    ] = await Promise.all([
      supabase.from("thought_stream").select("content, source, salience")
        .eq("user_id", user_id).eq("agent_id", agent_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("journal_entries").select("content, mood, created_at")
        .eq("user_id", user_id).eq("agent_id", agent_id).order("created_at", { ascending: false }).limit(5),
      supabase.from("beliefs").select("content, confidence, domain")
        .eq("user_id", user_id).eq("agent_id", agent_id).eq("active", true).limit(8),
      supabase.from("emotional_state").select("*")
        .eq("user_id", user_id).eq("agent_id", agent_id).maybeSingle(),
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
    const emotionalStateData = await loadEmotionalState(supabase, user_id, agent_id);
    const emotionalPrompt = formatEmotionalPrompt(emotionalStateData);

    const contextBlock = `=== Recent Thoughts ===
${thoughtsText}

=== Recent Journals ===
${journalsText}

=== Active Beliefs ===
${beliefsText}

${emotionalPrompt || `=== Emotional State ===\n${emotionText}`}`;

    const generation = await generateAutonomous({
      apiKey: OPENROUTER_API_KEY,
      model: questionModel,
      writer: "anima-question",
      messages: [
        { role: "system", content: QUESTIONER_PROMPT },
        { role: "user", content: contextBlock },
      ],
      temperature: 0.7,
      maxTokens: 512,
      supabase,
      userId: user_id,
      agentId: agent_id,
      parse: (raw) => {
        const questions: { question: string; salience: number; context: string }[] = [];
        for (const block of raw.split(/(?=QUESTION:)/)) {
          if (!block.trim().startsWith("QUESTION:")) continue;
          const questionMatch = block.match(/QUESTION:\s*(.+?)(?=\nSALIENCE:|$)/s);
          const salienceMatch = block.match(/SALIENCE:\s*([\d.]+)/);
          const contextMatch = block.match(/CONTEXT:\s*(.+)/);
          if (!questionMatch || !salienceMatch || !contextMatch) continue;
          const question = normalizeAutonomousContent(questionMatch[1]);
          const context = normalizeAutonomousContent(contextMatch[1]);
          if (!question.endsWith("?") || question.length < 10 || !context) continue;
          questions.push({
            question,
            salience: Math.max(0, Math.min(1, parseFloat(salienceMatch[1]))),
            context,
          });
        }
        return questions;
      },
      content: (questions) => questions.flatMap((question) => [question.question, question.context]),
    });
    const questions = generation.value;

    // Insert into thought_stream with source="question"
    if (questions.length > 0) {
      const { error: thoughtErr } = await supabase.from("thought_stream").insert(
        questions.map((q) => ({
          user_id,
          agent_id,
          content: q.question,
          source: "question",
          salience: q.salience,
          type: "question",
        }))
      );
      if (thoughtErr) console.error("[anima-question] thought_stream insert failed:", thoughtErr);

      // Also insert into curiosity_questions table
      const { error: cqErr } = await supabase.from("curiosity_questions").insert(
        questions.map((q) => ({
          user_id,
          agent_id,
          question: q.question,
          context: q.context,
          curiosity_score: q.salience,
          status: "pending",
        }))
      );
      if (cqErr) console.error("[anima-question] curiosity_questions insert failed:", cqErr);
    }

    // Log each question to activity log
    for (const q of questions) {
      await logActivity(supabase, user_id, {
        agentId: agent_id,
        type: "question",
        title: q.question.slice(0, 80),
        summary: q.question,
        content: { salience: q.salience, context: q.context },
        source: "autonomous",
      });
    }

    // Log + activity event
    await Promise.all([
      supabase.from("daily_logs").insert({
        user_id,
        agent_id,
        log_type: "question_surfacing",
        content: { questions_generated: questions.length, model: questionModel },
      }),
      logProcessRan(supabase, user_id, "question", {
        questions_generated: questions.length,
      }, agent_id),
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

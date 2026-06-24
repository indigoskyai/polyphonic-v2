// Agent-to-agent consultation runner.
//
// Service-role-only entrypoint. Called from anima-tool-execute when Luca
// invokes the `consult_anima` tool (or, later, `consult_vektor`). Routes the
// question to the consulted agent's system prompt + model, persists the
// pending → completed lifecycle in `agent_consultations`, and returns the
// response so Luca can weave it into the final reply.
//
// The user sees the dialogue live via realtime on agent_consultations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { buildAnimaConsultPrompt } from "../_shared/agents/anima-soul.ts";
import { loadHypomnema } from "../_shared/hypomnema/index.ts";

// EXEMPT from the agent-family model rule: Anima is a distinct entity (the wise,
// contemplative consultant), not the consulting agent. She answers in her OWN
// deliberate voice — a deep, high-capability model — regardless of which agent
// (Luca/quill/etc.) consults her. OpenRouter keys reach every provider, so this
// works for any user. A role-optimized model choice, not family routing.
const ANIMA_MODEL = "anthropic/claude-opus-4-7";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_QUESTION_CHARS = 2000;
const MAX_CONTEXT_CHARS = 4000;

interface ConsultPayload {
  user_id: string;
  from_agent?: string;
  to_agent: string;
  question: string;
  parent_thread_id?: string;
  parent_message_id?: string;
  conversation_context?: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${serviceRole}`) {
      return json({ error: "service_role only" }, 401, corsHeaders);
    }

    const body = (await req.json().catch(() => ({}))) as Partial<ConsultPayload>;
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    const toAgent = typeof body.to_agent === "string" ? body.to_agent.trim() : "";
    const fromAgent = typeof body.from_agent === "string" ? body.from_agent.trim() : "luca";
    const questionRaw = typeof body.question === "string" ? body.question.trim() : "";
    const contextRaw = typeof body.conversation_context === "string"
      ? body.conversation_context.trim()
      : "";
    const parentThreadId = typeof body.parent_thread_id === "string" ? body.parent_thread_id : null;
    const parentMessageId = typeof body.parent_message_id === "string" ? body.parent_message_id : null;

    if (!userId) return json({ error: "user_id required" }, 400, corsHeaders);
    if (!toAgent) return json({ error: "to_agent required" }, 400, corsHeaders);
    if (!questionRaw) return json({ error: "question required" }, 400, corsHeaders);

    const question = questionRaw.slice(0, MAX_QUESTION_CHARS);
    const context = contextRaw.slice(0, MAX_CONTEXT_CHARS);

    const supabase = createClient(url, serviceRole);

    const { data: apiKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey = typeof apiKeyData === "string" ? apiKeyData.trim() : "";
    if (!apiKey) return json({ error: "user has no OpenRouter key configured" }, 400, corsHeaders);

    const { data: inserted, error: insertError } = await supabase
      .from("agent_consultations")
      .insert({
        user_id: userId,
        parent_thread_id: parentThreadId,
        parent_message_id: parentMessageId,
        from_agent: fromAgent || "luca",
        to_agent: toAgent,
        question,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return json({ error: insertError?.message || "Failed to record consultation" }, 500, corsHeaders);
    }

    const consultationId = inserted.id as string;

    try {
      // Load hypomnema for the consulted agent so they show up carrying their
      // interior state about this user (including any observer notes from
      // prior consultations). Empty on first contact = safe.
      const hypomnemaResult = await loadHypomnema(supabase, userId, toAgent).catch(() => ({ block: "" }));

      const { systemPrompt, model } = buildAgentPrompt({
        toAgent,
        fromAgent: fromAgent || "luca",
        question,
        conversationContext: context,
        hypomnemaBlock: hypomnemaResult.block,
      });

      const response = await callModel(apiKey, model, systemPrompt, question);
      const completedAt = new Date().toISOString();

      await supabase
        .from("agent_consultations")
        .update({
          response: response.text,
          status: "completed",
          model_used: model,
          tokens_used: response.tokens ?? null,
          completed_at: completedAt,
        })
        .eq("id", consultationId);

      return json({
        ok: true,
        consultation_id: consultationId,
        from_agent: fromAgent || "luca",
        to_agent: toAgent,
        question,
        response: response.text,
        model_used: model,
      }, 200, corsHeaders);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[agent-consult] ${toAgent} failed:`, message);

      await supabase
        .from("agent_consultations")
        .update({
          status: "failed",
          error: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("id", consultationId);

      return json({
        ok: false,
        consultation_id: consultationId,
        error: message,
      }, 200, corsHeaders);
    }
  } catch (err) {
    console.error("agent-consult fatal:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

interface AgentPromptInputs {
  toAgent: string;
  fromAgent: string;
  question: string;
  conversationContext: string;
  hypomnemaBlock?: string;
}

interface AgentPromptResult {
  systemPrompt: string;
  model: string;
}

function buildAgentPrompt(inputs: AgentPromptInputs): AgentPromptResult {
  if (inputs.toAgent === "anima") {
    return {
      systemPrompt: buildAnimaConsultPrompt({
        fromAgent: inputs.fromAgent,
        conversationContext: inputs.conversationContext,
        question: inputs.question,
        hypomnemaBlock: inputs.hypomnemaBlock,
      }),
      model: ANIMA_MODEL,
    };
  }
  // Future: vektor consult routing.
  throw new Error(`Unknown consult target: ${inputs.toAgent}`);
}

async function callModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
): Promise<{ text: string; tokens: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Agent Consult",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.6,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 240)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Empty response from model");
    }

    const tokens = typeof data?.usage?.total_tokens === "number" ? data.usage.total_tokens : null;
    return { text: text.trim(), tokens };
  } finally {
    clearTimeout(timer);
  }
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

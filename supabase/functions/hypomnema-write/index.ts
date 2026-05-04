// hypomnema-write — async post-turn reflection writer.
//
// Service-role-only entrypoint, dispatched fire-and-forget from chat-multi
// after the salience gate triggers. Writes a single hypomnema_entry row
// (or revises an existing one) in the agent's voice using the reflection
// prompt for primary density, observer_note prompt for observer density.
//
// Asymmetric witnessing (M5) calls this once per participating agent with
// appropriate density.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { writeHypomnemaEntry } from "../_shared/hypomnema/index.ts";
import { isMemoryAugmentationEnabled } from "../_shared/config.ts";

interface WritePayload {
  user_id: string;
  agent_id: string;
  thread_id?: string | null;
  source_message_id?: string | null;
  density?: "primary" | "observer";
  primary_in_thread?: boolean;
  user_message: string;
  agent_response: string;
  recent_turns?: Array<{ role: string; content: string }>;
  // Observer-density only:
  primary_agent_name?: string;
  primary_response?: string;
  your_contribution?: string;
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

    const body = (await req.json().catch(() => ({}))) as Partial<WritePayload>;
    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const agentId = typeof body.agent_id === "string" ? body.agent_id : "";
    const userMessage = typeof body.user_message === "string" ? body.user_message : "";
    const agentResponse = typeof body.agent_response === "string" ? body.agent_response : "";
    const density = body.density === "observer" ? "observer" : "primary";

    if (!userId || !agentId) return json({ error: "user_id + agent_id required" }, 400, corsHeaders);
    if (!userMessage || !agentResponse) {
      return json({ status: "skipped", reason: "empty turn input" }, 200, corsHeaders);
    }

    if (!isMemoryAugmentationEnabled(userId)) {
      return json({ status: "skipped", reason: "memory augmentation disabled" }, 200, corsHeaders);
    }

    const supabase = createClient(url, serviceRole);
    const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey = typeof keyData === "string" ? keyData.trim() : "";
    if (!apiKey) {
      return json({ status: "skipped", reason: "no api key" }, 200, corsHeaders);
    }

    const result = await writeHypomnemaEntry(supabase, apiKey, {
      agentId,
      userId,
      threadId: body.thread_id ?? null,
      sourceMessageId: body.source_message_id ?? null,
      density,
      primaryInThread: body.primary_in_thread ?? (density === "primary"),
      userMessage,
      agentResponse,
      recentTurns: Array.isArray(body.recent_turns) ? body.recent_turns : [],
      primaryAgentName: body.primary_agent_name,
      primaryResponse: body.primary_response,
      yourContribution: body.your_contribution,
    });

    return json(result, 200, corsHeaders);
  } catch (err) {
    console.error("[hypomnema-write] error:", err);
    return json({ status: "error", reason: `error: ${(err as Error).message}` }, 200, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

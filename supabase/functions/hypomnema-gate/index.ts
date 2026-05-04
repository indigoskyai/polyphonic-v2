// hypomnema-gate — synchronous post-turn salience classifier.
//
// Service-role-only entrypoint, called from chat-multi after streaming
// finishes. Cheap Haiku call (<500ms p95) that decides whether the turn
// warrants a full reflection write. If yes, the caller dispatches
// hypomnema-write asynchronously.
//
// See _shared/hypomnema/write.ts for the gate logic and prompts/salience_gate.md
// for the prompt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { runSalienceGate } from "../_shared/hypomnema/index.ts";
import { isMemoryAugmentationEnabled } from "../_shared/config.ts";

interface GatePayload {
  user_id: string;
  user_message: string;
  agent_response: string;
  recent_turns?: Array<{ role: string; content: string }>;
  /**
   * Optional chain target. If present and the gate returns should_reflect=true,
   * hypomnema-write is dispatched (fire-and-forget) with this payload merged
   * with user/turn fields. Lets chat-multi fire a single call.
   */
  chain_write?: {
    agent_id: string;
    thread_id?: string | null;
    source_message_id?: string | null;
    density?: "primary" | "observer";
    primary_in_thread?: boolean;
  } | Array<{
    agent_id: string;
    thread_id?: string | null;
    source_message_id?: string | null;
    density?: "primary" | "observer";
    primary_in_thread?: boolean;
  }>;
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

    const body = (await req.json().catch(() => ({}))) as Partial<GatePayload>;
    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const userMessage = typeof body.user_message === "string" ? body.user_message : "";
    const agentResponse = typeof body.agent_response === "string" ? body.agent_response : "";
    const recentTurns = Array.isArray(body.recent_turns) ? body.recent_turns : [];

    if (!userId) return json({ error: "user_id required" }, 400, corsHeaders);
    if (!userMessage || !agentResponse) {
      return json({ should_reflect: false, reason: "empty turn input" }, 200, corsHeaders);
    }

    if (!isMemoryAugmentationEnabled(userId)) {
      return json({ should_reflect: false, reason: "memory augmentation disabled" }, 200, corsHeaders);
    }

    const supabase = createClient(url, serviceRole);
    const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey = typeof keyData === "string" ? keyData.trim() : "";
    if (!apiKey) {
      return json({ should_reflect: false, reason: "no api key" }, 200, corsHeaders);
    }

    const result = await runSalienceGate(apiKey, {
      userMessage,
      agentResponse,
      recentTurns,
    });

    // Chain to hypomnema-write if requested and gate triggered.
    // Fire-and-forget — chat-multi already returned to the user.
    if (result.should_reflect && body.chain_write) {
      const targets = Array.isArray(body.chain_write) ? body.chain_write : [body.chain_write];
      const writeBaseUrl = `${url}/functions/v1/hypomnema-write`;
      for (const target of targets) {
        const writeBody = {
          user_id: userId,
          agent_id: target.agent_id,
          thread_id: target.thread_id ?? null,
          source_message_id: target.source_message_id ?? null,
          density: target.density ?? "primary",
          primary_in_thread: target.primary_in_thread ?? (target.density !== "observer"),
          user_message: userMessage,
          agent_response: agentResponse,
          recent_turns: recentTurns,
        };
        fetch(writeBaseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRole}`,
          },
          body: JSON.stringify(writeBody),
        }).catch((e) => console.warn(`[hypomnema-gate] write dispatch (${target.agent_id}) failed:`, e));
      }
    }

    return json(result, 200, corsHeaders);
  } catch (err) {
    console.error("[hypomnema-gate] error:", err);
    return json({ should_reflect: false, reason: `error: ${(err as Error).message}` }, 200, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

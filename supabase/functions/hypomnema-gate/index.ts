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
import { resolveOpenRouterKeyForUser } from "../_shared/model-backend.ts";

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
  chain_write?: ChainWriteTarget | ChainWriteTarget[];
}

interface ChainWriteTarget {
  agent_id: string;
  thread_id?: string | null;
  source_message_id?: string | null;
  density?: "primary" | "observer";
  primary_in_thread?: boolean;
  /** Observer-density only: the primary agent's name + response + the
   *  observer's own contribution to the turn (consult/council output). */
  primary_agent_name?: string;
  primary_response?: string;
  your_contribution?: string;
}

interface WriteDispatchResult {
  agent_id: string;
  status: number | "error";
  body: unknown;
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

    const supabase = createClient(url, serviceRole);

    if (!isMemoryAugmentationEnabled(userId)) {
      await recordHypomnemaActivity(supabase, {
        userId,
        title: "Hypomnema skipped",
        summary: "Memory augmentation disabled.",
        severity: "warning",
        content: { should_reflect: false, reason: "memory augmentation disabled" },
      });
      return json({ should_reflect: false, reason: "memory augmentation disabled" }, 200, corsHeaders);
    }

    const { apiKey } = await resolveOpenRouterKeyForUser(supabase, userId);
    if (!apiKey) {
      await recordHypomnemaActivity(supabase, {
        userId,
        title: "Hypomnema skipped",
        summary: "No user or platform OpenRouter key was available.",
        severity: "warning",
        content: { should_reflect: false, reason: "no api key" },
      });
      return json({ should_reflect: false, reason: "no api key" }, 200, corsHeaders);
    }

    const result = await runSalienceGate(apiKey, {
      userMessage,
      agentResponse,
      recentTurns,
    });

    // Chain to hypomnema-write if requested and gate triggered.
    // This gate itself runs in a background finalization task, so awaiting the
    // write here gives us inspectable success/failure without delaying chat.
    let writes: WriteDispatchResult[] = [];
    if (result.should_reflect && body.chain_write) {
      const targets = Array.isArray(body.chain_write) ? body.chain_write : [body.chain_write];
      const writeBaseUrl = `${url}/functions/v1/hypomnema-write`;
      writes = await Promise.all(targets.map(async (target): Promise<WriteDispatchResult> => {
        const writeBody: Record<string, unknown> = {
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
        if (target.density === "observer") {
          if (target.primary_agent_name) writeBody.primary_agent_name = target.primary_agent_name;
          if (target.primary_response) writeBody.primary_response = target.primary_response;
          if (target.your_contribution) writeBody.your_contribution = target.your_contribution;
        }
        try {
          const resp = await fetch(writeBaseUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRole}`,
            },
            body: JSON.stringify(writeBody),
          });
          const responseBody = await resp.json().catch(async () => ({ raw: await resp.text().catch(() => "") }));
          if (!resp.ok) {
            console.warn(`[hypomnema-gate] write dispatch (${target.agent_id}) returned ${resp.status}:`, responseBody);
          }
          return { agent_id: target.agent_id, status: resp.status, body: responseBody };
        } catch (e) {
          console.warn(`[hypomnema-gate] write dispatch (${target.agent_id}) failed:`, e);
          return {
            agent_id: target.agent_id,
            status: "error",
            body: e instanceof Error ? e.message : String(e),
          };
        }
      }));
    }

    await recordHypomnemaActivity(supabase, {
      userId,
      title: result.should_reflect ? "Hypomnema gate triggered" : "Hypomnema skipped",
      summary: result.reason || (result.should_reflect ? "Reflection queued." : "Gate skipped reflection."),
      severity: result.should_reflect && writes.some(writeDispatchFailed)
        ? "warning"
        : "info",
      content: {
        should_reflect: result.should_reflect,
        reason: result.reason,
        weight: result.weight,
        writes,
      },
    });

    return json({ ...result, writes }, 200, corsHeaders);
  } catch (err) {
    console.error("[hypomnema-gate] error:", err);
    return json({ should_reflect: false, reason: `error: ${(err as Error).message}` }, 200, getCorsHeaders(req));
  }
});

function writeDispatchFailed(result: WriteDispatchResult): boolean {
  if (result.status === "error") return true;
  if (typeof result.status === "number" && result.status >= 400) return true;
  const body = result.body;
  return Boolean(
    body &&
      typeof body === "object" &&
      "status" in body &&
      (body as { status?: unknown }).status === "error"
  );
}

async function recordHypomnemaActivity(
  // deno-lint-ignore no-explicit-any -- shared edge helper accepts the service client shape.
  supabase: any,
  opts: {
    userId: string;
    title: string;
    summary: string;
    severity: "info" | "warning" | "error";
    content: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("entity_activity_log").insert({
    user_id: opts.userId,
    activity_type: "hypomnema_gate",
    title: opts.title,
    summary: opts.summary,
    source: "hypomnema",
    severity: opts.severity,
    surface_to_user: false,
    content: opts.content,
  }).then(({ error }: { error?: { message?: string } | null }) => {
    if (error) console.warn("[hypomnema-gate] activity log failed:", error.message);
  });
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

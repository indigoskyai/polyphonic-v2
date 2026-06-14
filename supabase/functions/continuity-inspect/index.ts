// continuity-inspect — authenticated thread continuity drawer payload.
//
// Returns a sanitized view of the same continuity packet used by chat prompt
// assembly: bridge text, layer diagnostics, hypomnema preview, reliable memory,
// and Mnemos associations. No model call; this is deterministic inspection.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  loadContinuityPacket,
  summarizeContinuityPacket,
} from "../_shared/continuity/index.ts";
import {
  getClassicMemoryAgentIds,
  normalizeChatRuntimeMode,
} from "../_shared/classic-chat.ts";

type Body = {
  thread_id?: string;
  focus?: string;
};

function resolveThreadAgentId(thread: { agent_id?: unknown; primary_agent_id?: unknown } | null | undefined): string {
  const active = typeof thread?.agent_id === "string" ? thread.agent_id.trim() : "";
  const primary = typeof thread?.primary_agent_id === "string" ? thread.primary_agent_id.trim() : "";
  return active || primary || "luca";
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const threadId = typeof body.thread_id === "string" ? body.thread_id.trim() : "";
  if (!threadId) {
    return json({ error: "thread_id_required" }, 400, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, user_id, title, agent_id, primary_agent_id, runtime_mode, selected_model, memory_enabled")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (threadError) {
    return json({ error: threadError.message || "thread_lookup_failed" }, 500, cors);
  }
  if (!thread) {
    return json({ error: "thread_not_found" }, 404, cors);
  }

  const { data: latestUserMessage } = await supabase
    .from("messages")
    .select("content")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const focus =
    typeof body.focus === "string" && body.focus.trim()
      ? body.focus.trim().slice(0, 2000)
      : String(latestUserMessage?.content || thread.title || "where did this thread leave off?").slice(0, 2000);

  const agentId = resolveThreadAgentId(thread);
  const runtimeMode = normalizeChatRuntimeMode(thread.runtime_mode, "agent");
  const classicRuntime = agentId === "luca" && runtimeMode === "classic";
  const memoryEnabled = thread.memory_enabled !== false;

  const packet = await loadContinuityPacket(supabase, {
    userId: user.id,
    agentId,
    threadId,
    userMessage: focus,
    memoryAgentIds: classicRuntime ? getClassicMemoryAgentIds(thread.selected_model) : undefined,
    includeIdentity: !classicRuntime,
    includePendingRevisions: !classicRuntime && agentId === "luca",
    includeHypomnema: !classicRuntime,
    includeFunctionalMemory: memoryEnabled,
    includeMnemos: memoryEnabled,
    includeSkills: !classicRuntime && agentId === "luca",
    includeEmotionalState: !classicRuntime,
    includeBeliefs: !classicRuntime,
    continuityBridgeMode: classicRuntime ? "classic" : "agent",
  });

  return json({
    ...summarizeContinuityPacket(packet, focus),
    runtime_mode: runtimeMode,
    selected_model: thread.selected_model ?? null,
    memory_enabled: memoryEnabled,
  }, 200, cors);
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

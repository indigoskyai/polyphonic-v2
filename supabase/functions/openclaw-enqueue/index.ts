// openclaw-enqueue
// Authenticated user enqueues a job for one of their paired devices.
// Inserts a row into openclaw_jobs and broadcasts on Realtime channel
// device:{device_id} so the bridge picks it up regardless of which edge
// instance handled the HTTP request.

import { authenticateUser, corsHeaders, getServiceClient, jsonResponse } from "../_shared/openclaw/auth.ts";

const ALLOWED_KINDS = new Set(["completion", "deploy_spec", "health_ping", "mcp_test"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    const auth = await authenticateUser(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body.device_id !== "string" || typeof body.kind !== "string") {
      return jsonResponse({ error: "device_id and kind required" }, 400);
    }
    if (!ALLOWED_KINDS.has(body.kind)) {
      return jsonResponse({ error: `unsupported kind: ${body.kind}` }, 400);
    }

    const admin = getServiceClient();

    // Verify ownership.
    const { data: device, error: devErr } = await admin
      .from("openclaw_devices")
      .select("id, user_id, status")
      .eq("id", body.device_id)
      .maybeSingle();
    if (devErr) throw devErr;
    if (!device || device.user_id !== auth.userId) {
      return jsonResponse({ error: "Device not found" }, 404);
    }
    if (device.status === "revoked") {
      return jsonResponse({ error: "Device revoked" }, 410);
    }

    const agentConfigId = typeof body.agent_config_id === "string" && body.agent_config_id.trim()
      ? body.agent_config_id.trim()
      : null;
    const threadId = typeof body.thread_id === "string" && body.thread_id.trim()
      ? body.thread_id.trim()
      : null;

    if (agentConfigId) {
      const { data: agentConfig, error: agentErr } = await admin
        .from("agent_configs")
        .select("id, user_id")
        .eq("id", agentConfigId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (agentErr) throw agentErr;
      if (!agentConfig) return jsonResponse({ error: "Agent not found" }, 404);
    }

    if (threadId) {
      const { data: thread, error: threadErr } = await admin
        .from("threads")
        .select("id, user_id")
        .eq("id", threadId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (threadErr) throw threadErr;
      if (!thread) return jsonResponse({ error: "Thread not found" }, 404);
    }

    const { data: job, error: jobErr } = await admin
      .from("openclaw_jobs")
      .insert({
        user_id: auth.userId,
        device_id: body.device_id,
        agent_config_id: agentConfigId,
        thread_id: threadId,
        kind: body.kind,
        payload: body.payload ?? {},
        status: "queued",
      })
      .select("id, created_at")
      .single();
    if (jobErr) throw jobErr;

    // Broadcast on the device channel. The bridge subscribes to device:{id}.
    const channel = admin.channel(`device:${body.device_id}`);
    await channel.send({
      type: "broadcast",
      event: "job.queued",
      payload: {
        job_id: job.id,
        kind: body.kind,
        agent_config_id: agentConfigId,
        thread_id: threadId,
      },
    });
    await admin.removeChannel(channel);

    return jsonResponse({ job_id: job.id, created_at: job.created_at });
  } catch (err) {
    console.error("openclaw-enqueue error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

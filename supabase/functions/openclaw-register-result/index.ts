// openclaw-register-result
// Bridge POSTs progress and final results here. Authenticated by device token
// (NOT user JWT) since this runs on the bridge with a long-lived credential.
//
// Body: {
//   job_id, device_id, device_token,
//   status: 'running' | 'completed' | 'failed' | 'timeout',
//   chunk?:  { delta?: string, thinking?: string, raw?: any },
//   result?: any,
//   error?:  string
// }
//
// For chunks → broadcasts on job:{job_id} so chat-multi can stream.
// For terminal status → updates the job row + broadcasts job.complete.

import {
  authenticateDeviceToken,
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/openclaw/auth.ts";

const TERMINAL = new Set(["completed", "failed", "timeout"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.job_id !== "string" || typeof body.device_id !== "string") {
      return jsonResponse({ error: "job_id and device_id required" }, 400);
    }
    const deviceToken =
      (typeof body.device_token === "string" && body.device_token) ||
      req.headers.get("x-device-token") ||
      "";
    const auth = await authenticateDeviceToken(body.device_id, deviceToken);
    if (!auth) return jsonResponse({ error: "Invalid device credentials" }, 401);

    const admin = getServiceClient();

    // Confirm job belongs to this device.
    const { data: job } = await admin
      .from("openclaw_jobs")
      .select("id, device_id, status")
      .eq("id", body.job_id)
      .maybeSingle();
    if (!job || job.device_id !== auth.device_id) {
      return jsonResponse({ error: "Job not found" }, 404);
    }

    const status: string = body.status ?? "running";

    // Chunks: broadcast immediately, no DB write per chunk.
    if (body.chunk) {
      const channel = admin.channel(`job:${body.job_id}`);
      await channel.send({
        type: "broadcast",
        event: "job.chunk",
        payload: { job_id: body.job_id, chunk: body.chunk },
      });
      await admin.removeChannel(channel);

      // First chunk transitions the job to running.
      if (job.status === "queued") {
        await admin
          .from("openclaw_jobs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", body.job_id);
      }
    }

    if (TERMINAL.has(status)) {
      const update: Record<string, unknown> = {
        status,
        completed_at: new Date().toISOString(),
      };
      if (body.result !== undefined) update.result = body.result;
      if (typeof body.error === "string") update.error = body.error;
      const { error: upErr } = await admin
        .from("openclaw_jobs")
        .update(update)
        .eq("id", body.job_id);
      if (upErr) throw upErr;

      const channel = admin.channel(`job:${body.job_id}`);
      await channel.send({
        type: "broadcast",
        event: "job.complete",
        payload: {
          job_id: body.job_id,
          status,
          result: body.result ?? null,
          error: body.error ?? null,
        },
      });
      await admin.removeChannel(channel);
    } else if (status === "running" && job.status === "queued") {
      await admin
        .from("openclaw_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", body.job_id);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("openclaw-register-result error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

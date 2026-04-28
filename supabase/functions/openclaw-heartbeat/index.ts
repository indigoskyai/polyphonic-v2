// openclaw-heartbeat
// Bridge calls this every ~30s to mark itself online. Authenticated by
// device token (no user JWT). Updates last_seen_at and (if revoked) tells
// the bridge to shut down.

import {
  authenticateDeviceToken,
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/openclaw/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const deviceId = (body?.device_id as string) || req.headers.get("x-device-id") || "";
    const deviceToken =
      (body?.device_token as string) || req.headers.get("x-device-token") || "";
    const auth = await authenticateDeviceToken(deviceId, deviceToken);
    if (!auth) return jsonResponse({ error: "Invalid device credentials" }, 401);

    const admin = getServiceClient();
    const update: Record<string, unknown> = {
      status: "online",
      last_seen_at: new Date().toISOString(),
    };
    if (typeof body?.bridge_version === "string") {
      update.bridge_version = body.bridge_version.slice(0, 40);
    }
    if (typeof body?.platform === "string") {
      update.platform = body.platform.slice(0, 40);
    }
    const { error } = await admin
      .from("openclaw_devices")
      .update(update)
      .eq("id", auth.device_id);
    if (error) throw error;

    return jsonResponse({ ok: true, server_time: new Date().toISOString() });
  } catch (err) {
    console.error("openclaw-heartbeat error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

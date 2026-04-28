// openclaw-status
// Replaces the in-memory device map. Pure DB query: returns the user's
// devices joined with last-job stats and a derived `connected` flag.

import {
  authenticateUser,
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/openclaw/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateUser(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = getServiceClient();
    const { data: devices, error } = await admin
      .from("openclaw_devices")
      .select(
        "id, name, platform, bridge_version, status, last_seen_at, is_default, created_at",
      )
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const now = Date.now();
    const ONLINE_WINDOW_MS = 90_000;

    const enriched = await Promise.all(
      (devices ?? []).map(async (d) => {
        const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
        const connected = d.status !== "revoked" && now - lastSeen < ONLINE_WINDOW_MS;
        const { count: queuedCount } = await admin
          .from("openclaw_jobs")
          .select("id", { count: "exact", head: true })
          .eq("device_id", d.id)
          .in("status", ["queued", "running"]);
        const { data: lastJob } = await admin
          .from("openclaw_jobs")
          .select("id, status, kind, created_at, completed_at")
          .eq("device_id", d.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          ...d,
          connected,
          queued_jobs: queuedCount ?? 0,
          last_job: lastJob ?? null,
        };
      }),
    );

    return jsonResponse({ devices: enriched });
  } catch (err) {
    console.error("openclaw-status error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

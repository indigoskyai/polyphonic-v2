/**
 * luca-initiate — the initiative gate.
 *
 * Called after autonomous actions to decide HOW (or whether) to reach out to
 * the user. Distinct from `anima-initiate` which generates an initiation message
 * from accumulated salience; this function decides delivery channel for an
 * already-existing event.
 *
 * Contract:
 *   POST /functions/v1/luca-initiate
 *   Body: {
 *     user_id: string,
 *     activity_id?: string,     // entity_activity_log row id
 *     severity: 'info' | 'notable' | 'important',
 *     title?: string,
 *     summary?: string,
 *   }
 *
 * Returns:
 *   { delivered: ('in_app' | 'push' | 'email')[], reason?: string }
 *
 * Decision rules:
 *   - 'info'      → never proactively pinged. Already lives in timeline.
 *   - 'notable'   → in-app only, plus push if user is offline > 6h.
 *   - 'important' → in-app + push always. Email digest if push fails / unsubscribed.
 *   - Quiet hours suppress push/email regardless. In-app always allowed.
 *
 * Auth: service_role only (called by other edge functions, not the browser).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

interface InitiatePayload {
  user_id: string;
  activity_id?: string;
  severity: "info" | "notable" | "important";
  title?: string;
  summary?: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${serviceRole}`) {
      return new Response(JSON.stringify({ error: "service_role only" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as InitiatePayload;
    if (!body.user_id || !body.severity) {
      return new Response(JSON.stringify({ error: "user_id and severity required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(url, serviceRole);

    // Info events never trigger initiative — they just live in the timeline.
    if (body.severity === "info") {
      return new Response(JSON.stringify({ delivered: [], reason: "info severity" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Load profile + most recent message for offline detection
    const [{ data: profile }, { data: lastMsg }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "user_id, quiet_hours_start, quiet_hours_end, quiet_hours_tz, " +
            "push_subscription, notification_prefs, last_seen_activity_at",
        )
        .eq("user_id", body.user_id)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("created_at")
        .eq("user_id", body.user_id)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const prefs = (profile?.notification_prefs ?? {}) as Record<string, boolean>;
    const inAppEnabled = prefs.in_app !== false; // default on
    const pushEnabled = prefs.push === true;
    const emailEnabled = prefs.email_digest === true;

    const inQuietHours = isInQuietHours(
      profile?.quiet_hours_start ?? null,
      profile?.quiet_hours_end ?? null,
      profile?.quiet_hours_tz ?? "UTC",
    );

    const msSinceMessage = lastMsg?.created_at
      ? Date.now() - new Date(lastMsg.created_at).getTime()
      : Infinity;
    const userOfflineLong = msSinceMessage > 6 * 3600_000;

    const delivered: string[] = [];

    // In-app: always for notable/important if enabled
    if (inAppEnabled) delivered.push("in_app");

    // Push: important always; notable only if user has been gone a while
    const wantsPush =
      body.severity === "important" || (body.severity === "notable" && userOfflineLong);
    if (
      wantsPush &&
      pushEnabled &&
      !inQuietHours &&
      profile?.push_subscription
    ) {
      // Push delivery is wired in a later phase — record intent here.
      // For now we just mark it queued; a follow-up worker will send.
      delivered.push("push");
    }

    // Email digest: only for important + outside quiet hours + opted in
    if (
      body.severity === "important" &&
      emailEnabled &&
      !inQuietHours &&
      userOfflineLong
    ) {
      delivered.push("email");
    }

    return new Response(
      JSON.stringify({
        delivered,
        in_quiet_hours: inQuietHours,
        offline_hours: Number.isFinite(msSinceMessage)
          ? Math.round(msSinceMessage / 3600_000)
          : null,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("luca-initiate error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Quiet hours check. Treats start/end as integer hours [0..23] in the user's tz.
 * If start or end is null, returns false (never quiet).
 * Handles wrap-around (e.g. 22→7).
 */
function isInQuietHours(
  start: number | null,
  end: number | null,
  tz: string,
): boolean {
  if (start === null || end === null) return false;
  try {
    // Get current hour in user's timezone
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    });
    const hourStr = fmt.format(new Date());
    const hour = parseInt(hourStr, 10);
    if (Number.isNaN(hour)) return false;
    if (start === end) return false;
    if (start < end) return hour >= start && hour < end;
    // wrap (e.g. 22→7)
    return hour >= start || hour < end;
  } catch {
    return false;
  }
}

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
import { isInQuietHours } from "../_shared/quiet-hours.ts";

interface InitiatePayload {
  user_id: string;
  activity_id?: string;
  severity: "info" | "notable" | "important";
  title?: string;
  summary?: string;
}

// Local row shape so we don't depend on the Deno-flavored supabase-js
// client typings (which collapse `data` into a union with GenericStringError
// at the destructure site).
interface ProfileRow {
  user_id: string;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  quiet_hours_tz: string | null;
  push_subscription: unknown | null;
  notification_prefs: Record<string, boolean> | null;
  last_seen_activity_at: string | null;
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
    const [profileResult, lastMsgResult] = await Promise.all([
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

    const profile = (profileResult.data as ProfileRow | null) ?? null;
    const lastMsg = (lastMsgResult.data as { created_at: string } | null) ?? null;

    const prefs = (profile?.notification_prefs ?? {}) as Record<string, boolean>;
    const inAppEnabled = prefs.in_app !== false; // default on
    const pushEnabled = prefs.push === true;
    const emailEnabled = prefs.email_digest === true;

    const inQuietHours = isInQuietHours({
      start: profile?.quiet_hours_start ?? null,
      end: profile?.quiet_hours_end ?? null,
      tz: profile?.quiet_hours_tz ?? "UTC",
    });

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

// Quiet-hours logic moved to `_shared/quiet-hours.ts` so the proactive
// engagement gate can apply the same rule before logging activity.

// Phase L12 — acute-crisis follow-up runner.
//
// Cron-driven service-role function (every 5 minutes). Scans crisis_events
// for acute rows whose followup_due_at has passed, then for each one checks
// whether the user has been silent on the originating thread since the
// classifier flagged the message. If so, fires `luca-initiate` at severity
// `important` with a "I want to check on you" surface — bypassing the
// pacing gate because acute follow-ups are the rare exception that
// genuinely override the daily/hourly caps.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { dispatchProactiveEngagement } from "../_shared/proactive-engagement.ts";

const FOLLOWUP_BATCH = 10;
const CRISIS_FOLLOWUP_TITLE = "I want to check on you";
const CRISIS_FOLLOWUP_BODY =
  "I've been thinking about you since earlier — I wanted to check in. I'm here if you want to talk.";

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

    const supabase = createClient(url, serviceRole);
    const now = new Date().toISOString();

    const { data: due, error } = await supabase
      .from("crisis_events")
      .select("id, user_id, thread_id, message_id, crisis_level, flags, followup_due_at, created_at")
      .eq("followup_queued", true)
      .eq("crisis_level", "acute")
      .is("followup_completed_at", null)
      .lte("followup_due_at", now)
      .order("followup_due_at", { ascending: true })
      .limit(FOLLOWUP_BATCH);

    if (error) return json({ error: error.message }, 500, corsHeaders);

    const results: Array<Record<string, unknown>> = [];
    for (const event of due || []) {
      results.push(await processFollowup(supabase, url, serviceRole, event));
    }

    return json({ ok: true, processed: results.length, results }, 200, corsHeaders);
  } catch (err) {
    console.error("crisis-followup fatal:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

async function processFollowup(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  event: any,
): Promise<Record<string, unknown>> {
  // If the user has spoken since the classifier flagged them, skip the
  // follow-up — the conversation is no longer in the silent state we'd be
  // reaching out about.
  const userSpokeSince = await userHasSpokenSince(supabase, event.user_id, event.thread_id, event.created_at);
  if (userSpokeSince) {
    await supabase
      .from("crisis_events")
      .update({ followup_completed_at: new Date().toISOString() })
      .eq("id", event.id);
    return { id: event.id, skipped: "user_active_since_event" };
  }

  // Bypass the proactive pacing gate for acute follow-ups — important-severity
  // and crisis-driven, this is the case where the cap exists to be overridden.
  const result = await dispatchProactiveEngagement(supabase, supabaseUrl, serviceRoleKey, {
    userId: event.user_id,
    source: "crisis_followup",
    severity: "important",
    title: CRISIS_FOLLOWUP_TITLE,
    summary: CRISIS_FOLLOWUP_BODY,
    rationale:
      "Acute crisis signal earlier in this thread, no user activity since. Reaching out once.",
    activityType: "crisis_followup",
    bypassPacing: true,
    content: {
      crisis_event_id: event.id,
      thread_id: event.thread_id,
      flags: event.flags || [],
    },
  });

  await supabase
    .from("crisis_events")
    .update({
      followup_completed_at: new Date().toISOString(),
      resources_surfaced: true,
    })
    .eq("id", event.id);

  return {
    id: event.id,
    delivered: result.delivered ?? [],
    activity_id: result.activityId ?? null,
  };
}

async function userHasSpokenSince(
  supabase: any,
  userId: string,
  threadId: string | null,
  sinceIso: string,
): Promise<boolean> {
  if (!threadId) return false;
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .eq("role", "user")
    .gte("created_at", sinceIso);
  if (error) {
    console.warn("[crisis-followup] silence check failed:", error.message);
    return true; // err on the side of NOT pestering on a flaky DB call
  }
  return Number(count || 0) > 0;
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

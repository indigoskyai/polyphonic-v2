// Phase L10: proactive engagement gate.
//
// Single chokepoint for autonomous functions that want to surface a notable or
// important moment to the user. Applies pacing limits, records the event into
// `entity_activity_log` with an honest rationale, and (when allowed) delegates
// the delivery channel decision to `luca-initiate`.
//
// Background callers should use this instead of calling `luca-initiate` /
// `logActivity` directly, so pacing and rationale stay consistent.

import { logActivity } from "./activity-log.ts";
import { loadQuietHours } from "./quiet-hours.ts";

export type ProactiveSeverity = "info" | "notable" | "important";

export interface ProactiveTrigger {
  userId: string;
  /** A short identifier for who/what surfaced this (e.g. `subagent_run`, `scheduled_task`, `mnemos_consolidate`). */
  source: string;
  severity: ProactiveSeverity;
  title: string;
  summary: string;
  /** Visible to the user under "why am I seeing this?". */
  rationale?: string;
  /** Defaults to `source` if omitted. */
  activityType?: string;
  /** Extra structured data persisted under entity_activity_log.content. */
  content?: Record<string, unknown>;
  /** Override pacing — only use for genuine emergencies (crisis follow-up). */
  bypassPacing?: boolean;
}

export interface ProactiveResult {
  allowed: boolean;
  reason?: string;
  activityId?: string;
  delivered?: string[];
}

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const DAILY_PROACTIVE_CAP = 3;
const MIN_INTERVAL_MS = HOUR_MS;

/**
 * Gate + record + delegate. Returns whether the trigger was allowed.
 *
 * Pacing rules (notable severity):
 *   - At most 3 notable events in any rolling 24h window.
 *   - At most one notable event per rolling 1h window.
 *   - Notable events are demoted to info (logged, not surfaced) during the
 *     user's quiet hours window — they can still see the row in the
 *     activity timeline if they look, but the notification UI doesn't draw
 *     attention to it overnight.
 *   - Severity `important` skips the daily/hourly caps AND quiet-hours
 *     demotion so genuine emergencies can always reach the user;
 *     `luca-initiate` still suppresses push/email during quiet hours, so
 *     in-app surfacing remains the channel for important events overnight.
 *   - Severity `info` is unrated — it's only stored, never escalated.
 */
export async function dispatchProactiveEngagement(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  trigger: ProactiveTrigger,
): Promise<ProactiveResult> {
  if (!trigger.userId) return { allowed: false, reason: "missing_user" };

  const content = {
    rationale: trigger.rationale || null,
    source: trigger.source,
    ...(trigger.content || {}),
  };

  if (trigger.severity === "info") {
    const logged = await logActivity(supabase, trigger.userId, {
      type: trigger.activityType || trigger.source,
      title: trigger.title,
      summary: trigger.summary,
      content,
      source: trigger.source,
      severity: "info",
      surfaceToUser: false,
    });
    return { allowed: true, activityId: logged?.id };
  }

  const isImportant = trigger.severity === "important";

  if (!trigger.bypassPacing && !isImportant) {
    const now = Date.now();
    const since24h = new Date(now - DAY_MS).toISOString();
    const sinceHour = new Date(now - MIN_INTERVAL_MS).toISOString();

    const dailyCount = await countProactive(supabase, trigger.userId, since24h);
    if (dailyCount >= DAILY_PROACTIVE_CAP) {
      return { allowed: false, reason: "daily_cap_reached" };
    }

    const hourlyCount = await countProactive(supabase, trigger.userId, sinceHour);
    if (hourlyCount >= 1) {
      return { allowed: false, reason: "hourly_cap_reached" };
    }

    const quiet = await loadQuietHours(supabase, trigger.userId);
    if (quiet.isQuiet) {
      const logged = await logActivity(supabase, trigger.userId, {
        type: trigger.activityType || trigger.source,
        title: trigger.title,
        summary: trigger.summary,
        content: { ...content, demoted_from: trigger.severity, reason: "quiet_hours" },
        source: trigger.source,
        severity: "info",
        surfaceToUser: false,
      });
      return {
        allowed: false,
        reason: "quiet_hours",
        activityId: logged?.id,
      };
    }
  }

  const logged = await logActivity(supabase, trigger.userId, {
    type: trigger.activityType || trigger.source,
    title: trigger.title,
    summary: trigger.summary,
    content,
    source: trigger.source,
    severity: trigger.severity,
    surfaceToUser: true,
  });

  let delivered: string[] = [];
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/luca-initiate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: trigger.userId,
        activity_id: logged?.id,
        severity: trigger.severity,
        title: trigger.title,
        summary: trigger.summary.slice(0, 240),
      }),
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data && Array.isArray(data.delivered)) delivered = data.delivered as string[];
    } else {
      console.warn(
        `[proactive] luca-initiate ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
      );
    }
  } catch (err) {
    console.warn("[proactive] luca-initiate dispatch failed:", err);
  }

  return { allowed: true, activityId: logged?.id, delivered };
}

async function countProactive(supabase: any, userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("entity_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("surface_to_user", true)
    .in("severity", ["notable", "important"])
    .gte("created_at", sinceIso);
  if (error) {
    console.warn("[proactive] count query failed:", error.message);
    return 0;
  }
  return Number(count || 0);
}

/**
 * Activity Log — Shared module for logging entity autonomous activity
 *
 * All cognitive and tool-use edge functions call logActivity() after producing output.
 * This feeds the "what I did while you were away" Inner Life page and the
 * notifications drawer.
 *
 * `surface_to_user` controls whether the entry shows up in the user's feed.
 * Default: notable + important always surface; info surfaces only when caller asks.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ActivitySeverity = "info" | "notable" | "important";

export interface ActivityEntry {
  agentId?: string;
  type: string;
  title?: string;
  summary?: string;
  content?: Record<string, unknown>;
  emotionalContext?: Record<string, unknown>;
  source?: string;
  /** Default: 'info'. */
  severity?: ActivitySeverity;
  /** When omitted, defaults to true for notable/important, false for info. */
  surfaceToUser?: boolean;
}

export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  entry: ActivityEntry,
): Promise<{ id: string } | null> {
  try {
    const severity: ActivitySeverity = entry.severity ?? "info";
    const surface = entry.surfaceToUser ?? severity !== "info";
    const { data, error } = await supabase
      .from("entity_activity_log")
      .insert({
        user_id: userId,
        agent_id: entry.agentId || "luca",
        activity_type: entry.type,
        title: entry.title ?? null,
        summary: entry.summary ?? null,
        content: entry.content ?? null,
        emotional_context: entry.emotionalContext ?? null,
        source: entry.source ?? "autonomous",
        severity,
        surface_to_user: surface,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`[activity-log] insert failed (type=${entry.type}):`, error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("Failed to log activity:", err);
    return null;
  }
}

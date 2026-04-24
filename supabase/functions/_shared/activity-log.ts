/**
 * Activity Log — Shared module for logging entity autonomous activity
 *
 * All cognitive and tool-use edge functions call logActivity() after producing output.
 * This feeds the "what I did while you were away" Inner Life page.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ActivityEntry {
  type: string;       // reflection, journal, browse, image, social_post, skill_use, belief_change, question, dream, code, task
  title?: string;
  summary?: string;
  content?: Record<string, unknown>;
  emotionalContext?: Record<string, unknown>;
  source?: string;    // 'autonomous' | 'user_triggered' | 'resonance_cascade'
}

export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  entry: ActivityEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("entity_activity_log").insert({
      user_id: userId,
      activity_type: entry.type,
      title: entry.title || null,
      summary: entry.summary || null,
      content: entry.content || null,
      emotional_context: entry.emotionalContext || null,
      source: entry.source || "autonomous",
    });
    if (error) console.error(`[activity-log] insert failed (type=${entry.type}):`, error);
  } catch (err) {
    // Graceful: log failures don't crash the caller
    console.error("Failed to log activity:", err);
  }
}

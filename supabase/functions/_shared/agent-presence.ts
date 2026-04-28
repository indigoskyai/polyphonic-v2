/**
 * Agent presence — light wrapper for setting `profiles.agent_status`.
 *
 * Edge functions call setAgentStatus() at the start and end of work so the UI
 * can show "Luca is reading..." / "thinking..." / etc. in real time via the
 * Realtime postgres_changes subscription on profiles.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AgentStatus =
  | "idle"
  | "thinking"
  | "reading"
  | "searching"
  | "dreaming"
  | "reflecting";

export async function setAgentStatus(
  supabase: SupabaseClient,
  userId: string,
  status: AgentStatus,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ agent_status: status })
      .eq("user_id", userId);
    if (error) console.error(`[agent-presence] set ${status} failed:`, error);
  } catch (err) {
    console.error("Failed to set agent status:", err);
  }
}

/** Wrap an async block so status auto-resets to 'idle' on completion or error. */
export async function withAgentStatus<T>(
  supabase: SupabaseClient,
  userId: string,
  status: AgentStatus,
  fn: () => Promise<T>,
): Promise<T> {
  await setAgentStatus(supabase, userId, status);
  try {
    return await fn();
  } finally {
    await setAgentStatus(supabase, userId, "idle");
  }
}

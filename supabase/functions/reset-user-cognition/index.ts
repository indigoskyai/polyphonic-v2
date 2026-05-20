import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

// Tables that hold inferred/derived cognition for a user. All are filtered
// by user_id. Kept intentionally OUT of this list: profiles, user_settings,
// memory_settings, agent_configs, agent_identity, agent_skills,
// user_api_keys, threads, messages, journal_entries, projects, artifacts,
// dashboard_widgets, user_roles, token_gate_*.
const INFERRED_TABLES = [
  // Memory
  "memories",
  "memory_candidates",
  "memory_events",
  "engrams",
  "engram_archive",
  "connections",
  "beliefs",
  "hypomnema_entry",
  // Psyche / state
  "psychological_profile",
  "cognitive_state",
  "emotional_state",
  "emotional_history",
  "mnemos_emotional_state",
  "mnemos_digests",
  "profile_daily_pulse",
  // Activity / thought
  "thought_stream",
  "thought_initiations",
  "activity_events",
  "entity_activity_log",
  "observer_notes",
  "observer_logs",
  "daily_logs",
  // Curiosity & imports
  "curiosity_questions",
  "pending_revisions",
  "conversations",
  "chat_imports",
] as const;

Deno.serve(async (req) => {
  const pre = handleCorsPreflightIfNeeded(req);
  if (pre) return pre;

  const cors = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await anon.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "RESET") {
      return new Response(
        JSON.stringify({ error: 'Missing confirmation. Send { "confirm": "RESET" }.' }),
        { status: 400, headers: cors }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const deleted: Record<string, number> = {};
    const failed: Record<string, string> = {};

    for (const table of INFERRED_TABLES) {
      try {
        const { count, error } = await admin
          .from(table)
          .delete({ count: "exact" })
          .eq("user_id", user.id);
        if (error) failed[table] = error.message;
        else deleted[table] = count ?? 0;
      } catch (e) {
        failed[table] = e instanceof Error ? e.message : "unknown error";
      }
    }

    // Reset the activity cursor so background jobs don't replay old events.
    try {
      await admin
        .from("profiles")
        .update({ last_seen_activity_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } catch {
      // non-fatal
    }

    const total = Object.values(deleted).reduce((a, b) => a + b, 0);

    return new Response(
      JSON.stringify({ success: true, total_deleted: total, deleted, failed }),
      { headers: cors }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: cors }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { import_id } = await req.json();
    if (!import_id) {
      return new Response(JSON.stringify({ error: "import_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    const { data: importRecord } = await supabase
      .from("chat_imports")
      .select("id, user_id, created_at, completed_at")
      .eq("id", import_id)
      .eq("user_id", user.id)
      .single();

    if (!importRecord) {
      return new Response(JSON.stringify({ error: "Import not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Hard-delete memories whose provenance.import_id matches
    const { count: memoriesDeleted } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .filter("provenance->>import_id", "eq", import_id);

    // Hard-delete derived rows created during the import's processing window.
    // Best-effort: derived data (engrams/beliefs/hypomnema/etc.) is not tagged
    // with import_id, so a full clean slate requires the reset-user-cognition
    // edge function. We do the time-window cleanup here for the obvious cases.
    const startTime = importRecord.created_at;
    const endTime = importRecord.completed_at || new Date().toISOString();

    const { count: questionsDeleted } = await supabase
      .from("curiosity_questions")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", startTime)
      .lte("created_at", endTime);

    const { count: candidatesDeleted } = await supabase
      .from("memory_candidates")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", startTime)
      .lte("created_at", endTime);

    const { count: revisionsDeleted } = await supabase
      .from("pending_revisions")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", startTime)
      .lte("created_at", endTime);

    // Wipe inferred cognition for a true clean slate. Derived data
    // (engrams, beliefs, profile, hypomnema, thoughts, emotions, etc.)
    // is not tagged with import_id, so without this the profile keeps
    // reflecting the deleted history. Threads, settings, identity docs,
    // API keys, projects, and journal entries are intentionally preserved.
    const COGNITION_TABLES = [
      "memories", "memory_candidates", "memory_events",
      "engrams", "engram_archive", "connections", "beliefs", "hypomnema_entry",
      "psychological_profile", "cognitive_state", "emotional_state", "emotional_history",
      "mnemos_emotional_state", "mnemos_digests", "profile_daily_pulse",
      "thought_stream", "thought_initiations", "activity_events", "entity_activity_log",
      "observer_notes", "observer_logs", "daily_logs",
      "curiosity_questions", "pending_revisions",
    ] as const;
    const cognitionDeleted: Record<string, number> = {};
    for (const table of COGNITION_TABLES) {
      try {
        const { count, error } = await supabase
          .from(table)
          .delete({ count: "exact" })
          .eq("user_id", user.id);
        if (!error) cognitionDeleted[table] = count ?? 0;
      } catch { /* table may not exist in this env */ }
    }

    // Hard-delete the import row
    await supabase.from("chat_imports").delete().eq("id", import_id);

    return new Response(
      JSON.stringify({
        success: true,
        memories_deleted: memoriesDeleted || 0,
        questions_deleted: questionsDeleted || 0,
        candidates_deleted: candidatesDeleted || 0,
        revisions_deleted: revisionsDeleted || 0,
        cognition_deleted: cognitionDeleted,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});

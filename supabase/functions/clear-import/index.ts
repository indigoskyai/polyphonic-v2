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

    // Verify user
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

    // Verify the import belongs to this user
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

    // Delete memories where provenance->>'import_id' matches
    const { count: memoriesDeleted } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .filter("provenance->>import_id", "eq", import_id);

    // Delete derived rows only when they carry explicit import provenance.
    // Time-window cleanup can remove unrelated agent activity created nearby.
    const { count: engramsDeleted } = await supabase
      .from("engrams")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .filter("source_context->>import_id", "eq", import_id);

    // Mark the import as cleared
    await supabase
      .from("chat_imports")
      .update({ status: "cleared", pipeline_stage: "cleared" })
      .eq("id", import_id);

    return new Response(
      JSON.stringify({
        success: true,
        memories_deleted: memoriesDeleted || 0,
        engrams_deleted: engramsDeleted || 0,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e instanceof Error ? e.message : "Unknown error") }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

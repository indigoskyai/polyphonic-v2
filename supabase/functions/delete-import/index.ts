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

    // Hard-delete curiosity questions in the import window
    const startTime = importRecord.created_at;
    const endTime = importRecord.completed_at || new Date().toISOString();
    const { count: questionsDeleted } = await supabase
      .from("curiosity_questions")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", startTime)
      .lte("created_at", endTime);

    // Hard-delete the import row
    await supabase.from("chat_imports").delete().eq("id", import_id);

    return new Response(
      JSON.stringify({
        success: true,
        memories_deleted: memoriesDeleted || 0,
        questions_deleted: questionsDeleted || 0,
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

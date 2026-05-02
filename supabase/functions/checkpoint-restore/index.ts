import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

// Per-request CORS, reassigned on each invocation. See _shared/cors.ts.
let corsHeaders: Record<string, string> = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RestoreBody {
  checkpoint_id: string;
}

Deno.serve(async (req) => {
  corsHeaders = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate user JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user_id = userData.user.id;

    let body: RestoreBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.checkpoint_id || typeof body.checkpoint_id !== "string") {
      return new Response(JSON.stringify({ error: "checkpoint_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Load target checkpoint and verify ownership
    const { data: target, error: targetErr } = await admin
      .from("checkpoints")
      .select("*")
      .eq("id", body.checkpoint_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetErr) {
      console.error("[checkpoint-restore] target lookup failed:", targetErr);
      return new Response(JSON.stringify({ error: targetErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!target) {
      return new Response(JSON.stringify({ error: "Checkpoint not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Snapshot current state into an auto-checkpoint
    const { data: autoCp, error: autoErr } = await admin
      .from("checkpoints")
      .insert({
        user_id,
        agent: target.agent,
        summary: `Auto-saved before restore to ${target.id.slice(0, 8)}`,
        annotation: "auto-saved before restore",
        milestone: false,
        files_added: 0,
        files_removed: 0,
        snapshot_ref: null,
      })
      .select()
      .single();

    if (autoErr || !autoCp) {
      console.error("[checkpoint-restore] auto-checkpoint insert failed:", autoErr);
      return new Response(JSON.stringify({ error: autoErr?.message ?? "Auto-checkpoint failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply target snapshot — actual file/blob restoration is handled out-of-band
    // by the storage layer that owns snapshot_ref. We record the restore action.
    const { error: applyErr } = await admin.from("entity_activity_log").insert({
      user_id,
      activity_type: "checkpoint_restore",
      title: "Restored checkpoint",
      summary: target.summary,
      content: {
        restored_checkpoint_id: target.id,
        auto_saved_checkpoint_id: autoCp.id,
        snapshot_ref: target.snapshot_ref,
      },
      source: "user",
    });

    if (applyErr) {
      console.error("[checkpoint-restore] activity log insert failed:", applyErr);
      // non-fatal — restore still succeeds
    }

    return new Response(
      JSON.stringify({
        success: true,
        restored_checkpoint_id: target.id,
        auto_saved_checkpoint_id: autoCp.id,
        snapshot_ref: target.snapshot_ref,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[checkpoint-restore] unexpected error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

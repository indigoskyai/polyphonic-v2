// Hard-deletes the calling user's auth account.
//
// Verifies the caller's JWT, then uses the service-role key to call
// supabase.auth.admin.deleteUser(), which triggers ON DELETE CASCADE
// on every table that references auth.users by FK. The user's email
// becomes available for re-signup immediately after.
//
// This is a one-way, destructive operation. The frontend must confirm
// intent before calling this endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

let corsHeaders: Record<string, string> = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  corsHeaders = {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseAnon || !supabaseServiceRole) {
      return jsonResponse(
        { error: "Server misconfigured: missing Supabase keys" },
        500,
      );
    }

    // Verify the caller using their JWT.
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // Service-role client for the actual delete.
    const admin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: groupCleanupErr } = await admin.rpc("anonymize_group_room_user", {
      p_user_id: userId,
    });
    if (groupCleanupErr) {
      return jsonResponse(
        { error: groupCleanupErr.message || "Could not prepare group room data for account deletion." },
        500,
      );
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      return jsonResponse(
        { error: deleteErr.message || "Could not delete account." },
        500,
      );
    }

    return jsonResponse({ ok: true, user_id: userId }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

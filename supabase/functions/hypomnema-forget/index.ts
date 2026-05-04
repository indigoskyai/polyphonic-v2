// hypomnema-forget — user-triggered deactivation of a hypomnema entry.
//
// Auth: user JWT (not service-role). The endpoint sets active=false on the
// entry only if it belongs to the calling user. Preserves the row + revision
// history — this is "stop carrying it," not "delete." Records a revision
// note with reason='user_forgot' so the audit trail stays intact.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

interface ForgetPayload {
  entry_id: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    // Resolve user from JWT.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const token = auth.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }
    const userId = claimsData.claims.sub as string;

    const body = (await req.json().catch(() => ({}))) as Partial<ForgetPayload>;
    const entryId = typeof body.entry_id === "string" ? body.entry_id : "";
    if (!entryId) return json({ error: "entry_id required" }, 400, corsHeaders);

    // Use service role to write so RLS doesn't block the revision log update,
    // but we filter on user_id to scope to the caller.
    const supabase = createClient(url, serviceRole);
    const { data: existing, error: selErr } = await supabase
      .from("hypomnema_entry")
      .select("id, user_id, confidence, revisions")
      .eq("id", entryId)
      .eq("user_id", userId)
      .maybeSingle();

    if (selErr) return json({ error: selErr.message }, 500, corsHeaders);
    if (!existing) return json({ error: "not found" }, 404, corsHeaders);

    const newRevisions = [
      ...(Array.isArray(existing.revisions) ? existing.revisions : []),
      {
        old_confidence: existing.confidence,
        new_confidence: existing.confidence,
        reason: "user_forgot",
        timestamp: new Date().toISOString(),
      },
    ];

    const { error: upErr } = await supabase
      .from("hypomnema_entry")
      .update({ active: false, revisions: newRevisions })
      .eq("id", entryId)
      .eq("user_id", userId);
    if (upErr) return json({ error: upErr.message }, 500, corsHeaders);

    return json({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[hypomnema-forget] error:", err);
    return json({ error: (err as Error).message }, 500, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

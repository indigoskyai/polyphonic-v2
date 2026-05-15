// agent-identity-save
//
// Server-mediated write to public.agent_identity.
//
// Background: agent_identity holds the SOUL.md / Self-model / User-model /
// Convictions documents per agent per user. Historically these have been
// agent-managed only — Luca writes patches through the dialectic system
// based on confidence thresholds. Users have not had an edit surface.
//
// Beta tester Tara (2026-05-13) needs to provision identity files for a
// custom user-created agent for a careful migration from another runtime.
// Riley's call: Luca's own identity files stay agent-managed (the agent
// is platform-controlled, locked). Identity files on USER-created agents
// — anything where agent_configs.locked = false AND is_system = false —
// become user-editable through this function.
//
// Why a SECURITY DEFINER edge function rather than direct RLS write:
// matches the pattern used for user_api_keys (save_user_api_key /
// delete_user_api_key). The ownership + lock check is a non-trivial
// condition that's clearer to enforce in code than in a RLS WITH CHECK
// expression, and it keeps the agent_identity table's user-write surface
// closed (no INSERT/UPDATE policy for end users) by default — the only
// path is through this function, which validates the agent first.
//
// Request:  POST { agent_id: string, doc_type: 'soul'|'self_model'|'user_model'|'convictions', content: string }
// Response: 200 { ok: true, doc: { ... } }
//           400/401/403/404/500 { error: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

let corsHeaders: Record<string, string> = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_DOC_TYPES = new Set([
  "soul",
  "self_model",
  "user_model",
  "convictions",
]);

const MAX_CONTENT = 32 * 1024; // 32 KB — generous; matches PromptEditor cap

interface SaveBody {
  agent_id?: string;
  doc_type?: string;
  content?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  corsHeaders = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnon || !supabaseServiceRole) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    // 1. authenticateUser via the caller's JWT.
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // 2. Parse + validate body.
    let body: SaveBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
    const docType = typeof body.doc_type === "string" ? body.doc_type.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";

    if (!agentId) {
      return jsonResponse({ error: "Field 'agent_id' is required" }, 400);
    }
    if (!VALID_DOC_TYPES.has(docType)) {
      return jsonResponse(
        { error: `Invalid doc_type '${docType}'. Must be one of: soul, self_model, user_model, convictions` },
        400,
      );
    }
    if (content.length > MAX_CONTENT) {
      return jsonResponse(
        { error: `Content too long (${content.length} chars). Limit is ${MAX_CONTENT}.` },
        400,
      );
    }

    // 3. Service-role client for the ownership check + write.
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    // Confirm the agent exists, is owned by the caller, and is editable
    // (not locked, not a platform-managed system agent).
    const { data: agentRow, error: agentErr } = await admin
      .from("agent_configs")
      .select("id, user_id, is_system, locked")
      .eq("user_id", userId)
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr) {
      console.error("[agent-identity-save] agent fetch error:", agentErr);
      return jsonResponse({ error: "Could not verify agent ownership" }, 500);
    }
    if (!agentRow) {
      return jsonResponse({ error: "Agent not found or not owned by caller" }, 404);
    }
    if (agentRow.is_system || agentRow.locked) {
      return jsonResponse(
        {
          error:
            "Identity documents for resident agents (Luca, Observer) are managed by the platform and cannot be edited directly. Use the dialectic patch system or contact support if you need to override.",
        },
        403,
      );
    }

    // 4. Upsert the agent_identity row. UNIQUE constraint on
    //    (user_id, agent_id, doc_type) makes onConflict deterministic.
    const { data: saved, error: saveErr } = await admin
      .from("agent_identity")
      .upsert(
        {
          user_id: userId,
          agent_id: agentId,
          doc_type: docType,
          content,
          // version bumps could be added later; for now the trigger on
          // updated_at handles the timestamp and the version column has
          // a default of 1. If the row already exists, we increment via
          // a follow-up update.
        },
        { onConflict: "user_id,agent_id,doc_type" },
      )
      .select("doc_type, content, version, updated_at")
      .single();

    if (saveErr) {
      console.error("[agent-identity-save] upsert error:", saveErr);
      return jsonResponse({ error: "Could not save identity document" }, 500);
    }

    // Bump version when the row already existed. The upsert above resets
    // version to default 1 on insert; on conflict it would have kept the
    // previous version if we hadn't included version in the upsert
    // payload. We did not, so the existing version is preserved — now
    // increment it explicitly.
    if (saved?.version !== undefined) {
      const nextVersion = (saved.version ?? 1) + 1;
      await admin
        .from("agent_identity")
        .update({ version: nextVersion })
        .eq("user_id", userId)
        .eq("agent_id", agentId)
        .eq("doc_type", docType);
      saved.version = nextVersion;
    }

    return jsonResponse({ ok: true, doc: saved });
  } catch (err) {
    console.error("[agent-identity-save] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

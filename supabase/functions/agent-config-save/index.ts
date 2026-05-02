// Phase 17: agent-config-save
// Accepts a partial agent config, validates env transitions, and upserts the row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

let corsHeaders: Record<string, string> = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ENVS = new Set(["prod", "staging", "dev"]);

// Allowed env transitions. Promotions require going through staging.
// dev <-> staging <-> prod. Direct dev<->prod is rejected.
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  dev: new Set(["dev", "staging"]),
  staging: new Set(["staging", "dev", "prod"]),
  prod: new Set(["prod", "staging"]),
};

interface ConfigPatch {
  id: string;
  env?: string;
  prompt?: string | null;
  model?: string | null;
  tools?: unknown;
  subagents?: unknown;
  voices?: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
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

    // Verify the caller using their JWT
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // Parse + validate body
    let body: ConfigPatch;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!body || typeof body.id !== "string" || body.id.trim().length === 0) {
      return jsonResponse({ error: "Field 'id' (agent id) is required" }, 400);
    }
    const agentId = body.id.trim();

    if (body.env !== undefined && !VALID_ENVS.has(body.env)) {
      return jsonResponse(
        { error: `Invalid env '${body.env}'. Must be one of: prod, staging, dev` },
        400,
      );
    }

    // Use service role to read current state + write the upsert
    // (RLS still enforced upstream by the JWT verification above)
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: existing, error: fetchErr } = await admin
      .from("agent_configs")
      .select("env, prompt, model, tools, subagents, voices")
      .eq("user_id", userId)
      .eq("id", agentId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[agent-config-save] fetch error:", fetchErr);
      return jsonResponse({ error: "Failed to load existing config" }, 500);
    }

    // Validate env transition if env is changing
    if (body.env !== undefined && existing?.env && existing.env !== body.env) {
      const allowed = ALLOWED_TRANSITIONS[existing.env];
      if (!allowed || !allowed.has(body.env)) {
        return jsonResponse(
          {
            error: `Invalid env transition: ${existing.env} → ${body.env}. Promote through staging.`,
          },
          400,
        );
      }
    }

    // Merge: explicit fields in body override; everything else keeps existing
    const merged = {
      user_id: userId,
      id: agentId,
      env: body.env ?? existing?.env ?? "prod",
      prompt: body.prompt !== undefined ? body.prompt : existing?.prompt ?? null,
      model: body.model !== undefined ? body.model : existing?.model ?? null,
      tools: body.tools !== undefined ? body.tools : existing?.tools ?? [],
      subagents:
        body.subagents !== undefined ? body.subagents : existing?.subagents ?? [],
      voices: body.voices !== undefined ? body.voices : existing?.voices ?? [],
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upsertErr } = await admin
      .from("agent_configs")
      .upsert(merged, { onConflict: "user_id,id" })
      .select()
      .single();

    if (upsertErr) {
      console.error("[agent-config-save] upsert error:", upsertErr);
      return jsonResponse({ error: "Failed to save config" }, 500);
    }

    return jsonResponse({ ok: true, config: saved });
  } catch (err) {
    console.error("[agent-config-save] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

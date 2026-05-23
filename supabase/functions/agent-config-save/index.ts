// Phase 17: agent-config-save
// Accepts a partial agent config, validates env transitions, and upserts the row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ensureCanCreateCustomAgent } from "../_shared/custom-agent-entitlements.ts";

let corsHeaders: Record<string, string> = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ENVS = new Set(["prod", "staging", "dev"]);
const VALID_AVATAR_COLORS = new Set(["cream", "ochre", "blue", "magenta", "sage", "violet"]);
const RESERVED_AGENT_IDS = new Set(["luca", "observer", "anima", "vektor"]);
const MAX_NAME_CHARS = 40;
const MAX_ROLE_CHARS = 64;
const MAX_PROMPT_CHARS = 32_000;

// Allowed env transitions. Promotions require going through staging.
// dev <-> staging <-> prod. Direct dev<->prod is rejected.
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  dev: new Set(["dev", "staging"]),
  staging: new Set(["staging", "dev", "prod"]),
  prod: new Set(["prod", "staging"]),
};

interface ConfigPatch {
  id: string;
  name?: string;
  role?: string;
  avatar_color?: string;
  env?: string;
  prompt?: string | null;
  model?: string | null;
  personality?: unknown;
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
    const userEmail = userData.user.email || "";

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
    const creatingReservedAgent = RESERVED_AGENT_IDS.has(agentId);

    if (body.name !== undefined && typeof body.name !== "string") {
      return jsonResponse({ error: "Field 'name' must be a string" }, 400);
    }
    if (body.role !== undefined && typeof body.role !== "string") {
      return jsonResponse({ error: "Field 'role' must be a string" }, 400);
    }
    if (body.avatar_color !== undefined && typeof body.avatar_color !== "string") {
      return jsonResponse({ error: "Field 'avatar_color' must be a string" }, 400);
    }
    if (body.env !== undefined && typeof body.env !== "string") {
      return jsonResponse({ error: "Field 'env' must be a string" }, 400);
    }
    if (body.prompt !== undefined && body.prompt !== null && typeof body.prompt !== "string") {
      return jsonResponse({ error: "Field 'prompt' must be a string or null" }, 400);
    }
    if (body.model !== undefined && body.model !== null && typeof body.model !== "string") {
      return jsonResponse({ error: "Field 'model' must be a string or null" }, 400);
    }

    if (body.env !== undefined && !VALID_ENVS.has(body.env)) {
      return jsonResponse(
        { error: `Invalid env '${body.env}'. Must be one of: prod, staging, dev` },
        400,
      );
    }
    if (body.avatar_color !== undefined && !VALID_AVATAR_COLORS.has(body.avatar_color)) {
      return jsonResponse({ error: `Invalid avatar_color '${body.avatar_color}'.` }, 400);
    }
    if (body.name !== undefined && body.name.trim().length === 0) {
      return jsonResponse({ error: "Name cannot be empty" }, 400);
    }
    if (body.name !== undefined && body.name.trim().length > MAX_NAME_CHARS) {
      return jsonResponse({ error: `Name must be ${MAX_NAME_CHARS} characters or fewer` }, 400);
    }
    if (body.role !== undefined && body.role.trim().length > MAX_ROLE_CHARS) {
      return jsonResponse({ error: `Role must be ${MAX_ROLE_CHARS} characters or fewer` }, 400);
    }
    if (typeof body.prompt === "string" && body.prompt.length > MAX_PROMPT_CHARS) {
      return jsonResponse(
        { error: `Prompt too long (${body.prompt.length} chars). Limit is ${MAX_PROMPT_CHARS}.` },
        400,
      );
    }

    // Use service role to read current state + write the upsert
    // (RLS still enforced upstream by the JWT verification above)
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: existing, error: fetchErr } = await admin
      .from("agent_configs")
      .select("name, role, avatar_color, is_system, locked, created_by, pending, env, prompt, model, personality, tools, subagents, voices")
      .eq("user_id", userId)
      .eq("id", agentId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[agent-config-save] fetch error:", fetchErr);
      return jsonResponse({ error: "Failed to load existing config" }, 500);
    }
    if (!existing && creatingReservedAgent) {
      return jsonResponse({ error: "Resident agent ids are reserved" }, 403);
    }
    if (existing?.locked || existing?.is_system) {
      return jsonResponse(
        { error: "Resident and system agents are platform-controlled and cannot be edited here." },
        403,
      );
    }
    if (!existing) {
      const entitlement = await ensureCanCreateCustomAgent(admin, userId, userEmail);
      if (!entitlement.ok) {
        return jsonResponse(entitlement.body, entitlement.status);
      }
    }
    if (!existing && (body.name === undefined || body.role === undefined)) {
      return jsonResponse({ error: "Name and role are required when creating an agent" }, 400);
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

    // Merge: explicit fields in body override; everything else keeps existing.
    // Name/role are defensively never-null/never-blank: body (trimmed) → existing (trimmed) → fallback.
    const existingName = typeof existing?.name === "string" ? existing.name.trim() : "";
    const existingRole = typeof existing?.role === "string" ? existing.role.trim() : "";
    const bodyNameTrimmed = body.name !== undefined ? body.name.trim() : "";
    const bodyRoleTrimmed = body.role !== undefined ? body.role.trim() : "";
    const resolvedName =
      bodyNameTrimmed.length > 0
        ? bodyNameTrimmed
        : existingName.length > 0
          ? existingName
          : agentId;
    const resolvedRole =
      body.role !== undefined
        ? (bodyRoleTrimmed.length > 0 ? bodyRoleTrimmed : "custom")
        : existingRole.length > 0
          ? existingRole
          : "custom";

    const merged = {
      user_id: userId,
      id: agentId,
      name: resolvedName,
      role: resolvedRole,
      avatar_color:
        body.avatar_color !== undefined ? body.avatar_color : existing?.avatar_color ?? "cream",
      is_system: false,
      locked: false,
      created_by: "user",
      pending: false,
      env: body.env ?? existing?.env ?? "prod",
      prompt: body.prompt !== undefined ? body.prompt : existing?.prompt ?? null,
      model: body.model !== undefined ? body.model : existing?.model ?? null,
      personality:
        body.personality !== undefined ? body.personality : existing?.personality ??
          { inner_life: true, thought_verbosity: 1, voice_description: "" },
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

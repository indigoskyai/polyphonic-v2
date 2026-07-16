// Agent Forge
//
// Luca-authored custom agent proposals from chat. This function deliberately
// keeps persistence behind an approval step: Luca may draft a blueprint, but a
// signed-in saved user must commit it before agent_configs or agent_identity
// changes are written.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ensureCanCreateCustomAgent } from "../_shared/custom-agent-entitlements.ts";

type ForgeAction = "propose_create" | "propose_update" | "commit" | "cancel";
type ForgeCommitAction = "create" | "update";
type IdentityDocType = "soul" | "convictions" | "user_model" | "self_model";
type ForgeStatus = "pending" | "approved" | "canceled" | "failed";

interface ForgeBlueprint {
  name: string;
  role: string;
  model: string;
  avatar_color: string;
  prompt: string;
  voice_description: string;
  summary: string;
  identity_docs: Record<IdentityDocType, string>;
}

interface ForgeBody {
  action?: ForgeAction;
  user_id?: string;
  thread_id?: string;
  proposal_message_id?: string;
  target_agent_id?: string;
  blueprint?: unknown;
  source_agent_id?: string;
}

const VALID_MODELS = new Set([
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k2.7-code",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4-7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-opus-4.1",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "x-ai/grok-4.20",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "moonshotai/kimi-k2.6",
  "moonshotai/kimi-k2.5",
]);

const VALID_AVATAR_COLORS = new Set(["cream", "ochre", "blue", "magenta", "sage", "violet"]);
const RESERVED_AGENT_IDS = new Set(["luca", "observer", "anima", "vektor"]);
const DOC_TYPES: IdentityDocType[] = ["soul", "convictions", "user_model", "self_model"];
const MAX_NAME = 40;
const MAX_ROLE = 80;
const MAX_PROMPT = 16_000;
const MAX_SUMMARY = 1_000;
const MAX_DOC = 32 * 1024;

const SEED_TOOLS = [
  { id: "browse", name: "browse", on: false, gated: true },
  { id: "workspace_file", name: "workspace.file", on: true },
  { id: "web_search", name: "web.search", on: true },
  { id: "read_url", name: "read.url", on: true },
  { id: "memory_read", name: "memory.read", on: true },
  { id: "memory_write", name: "memory.write", on: true },
  { id: "update_soul", name: "soul.update", on: false, gated: true },
  { id: "update_self_model", name: "self-model.update", on: false, gated: true },
];

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

function fail(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: false, error: message, ...extra }, status);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base || "agent";
}

function validateBlueprint(value: unknown): { ok: true; blueprint: ForgeBlueprint } | { ok: false; error: string } {
  const raw = asRecord(value);
  const docsRaw = asRecord(raw.identity_docs);
  const name = readString(raw, "name");
  const role = readString(raw, "role");
  const model = readString(raw, "model");
  const avatarColor = readString(raw, "avatar_color");
  const prompt = readString(raw, "prompt");
  const voiceDescription = readString(raw, "voice_description");
  const summary = readString(raw, "summary") || `${name} is a ${role}.`;

  if (!name) return { ok: false, error: "Blueprint name is required" };
  if (name.length > MAX_NAME) return { ok: false, error: `Blueprint name must be ${MAX_NAME} characters or fewer` };
  if (!role) return { ok: false, error: "Blueprint role is required" };
  if (role.length > MAX_ROLE) return { ok: false, error: `Blueprint role must be ${MAX_ROLE} characters or fewer` };
  if (!VALID_MODELS.has(model)) return { ok: false, error: "Blueprint model is not allowed" };
  if (!VALID_AVATAR_COLORS.has(avatarColor)) return { ok: false, error: "Blueprint avatar color is not allowed" };
  if (!prompt) return { ok: false, error: "Blueprint runtime instructions are required" };
  if (prompt.length > MAX_PROMPT) return { ok: false, error: `Runtime instructions exceed ${MAX_PROMPT} characters` };
  if (summary.length > MAX_SUMMARY) return { ok: false, error: `Identity summary exceeds ${MAX_SUMMARY} characters` };

  const identityDocs = {} as Record<IdentityDocType, string>;
  for (const docType of DOC_TYPES) {
    const content = typeof docsRaw[docType] === "string" ? (docsRaw[docType] as string).trim() : "";
    if (!content) return { ok: false, error: `${docType} is required` };
    if (content.length > MAX_DOC) return { ok: false, error: `${docType} exceeds ${MAX_DOC} characters` };
    identityDocs[docType] = content;
  }

  return {
    ok: true,
    blueprint: {
      name,
      role,
      model,
      avatar_color: avatarColor,
      prompt,
      voice_description: voiceDescription,
      summary,
      identity_docs: identityDocs,
    },
  };
}

async function resolveCaller(
  req: Request,
  body: ForgeBody,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
): Promise<{ userId: string; userEmail: string; admin: any } | { error: Response }> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: fail("Unauthorized", 401) };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (token === serviceRoleKey) {
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) return { error: fail("Internal Forge calls require user_id", 400) };
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return { error: fail("User not found", 404) };
    return { userId, userEmail: data.user.email || "", admin };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return { error: fail("Unauthorized", 401) };
  return { userId: data.user.id, userEmail: data.user.email || "", admin };
}

async function ensureThreadOwned(admin: any, userId: string, threadId: string): Promise<Response | null> {
  const { data, error } = await admin
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[agent-forge] thread ownership check failed:", error);
    return fail("Could not verify thread ownership", 500);
  }
  if (!data) return fail("Thread not found", 404);
  return null;
}

async function ensureEditableAgent(admin: any, userId: string, agentId: string): Promise<{ ok: true; agent: any } | { ok: false; response: Response }> {
  if (!agentId || RESERVED_AGENT_IDS.has(agentId)) {
    return { ok: false, response: fail("Resident agents cannot be modified by Forge", 403) };
  }
  const { data, error } = await admin
    .from("agent_configs")
    .select("id, user_id, is_system, locked")
    .eq("user_id", userId)
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    console.error("[agent-forge] agent ownership check failed:", error);
    return { ok: false, response: fail("Could not verify agent ownership", 500) };
  }
  if (!data) return { ok: false, response: fail("Agent not found", 404) };
  if (data.is_system || data.locked) {
    return { ok: false, response: fail("Resident or locked agents cannot be modified by Forge", 403) };
  }
  return { ok: true, agent: data };
}

async function createUniqueAgentId(admin: any, userId: string, name: string): Promise<string> {
  const base = slugify(name);
  const { data } = await admin.from("agent_configs").select("id").eq("user_id", userId);
  const existing = new Set((data || []).map((row: { id: string }) => row.id));
  let id = base;
  let suffix = 2;
  while (existing.has(id) || RESERVED_AGENT_IDS.has(id)) {
    id = `${base}-${suffix++}`;
  }
  return id;
}

async function ensureUserOpenRouterKey(admin: any, userId: string): Promise<Response | null> {
  const { data, error } = await admin.rpc("decrypt_user_api_key", { p_user_id: userId });
  if (error) {
    console.error("[agent-forge] OpenRouter key check failed:", error);
    return fail("Could not verify OpenRouter connection", 500);
  }
  const key = typeof data === "string" ? data.trim() : "";
  if (key) return null;
  return fail(
    "Connect OpenRouter before creating or updating agents.",
    400,
    { code: "missing_api_key", requires_openrouter: true },
  );
}

function proposalMetadata(params: {
  action: ForgeCommitAction;
  blueprint: ForgeBlueprint;
  targetAgentId?: string | null;
  status?: ForgeStatus;
}) {
  return {
    forge_kind: "agent_forge_proposal",
    forge_status: params.status || "pending",
    forge_action: params.action,
    target_agent_id: params.targetAgentId || null,
    blueprint: params.blueprint,
    agent: "luca",
  };
}

async function insertProposal(
  admin: any,
  userId: string,
  threadId: string,
  action: ForgeCommitAction,
  blueprint: ForgeBlueprint,
  targetAgentId?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; response: Response }> {
  // Detect whether this is a revision of an earlier proposal for the same name
  // in the same thread, so the stored content (and the next-turn history recap)
  // reflects that this is a fresh draft, not the first one.
  let priorProposalCount = 0;
  try {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .eq("agent", "luca")
      .filter("metadata->>forge_kind", "eq", "agent_forge_proposal")
      .filter("metadata->blueprint->>name", "eq", blueprint.name);
    priorProposalCount = typeof count === "number" ? count : 0;
  } catch (e) {
    console.warn("[agent-forge] prior proposal lookup failed:", e);
  }
  const isRevision = priorProposalCount > 0;
  const content = action === "update"
    ? `Drafted updates to ${blueprint.name} — review the revised Forge proposal below.`
    : isRevision
      ? `Drafted a revised ${blueprint.name} — review the new Forge proposal below.`
      : `Drafted ${blueprint.name} — review the Forge proposal below.`;

  const { data, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: "assistant",
      agent: "luca",
      // No schema migration in Forge v1: the DB CHECK does not yet allow an
      // agent_forge_proposal kind, so the UI keys off metadata.forge_kind.
      kind: "permission_request",
      content,
      metadata: proposalMetadata({ action, blueprint, targetAgentId }),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[agent-forge] proposal insert failed:", error);
    return { ok: false, response: fail("Could not create Forge proposal", 500) };
  }
  return { ok: true, id: data.id as string };
}


async function upsertIdentityDocs(admin: any, userId: string, agentId: string, docs: Record<IdentityDocType, string>) {
  const rows = DOC_TYPES.map((docType) => ({
    user_id: userId,
    agent_id: agentId,
    doc_type: docType,
    content: docs[docType],
  }));
  return await admin
    .from("agent_identity")
    .upsert(rows, { onConflict: "user_id,agent_id,doc_type" });
}

async function markProposal(admin: any, userId: string, messageId: string, metadata: Record<string, unknown>) {
  return await admin
    .from("messages")
    .update({ metadata })
    .eq("id", messageId)
    .eq("user_id", userId)
    .select("id, metadata")
    .single();
}

Deno.serve(async (req): Promise<Response> => {
  corsHeaders = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return fail("Server misconfigured", 500);

  let body: ForgeBody;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }

  const caller = await resolveCaller(req, body, supabaseUrl, anonKey, serviceRoleKey);
  if ("error" in caller) return caller.error;
  const { userId, userEmail, admin } = caller;

  const action = body.action;
  if (!action) return fail("Field 'action' is required", 400);

  try {
    if (action === "propose_create" || action === "propose_update") {
      const keyError = await ensureUserOpenRouterKey(admin, userId);
      if (keyError) return keyError;

      const threadId = typeof body.thread_id === "string" ? body.thread_id.trim() : "";
      if (!threadId) return fail("Field 'thread_id' is required", 400);
      const threadError = await ensureThreadOwned(admin, userId, threadId);
      if (threadError) return threadError;

      const validation = validateBlueprint(body.blueprint);
      if (!validation.ok) return fail(validation.error, 400);
      const forgeAction: ForgeCommitAction = action === "propose_create" ? "create" : "update";
      const targetAgentId = typeof body.target_agent_id === "string" ? body.target_agent_id.trim() : "";

      if (forgeAction === "update") {
        const owned = await ensureEditableAgent(admin, userId, targetAgentId);
        if ("response" in owned) return owned.response;
      } else {
        const entitlement = await ensureCanCreateCustomAgent(admin, userId, userEmail);
        if (!entitlement.ok) return fail(String(entitlement.body.error || "Additional agents require $MNEMOS access"), entitlement.status);
      }

      const inserted = await insertProposal(admin, userId, threadId, forgeAction, validation.blueprint, targetAgentId || null);
      if ("response" in inserted) return inserted.response;

      return jsonResponse({
        ok: true,
        proposal_message_id: inserted.id,
        forge_status: "pending",
        forge_action: forgeAction,
      });
    }

    const proposalMessageId = typeof body.proposal_message_id === "string" ? body.proposal_message_id.trim() : "";
    if (!proposalMessageId) return fail("Field 'proposal_message_id' is required", 400);

    const { data: proposal, error: proposalError } = await admin
      .from("messages")
      .select("id, thread_id, user_id, metadata")
      .eq("id", proposalMessageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (proposalError) {
      console.error("[agent-forge] proposal fetch failed:", proposalError);
      return fail("Could not load Forge proposal", 500);
    }
    if (!proposal) return fail("Forge proposal not found", 404);

    const metadata = asRecord(proposal.metadata);
    if (metadata.forge_kind !== "agent_forge_proposal") return fail("Message is not a Forge proposal", 400);
    if (metadata.forge_status !== "pending") return fail("Forge proposal is no longer pending", 409);

    if (action === "cancel") {
      const nextMeta = {
        ...metadata,
        forge_status: "canceled",
        forge_resolved_at: new Date().toISOString(),
      };
      const { data, error } = await markProposal(admin, userId, proposalMessageId, nextMeta);
      if (error) {
        console.error("[agent-forge] proposal cancel failed:", error);
        return fail("Could not cancel Forge proposal", 500);
      }
      return jsonResponse({ ok: true, proposal: data, forge_status: "canceled" });
    }

    if (action !== "commit") return fail(`Unknown Forge action '${action}'`, 400);
    const keyError = await ensureUserOpenRouterKey(admin, userId);
    if (keyError) return keyError;

    const forgeAction = metadata.forge_action === "update" ? "update" : "create";
    const validation = validateBlueprint(metadata.blueprint);
    if (!validation.ok) return fail(validation.error, 400);
    const blueprint = validation.blueprint;

    let agentId = typeof metadata.target_agent_id === "string" ? metadata.target_agent_id.trim() : "";
    if (forgeAction === "update") {
      const owned = await ensureEditableAgent(admin, userId, agentId);
      if ("response" in owned) return owned.response;
    } else {
      const entitlement = await ensureCanCreateCustomAgent(admin, userId, userEmail);
      if (!entitlement.ok) return fail(String(entitlement.body.error || "Additional agents require $MNEMOS access"), entitlement.status);
      agentId = await createUniqueAgentId(admin, userId, blueprint.name);
    }

    const personality = {
      inner_life: true,
      thought_verbosity: 1,
      voice_description: blueprint.voice_description,
      proactive_autonomy: false,
    };

    const configPayload = {
      user_id: userId,
      id: agentId,
      name: blueprint.name,
      role: blueprint.role,
      avatar_color: blueprint.avatar_color,
      is_system: false,
      locked: false,
      created_by: "luca",
      pending: false,
      env: "prod",
      model: blueprint.model,
      prompt: blueprint.prompt,
      personality,
      tools: SEED_TOOLS,
      subagents: [],
      voices: [],
      updated_at: new Date().toISOString(),
    };

    const configWrite = forgeAction === "create"
      ? await admin.from("agent_configs").insert(configPayload).select().single()
      : await admin
        .from("agent_configs")
        .update({
          name: blueprint.name,
          role: blueprint.role,
          avatar_color: blueprint.avatar_color,
          model: blueprint.model,
          prompt: blueprint.prompt,
          personality,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("id", agentId)
        .select()
        .single();

    if (configWrite.error) {
      console.error("[agent-forge] config write failed:", configWrite.error);
      return fail("Could not save agent configuration", 500);
    }

    const docsWrite = await upsertIdentityDocs(admin, userId, agentId, blueprint.identity_docs);
    if (docsWrite.error) {
      console.error("[agent-forge] identity write failed:", docsWrite.error);
      if (forgeAction === "create") {
        await admin.from("agent_configs").delete().eq("user_id", userId).eq("id", agentId);
      }
      const failedMeta = {
        ...metadata,
        forge_status: "failed",
        error: "Could not save agent identity documents",
        forge_resolved_at: new Date().toISOString(),
      };
      await markProposal(admin, userId, proposalMessageId, failedMeta);
      return fail("Could not save agent identity documents", 500);
    }

    const nextMeta = {
      ...metadata,
      blueprint,
      forge_status: "approved",
      created_agent_id: agentId,
      forge_resolved_at: new Date().toISOString(),
    };
    const { data: updatedProposal, error: markError } = await markProposal(admin, userId, proposalMessageId, nextMeta);
    if (markError) {
      console.error("[agent-forge] proposal approval mark failed:", markError);
      return fail("Agent saved, but proposal status could not be updated", 500);
    }

    return jsonResponse({
      ok: true,
      forge_status: "approved",
      agent: configWrite.data,
      created_agent_id: agentId,
      proposal: updatedProposal,
    });
  } catch (err) {
    console.error("[agent-forge] unexpected error:", err);
    return fail("Internal server error", 500);
  }
});

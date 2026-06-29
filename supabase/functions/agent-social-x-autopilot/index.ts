import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { authorizeCronOrSelf } from "../_shared/cronAuth.ts";
import { trackCronJob } from "../_shared/cronHealth.ts";
import { buildCustomAgentSystemPrompt } from "../_shared/agents/custom-agent-prompt.ts";
import { openRouterChat } from "../_shared/openrouter.ts";
import { resolveOpenRouterKeyForUser, resolveRoleModel } from "../_shared/model-backend.ts";
import {
  decryptSocialToken,
  encryptSocialToken,
  jsonResponse,
  mergeBilling,
  mergePolicy,
  policyAllowsPosting,
  refreshXToken,
  sanitizePostText,
  X_API_BASE,
} from "../_shared/social-x.ts";

type AdminClient = ReturnType<typeof createClient>;

interface ChannelRecord {
  id: string;
  user_id: string;
  agent_id: string;
  platform: "x";
  status: string;
  x_user_id: string | null;
  x_username: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  posting_enabled: boolean;
  policy: Record<string, unknown>;
  billing: Record<string, unknown>;
  connected_at: string | null;
  last_posted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentRecord {
  id: string;
  name: string;
  role: string | null;
  model: string | null;
  prompt: string | null;
}

interface GeneratedPost {
  text: string;
  rationale: string;
  safety: Record<string, unknown>;
}

type RunResult =
  | { channel_id: string; agent_id: string; status: "draft_created"; post_id: string; text: string; reason?: string }
  | { channel_id: string; agent_id: string; status: "posted"; post_id: string; external_post_id: string; text: string }
  | { channel_id: string; agent_id: string; status: "skipped" | "blocked" | "failed"; reason: string };

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "run_due";
    const targetUserId = typeof body.user_id === "string" ? body.user_id.trim() : null;
    const auth = await authorizeCronOrSelf(req, targetUserId);
    if (!auth.ok) return jsonResponse(req, { error: auth.error }, auth.status);

    const admin = adminClient();
    if (action === "run_once") {
      const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
      const userId = auth.userId ?? targetUserId ?? "";
      if (!userId) return jsonResponse(req, { error: "user_id is required for service runs" }, 400);
      if (!agentId) return jsonResponse(req, { error: "agent_id is required" }, 400);

      const channel = await getChannel(admin, userId, agentId);
      if (!channel) return jsonResponse(req, { error: "Connect X before running autopilot" }, 400);
      const result = await runAutonomousTurn(admin, channel, { force: body.force === true });
      return jsonResponse(req, { result });
    }

    if (action === "run_due") {
      return await trackCronJob("agent-social-x-autopilot", async () => {
        const limit = clampInt(body.limit, 1, 50, 12);
        const channels = await listDueCandidateChannels(admin, auth.userId ?? targetUserId, limit);
        const results: RunResult[] = [];
        for (const channel of channels) {
          results.push(await runAutonomousTurn(admin, channel, { force: false }));
        }
        return jsonResponse(req, {
          results,
          counts: {
            processed: results.length,
            posted: results.filter((row) => row.status === "posted").length,
            drafts: results.filter((row) => row.status === "draft_created").length,
            blocked: results.filter((row) => row.status === "blocked").length,
            skipped: results.filter((row) => row.status === "skipped").length,
            failed: results.filter((row) => row.status === "failed").length,
          },
        });
      });
    }

    return jsonResponse(req, { error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("[agent-social-x-autopilot] failed", error);
    return jsonResponse(
      req,
      { error: error instanceof Error ? error.message : "Agent X autopilot failed" },
      500,
    );
  }
});

async function runAutonomousTurn(
  admin: AdminClient,
  channel: ChannelRecord,
  opts: { force: boolean },
): Promise<RunResult> {
  const base = { channel_id: channel.id, agent_id: channel.agent_id };
  if (channel.status !== "connected") return { ...base, status: "skipped", reason: "X account is not connected" };
  if (channel.posting_enabled !== true) return { ...base, status: "skipped", reason: "Posting is disabled" };

  const policy = mergePolicy(channel.policy);
  const billing = mergeBilling(channel.billing);
  const policyGate = policyAllowsPosting(policy);
  if (!policyGate.ok) return { ...base, status: "blocked", reason: policyGate.error };

  const cadence = await cadenceGate(admin, channel, policy, opts.force);
  if (!cadence.ok) return { ...base, status: "skipped", reason: cadence.reason };

  const cost = Number(billing.post_cost_credits) || 1;
  const balance = await getBalance(admin, channel.user_id, channel.id);
  if (balance < cost) return { ...base, status: "blocked", reason: "Insufficient social posting credits" };

  const spentToday = await getSpentToday(admin, channel.user_id, channel.id);
  if (spentToday + cost > Number(billing.daily_spend_limit_credits)) {
    return { ...base, status: "blocked", reason: "Daily social posting credit limit reached" };
  }

  const agent = await getAgent(admin, channel.user_id, channel.agent_id);
  if (!agent) return { ...base, status: "blocked", reason: "Agent not found" };

  let generated: GeneratedPost;
  try {
    generated = await generateAgentPost(admin, channel, agent, policy);
  } catch (error) {
    return {
      ...base,
      status: "failed",
      reason: error instanceof Error ? error.message : "Could not generate agent post",
    };
  }

  const approvalRequired = policy.approval_mode !== "autopilot";
  const text = sanitizePostText(generated.text);
  if (!text) return { ...base, status: "failed", reason: "Generated post was empty" };
  const generationMetadata = {
    rationale: generated.rationale,
    safety: generated.safety,
  };

  const { data: post, error: insertError } = await admin
    .from("agent_social_posts")
    .insert({
      user_id: channel.user_id,
      channel_id: channel.id,
      agent_id: channel.agent_id,
      platform: "x",
      status: approvalRequired ? "draft" : "posting",
      approval_required: approvalRequired,
      text,
      scheduled_for: new Date().toISOString(),
      cost_credits: cost,
      metadata: {
        created_from: "agent_social_x_autopilot",
        generation: generationMetadata,
      },
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  const postId = typeof post?.id === "string" ? post.id : "";
  if (!postId) throw new Error("Could not create autonomous social post");

  if (approvalRequired) {
    await logActivity(admin, channel, "X draft prepared", text, { post_id: postId, approval_required: true });
    return {
      ...base,
      status: "draft_created",
      post_id: postId,
      text,
      reason: "Approval mode is enabled",
    };
  }

  const published = await publishPost(admin, channel, postId, text, cost, billing, generationMetadata);
  if (published.ok) {
    return { ...base, status: "posted", post_id: postId, external_post_id: published.externalPostId, text };
  }

  return { ...base, status: "failed", reason: published.reason };
}

async function generateAgentPost(
  admin: AdminClient,
  channel: ChannelRecord,
  agent: AgentRecord,
  policy: Record<string, unknown>,
): Promise<GeneratedPost> {
  const { apiKey, keySource } = await resolveOpenRouterKeyForUser(admin, channel.user_id);
  if (!apiKey) throw new Error("No model API key configured for autonomous social posting");

  const model = agent.model || await resolveRoleModel(admin, channel.user_id, channel.agent_id, "voice");
  const system = buildCustomAgentSystemPrompt({
    agentName: agent.name,
    agentPrompt: agent.prompt,
  });
  const prompt = [
    "You are preparing one autonomous X post for this Polyphonic agent.",
    "Return ONLY compact JSON with keys: text, rationale, safety.",
    "The text must be one post, 260 characters or fewer, no thread, no markdown, no fabricated news, no private user data, no engagement bait, and no prohibited-topic content.",
    "If the agent has nothing worth saying under the policy, write a quiet, low-risk original thought instead of forcing a claim.",
    "",
    `Agent name: ${agent.name}`,
    `Agent role: ${agent.role ?? "custom agent"}`,
    `Connected X handle: @${channel.x_username ?? "unknown"}`,
    `Mode: ${policy.approval_mode === "autopilot" ? "publish if all gates pass" : "draft for human approval"}`,
    `Allowed topics: ${stringList(policy.topics).join(", ") || "open, as long as it fits the agent"}`,
    `Never post about: ${stringList(policy.prohibited_topics).join(", ") || "none configured"}`,
    `Human-managed account: ${typeof policy.human_account_handle === "string" ? policy.human_account_handle : ""}`,
    `Model key source: ${keySource ?? "none"}`,
  ].join("\n");

  const resp = await openRouterChat({
    apiKey,
    body: {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 420,
      response_format: { type: "json_object" },
    },
  });
  const raw = await resp.json().catch(() => ({}));
  const content = extractMessageText(raw);
  const parsed = parseGeneratedPost(content);
  const text = sanitizePostText(parsed.text);
  if (!text) throw new Error("Generated post did not include text");
  return {
    text,
    rationale: parsed.rationale,
    safety: parsed.safety,
  };
}

async function publishPost(
  admin: AdminClient,
  channel: ChannelRecord,
  postId: string,
  text: string,
  cost: number,
  billing: Record<string, unknown>,
  generation: Record<string, unknown>,
): Promise<{ ok: true; externalPostId: string } | { ok: false; reason: string }> {
  try {
    const accessToken = await usableAccessToken(admin, channel);
    const xResp = await fetch(`${X_API_BASE}/tweets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    const xData = await xResp.json().catch(() => ({}));
    if (!xResp.ok || !xData?.data?.id) {
      console.error("[agent-social-x-autopilot] post failed", xResp.status, xData);
      throw new Error(xData?.detail || xData?.title || "X post failed");
    }

    const postedAt = new Date().toISOString();
    await admin
      .from("agent_social_posts")
      .update({
        status: "posted",
        posted_at: postedAt,
        external_post_id: xData.data.id,
        cost_credits: cost,
        metadata: {
          created_from: "agent_social_x_autopilot",
          generation,
          x_response: xData,
        },
      })
      .eq("id", postId)
      .eq("user_id", channel.user_id);
    await admin.from("agent_social_credit_ledger").insert({
      user_id: channel.user_id,
      channel_id: channel.id,
      agent_id: channel.agent_id,
      source: "post_debit",
      amount_credits: -cost,
      description: `Autonomous post to X as @${channel.x_username ?? "connected account"}`,
      metadata: { post_id: postId, external_post_id: xData.data.id, billing_mode: billing.mode },
    });
    await admin
      .from("agent_social_channels")
      .update({ last_posted_at: postedAt })
      .eq("id", channel.id)
      .eq("user_id", channel.user_id);
    await logActivity(admin, channel, "Autonomous X post", text, {
      post_id: postId,
      external_post_id: xData.data.id,
    });
    return { ok: true, externalPostId: xData.data.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "X post failed";
    await admin
      .from("agent_social_posts")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", postId)
      .eq("user_id", channel.user_id);
    return { ok: false, reason };
  }
}

async function cadenceGate(
  admin: AdminClient,
  channel: ChannelRecord,
  policy: Record<string, unknown>,
  force: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cadence = clampInt(policy.cadence_per_day, 1, 24, 2);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("agent_social_posts")
    .select("created_at,status,metadata")
    .eq("user_id", channel.user_id)
    .eq("channel_id", channel.id)
    .gte("created_at", start.toISOString())
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ created_at?: unknown; status?: unknown }>;
  const generatedToday = rows.filter((row) => row.status !== "failed").length;
  if (generatedToday >= cadence) return { ok: false, reason: "Daily posting cadence already reached" };

  if (force) return { ok: true };

  const latest = typeof rows[0]?.created_at === "string" ? rows[0].created_at : channel.last_posted_at;
  if (latest) {
    const minIntervalMs = Math.floor((24 * 60 * 60 * 1000) / cadence);
    const latestMs = new Date(latest).getTime();
    if (Number.isFinite(latestMs) && Date.now() - latestMs < minIntervalMs) {
      return { ok: false, reason: "Autonomous posting interval has not elapsed" };
    }
  }

  return { ok: true };
}

async function listDueCandidateChannels(
  admin: AdminClient,
  userId: string | null,
  limit: number,
): Promise<ChannelRecord[]> {
  let query = admin
    .from("agent_social_channels")
    .select("*")
    .eq("platform", "x")
    .eq("status", "connected")
    .eq("posting_enabled", true)
    .order("last_posted_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ChannelRecord[];
}

async function getChannel(admin: AdminClient, userId: string, agentId: string): Promise<ChannelRecord | null> {
  const { data, error } = await admin
    .from("agent_social_channels")
    .select("*")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("platform", "x")
    .maybeSingle();
  if (error) throw error;
  return data as ChannelRecord | null;
}

async function getAgent(admin: AdminClient, userId: string, agentId: string): Promise<AgentRecord | null> {
  const { data, error } = await admin
    .from("agent_configs")
    .select("id,name,role,model,prompt")
    .eq("user_id", userId)
    .eq("id", agentId)
    .eq("pending", false)
    .maybeSingle();
  if (error) throw error;
  return data as AgentRecord | null;
}

async function usableAccessToken(admin: AdminClient, channel: ChannelRecord): Promise<string> {
  const { data: rawCredential, error: credentialError } = await admin
    .from("agent_social_channel_credentials")
    .select("*")
    .eq("channel_id", channel.id)
    .eq("user_id", channel.user_id)
    .maybeSingle();
  if (credentialError) throw credentialError;
  const credential = rawCredential as {
    encrypted_access_token?: string;
    encrypted_refresh_token?: string;
    token_type?: string | null;
    scopes?: string[];
    expires_at?: string | null;
  } | null;
  if (!credential?.encrypted_access_token) throw new Error("X credentials are not available");

  const expiresAt = credential.expires_at ? new Date(credential.expires_at).getTime() : 0;
  const shouldRefresh = expiresAt > 0 && expiresAt - Date.now() < 2 * 60 * 1000;
  if (!shouldRefresh || !credential.encrypted_refresh_token) {
    return decryptSocialToken(credential.encrypted_access_token);
  }

  const refreshToken = await decryptSocialToken(credential.encrypted_refresh_token);
  const refreshed = await refreshXToken(refreshToken);
  const nextExpiresAt = typeof refreshed.expires_in === "number"
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : credential.expires_at;
  await admin
    .from("agent_social_channel_credentials")
    .update({
      encrypted_access_token: await encryptSocialToken(refreshed.access_token),
      encrypted_refresh_token: refreshed.refresh_token
        ? await encryptSocialToken(refreshed.refresh_token)
        : credential.encrypted_refresh_token,
      token_type: refreshed.token_type ?? credential.token_type,
      scopes: typeof refreshed.scope === "string" ? refreshed.scope.split(" ") : credential.scopes,
      expires_at: nextExpiresAt,
    })
    .eq("channel_id", channel.id);
  return refreshed.access_token;
}

async function getBalance(admin: AdminClient, userId: string, channelId: string): Promise<number> {
  const { data, error } = await admin.rpc("agent_social_credit_balance", {
    p_user_id: userId,
    p_channel_id: channelId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

async function getSpentToday(admin: AdminClient, userId: string, channelId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("agent_social_credit_ledger")
    .select("amount_credits")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .eq("source", "post_debit")
    .gte("created_at", start.toISOString());
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: { amount_credits: unknown }) => {
    const amount = Number(row.amount_credits);
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
}

async function logActivity(
  admin: AdminClient,
  channel: ChannelRecord,
  title: string,
  summary: string,
  content: Record<string, unknown>,
) {
  await admin.from("entity_activity_log").insert({
    user_id: channel.user_id,
    agent_id: channel.agent_id,
    activity_type: "social_x_post",
    title,
    summary: summary.slice(0, 120),
    content: { platform: "x", ...content },
    source: "agent_social_x_autopilot",
  });
}

function adminClient(): AdminClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase environment is not configured");
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

function extractMessageText(raw: unknown): string {
  const value = raw as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function parseGeneratedPost(content: string): GeneratedPost {
  const parsed = safeJson(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model did not return valid post JSON");
  }
  const value = parsed as Record<string, unknown>;
  const text = typeof value.text === "string" ? value.text : "";
  return {
    text,
    rationale: typeof value.rationale === "string" ? value.rationale.slice(0, 500) : "",
    safety: value.safety && typeof value.safety === "object" && !Array.isArray(value.safety)
      ? value.safety as Record<string, unknown>
      : {},
  };
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

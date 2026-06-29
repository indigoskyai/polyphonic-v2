import {
  assertEditableAgent,
  decryptSocialToken,
  defaultXBilling,
  defaultXPolicy,
  encryptSocialToken,
  jsonResponse,
  mergeBilling,
  mergePolicy,
  policyAllowsPosting,
  refreshXToken,
  requireUser,
  sanitizePostText,
  X_API_BASE,
} from "../_shared/social-x.ts";
import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

type AdminClient = any;

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

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "status";
  const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  if (!agentId) return jsonResponse(req, { error: "agent_id is required" }, 400);

  const agent = await assertEditableAgent(ctx.admin, ctx.userId, agentId);
  if (!agent.ok) return jsonResponse(req, { error: agent.error }, agent.status);

  try {
    if (action === "status") {
      return jsonResponse(req, await channelSummary(ctx.admin, ctx.userId, agentId));
    }

    if (action === "configure") {
      const existing = await getChannel(ctx.admin, ctx.userId, agentId);
      const nextPolicy = mergePolicy({
        ...(existing?.policy ?? defaultXPolicy()),
        ...(isObject(body.policy) ? body.policy : {}),
      });
      const nextBilling = mergeBilling({
        ...(existing?.billing ?? defaultXBilling()),
        ...(isObject(body.billing) ? body.billing : {}),
      });
      const wantsPosting = body.posting_enabled === true;
      const enabled = wantsPosting
        && existing?.status === "connected"
        && policyAllowsPosting(nextPolicy).ok;

      const { error } = await ctx.admin
        .from("agent_social_channels")
        .upsert({
          user_id: ctx.userId,
          agent_id: agentId,
          platform: "x",
          status: existing?.status ?? "draft",
          policy: nextPolicy,
          billing: nextBilling,
          posting_enabled: enabled,
        }, { onConflict: "user_id,agent_id,platform" });
      if (error) throw error;

      return jsonResponse(req, await channelSummary(ctx.admin, ctx.userId, agentId));
    }

    if (action === "disconnect") {
      const existing = await requireChannel(ctx.admin, ctx.userId, agentId);
      if (!existing) return jsonResponse(req, { error: "Connect X before configuring this channel" }, 400);
      await ctx.admin.from("agent_social_channel_credentials").delete().eq("channel_id", existing.id);
      const { error } = await ctx.admin
        .from("agent_social_channels")
        .update({ status: "disconnected", posting_enabled: false })
        .eq("id", existing.id)
        .eq("user_id", ctx.userId);
      if (error) throw error;
      return jsonResponse(req, await channelSummary(ctx.admin, ctx.userId, agentId));
    }

    if (action === "draft_post") {
      const channel = await requireChannel(ctx.admin, ctx.userId, agentId);
      if (!channel) return jsonResponse(req, { error: "Connect X before drafting posts" }, 400);
      const text = sanitizePostText(body.text);
      if (!text) return jsonResponse(req, { error: "Post text is required" }, 400);
      const policy = mergePolicy(channel.policy);
      const status = policy.approval_mode === "autopilot" ? "queued" : "draft";
      const { data, error } = await ctx.admin
        .from("agent_social_posts")
        .insert({
          user_id: ctx.userId,
          channel_id: channel.id,
          agent_id: agentId,
          platform: "x",
          status,
          approval_required: policy.approval_mode !== "autopilot",
          text,
          cost_credits: Number(mergeBilling(channel.billing).post_cost_credits) || 1,
          metadata: { created_from: "polyphonic_ui" },
        })
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse(req, { post: data, summary: await channelSummary(ctx.admin, ctx.userId, agentId) });
    }

    if (action === "approve_post") {
      const channel = await requireChannel(ctx.admin, ctx.userId, agentId);
      if (!channel) return jsonResponse(req, { error: "Connect X before approving posts" }, 400);
      const postId = typeof body.post_id === "string" ? body.post_id : "";
      if (!postId) return jsonResponse(req, { error: "post_id is required" }, 400);
      const { error } = await ctx.admin
        .from("agent_social_posts")
        .update({ status: "approved", approval_required: false })
        .eq("id", postId)
        .eq("user_id", ctx.userId)
        .eq("channel_id", channel.id);
      if (error) throw error;
      return jsonResponse(req, await channelSummary(ctx.admin, ctx.userId, agentId));
    }

    if (action === "post_now") {
      const result = await postNow(req, ctx.admin, ctx.userId, agentId, body);
      if (result instanceof Response) return result;
      return jsonResponse(req, result);
    }

    return jsonResponse(req, { error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("[agent-social-x-channel] failed", error);
    return jsonResponse(
      req,
      { error: error instanceof Error ? error.message : "Agent X channel failed" },
      500,
    );
  }
});

async function channelSummary(admin: AdminClient, userId: string, agentId: string) {
  const channel = await getChannel(admin, userId, agentId);
  const posts = channel
    ? await admin
      .from("agent_social_posts")
      .select("id,status,text,scheduled_for,posted_at,external_post_id,failure_reason,cost_credits,created_at")
      .eq("user_id", userId)
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: false })
      .limit(8)
    : { data: [] };
  const balance = channel ? await getBalance(admin, userId, channel.id) : 0;
  return {
    channel: channel
      ? {
          ...channel,
          policy: mergePolicy(channel.policy),
          billing: mergeBilling(channel.billing),
        }
      : null,
    balance_credits: balance,
    posts: posts.data ?? [],
    defaults: {
      policy: defaultXPolicy(),
      billing: defaultXBilling(),
    },
  };
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

async function requireChannel(admin: AdminClient, userId: string, agentId: string): Promise<ChannelRecord | null> {
  const channel = await getChannel(admin, userId, agentId);
  return channel;
}

async function postNow(
  req: Request,
  admin: AdminClient,
  userId: string,
  agentId: string,
  body: Record<string, unknown>,
) {
  const channel = await requireChannel(admin, userId, agentId);
  if (!channel) return jsonResponse(req, { error: "Connect X before posting" }, 400);
  if (channel.status !== "connected") return error(req, "X account is not connected", 400);
  if (!channel.posting_enabled && body.explicit_approval !== true) {
    return error(req, "Posting is disabled for this channel", 400);
  }

  const policy = mergePolicy(channel.policy);
  const policyGate = policyAllowsPosting(policy);
  if (!policyGate.ok) return error(req, policyGate.error, 400);
  if (policy.approval_mode === "approval_required" && body.explicit_approval !== true) {
    return error(req, "This post requires explicit approval", 400);
  }

  const billing = mergeBilling(channel.billing);
  const cost = Number(billing.post_cost_credits) || 1;
  const balance = await getBalance(admin, userId, channel.id);
  if (balance < cost) return error(req, "Insufficient social posting credits", 402);

  const spentToday = await getSpentToday(admin, userId, channel.id);
  if (spentToday + cost > Number(billing.daily_spend_limit_credits)) {
    return error(req, "Daily social posting credit limit reached", 402);
  }

  let postId = typeof body.post_id === "string" ? body.post_id : "";
  let text = sanitizePostText(body.text);
  if (postId) {
    const { data: post, error: postError } = await admin
      .from("agent_social_posts")
      .select("*")
      .eq("id", postId)
      .eq("user_id", userId)
      .eq("channel_id", channel.id)
      .maybeSingle();
    if (postError) throw postError;
    if (!post) return error(req, "Post not found", 404);
    if (!["draft", "queued", "approved", "failed"].includes(post.status)) {
      return error(req, "Post is not in a publishable state", 400);
    }
    text = sanitizePostText(post.text);
  } else {
    if (!text) return error(req, "Post text is required", 400);
    const { data: post, error: insertError } = await admin
      .from("agent_social_posts")
      .insert({
        user_id: userId,
        channel_id: channel.id,
        agent_id: agentId,
        platform: "x",
        status: "draft",
        approval_required: policy.approval_mode !== "autopilot",
        text,
        cost_credits: cost,
        metadata: { created_from: "post_now" },
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    postId = post.id;
  }

  await admin
    .from("agent_social_posts")
    .update({ status: "posting", failure_reason: null })
    .eq("id", postId)
    .eq("user_id", userId);

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
      console.error("[agent-social-x-channel] post failed", xResp.status, xData);
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
        metadata: { x_response: xData },
      })
      .eq("id", postId)
      .eq("user_id", userId);
    await admin.from("agent_social_credit_ledger").insert({
      user_id: userId,
      channel_id: channel.id,
      agent_id: agentId,
      source: "post_debit",
      amount_credits: -cost,
      description: `Posted to X as @${channel.x_username ?? "connected account"}`,
      metadata: { post_id: postId, external_post_id: xData.data.id, billing_mode: billing.mode },
    });
    await admin
      .from("agent_social_channels")
      .update({ last_posted_at: postedAt })
      .eq("id", channel.id)
      .eq("user_id", userId);
    await admin.from("entity_activity_log").insert({
      user_id: userId,
      agent_id: agentId,
      activity_type: "social_x_post",
      title: "Posted to X",
      summary: text.slice(0, 120),
      content: { platform: "x", post_id: postId, external_post_id: xData.data.id },
      source: "agent_social_x",
    });
    return {
      post: { id: postId, external_post_id: xData.data.id, posted_at: postedAt },
      summary: await channelSummary(admin, userId, agentId),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "X post failed";
    await admin
      .from("agent_social_posts")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", postId)
      .eq("user_id", userId);
    return error(req, reason, 502);
  }
}

async function usableAccessToken(admin: AdminClient, channel: ChannelRecord): Promise<string> {
  const { data: credential, error: credentialError } = await admin
    .from("agent_social_channel_credentials")
    .select("*")
    .eq("channel_id", channel.id)
    .eq("user_id", channel.user_id)
    .maybeSingle();
  if (credentialError) throw credentialError;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function error(req: Request, message: string, status: number): Response {
  return jsonResponse(req, { error: message }, status);
}

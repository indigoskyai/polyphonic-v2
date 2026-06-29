import {
  defaultXBilling,
  defaultXPolicy,
  encryptSocialToken,
  X_API_BASE,
  X_TOKEN_URL,
  X_SCOPES,
} from "../_shared/social-x.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

function redirectTo(req: Request, origin: string | null, path: string | null, params: Record<string, string>): Response {
  const safeOrigin = origin && /^https?:\/\//i.test(origin)
    ? origin
    : Deno.env.get("PUBLIC_APP_URL") || "https://polyphonic.chat";
  const safePath = path?.startsWith("/") ? path : "/settings/agents";
  const url = new URL(safePath, safeOrigin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: { ...getCorsHeaders(req), Location: url.toString() },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("X_CLIENT_ID");
  if (!supabaseUrl || !serviceKey || !clientId) {
    return redirectTo(req, null, null, { x_channel: "error", reason: "x_not_configured" });
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (!state) {
    return redirectTo(req, null, null, { x_channel: "error", reason: "missing_state" });
  }

  const { data: oauthState, error: stateError } = await admin
    .from("agent_social_oauth_states")
    .select("id,user_id,agent_id,code_verifier,redirect_origin,redirect_path,expires_at,consumed_at")
    .eq("state", state)
    .maybeSingle();

  const redirectOrigin = oauthState?.redirect_origin ?? null;
  const redirectPath = oauthState?.redirect_path ?? null;

  if (stateError || !oauthState) {
    return redirectTo(req, redirectOrigin, redirectPath, { x_channel: "error", reason: "invalid_state" });
  }
  if (oauthState.consumed_at) {
    return redirectTo(req, redirectOrigin, redirectPath, { x_channel: "error", reason: "state_consumed" });
  }
  if (new Date(oauthState.expires_at).getTime() < Date.now()) {
    return redirectTo(req, redirectOrigin, redirectPath, { x_channel: "error", reason: "state_expired" });
  }
  if (oauthError || !code) {
    await admin
      .from("agent_social_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", oauthState.id);
    return redirectTo(req, redirectOrigin, redirectPath, {
      x_channel: "error",
      reason: oauthError || "missing_code",
    });
  }

  try {
    const redirectUri = Deno.env.get("X_REDIRECT_URI")
      || `${supabaseUrl}/functions/v1/agent-social-x-oauth-callback`;
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const clientSecret = Deno.env.get("X_CLIENT_SECRET");
    if (clientSecret) headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: oauthState.code_verifier,
      client_id: clientId,
    });

    const tokenResp = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers,
      body: tokenBody,
      signal: AbortSignal.timeout(15_000),
    });
    const tokenData = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenData?.access_token) {
      console.error("[agent-social-x-oauth-callback] token exchange failed", tokenResp.status, tokenData);
      throw new Error("token_exchange_failed");
    }

    const userResp = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url,verified,description`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const userData = await userResp.json().catch(() => ({}));
    if (!userResp.ok || !userData?.data?.id) {
      console.error("[agent-social-x-oauth-callback] user fetch failed", userResp.status, userData);
      throw new Error("x_user_fetch_failed");
    }

    const now = new Date();
    const expiresAt = typeof tokenData.expires_in === "number"
      ? new Date(now.getTime() + tokenData.expires_in * 1000).toISOString()
      : null;
    const { data: existingChannel } = await admin
      .from("agent_social_channels")
      .select("policy,billing,posting_enabled")
      .eq("user_id", oauthState.user_id)
      .eq("agent_id", oauthState.agent_id)
      .eq("platform", "x")
      .maybeSingle();

    const { data: channel, error: channelError } = await admin
      .from("agent_social_channels")
      .upsert({
        user_id: oauthState.user_id,
        agent_id: oauthState.agent_id,
        platform: "x",
        status: "connected",
        x_user_id: userData.data.id,
        x_username: userData.data.username ?? null,
        display_name: userData.data.name ?? null,
        profile_image_url: userData.data.profile_image_url ?? null,
        posting_enabled: existingChannel?.posting_enabled === true,
        policy: existingChannel?.policy ?? defaultXPolicy(),
        billing: existingChannel?.billing ?? defaultXBilling(),
        connected_at: now.toISOString(),
      }, { onConflict: "user_id,agent_id,platform" })
      .select("id")
      .single();
    if (channelError || !channel?.id) {
      console.error("[agent-social-x-oauth-callback] channel upsert failed", channelError);
      throw new Error("channel_save_failed");
    }

    const encryptedAccessToken = await encryptSocialToken(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token
      ? await encryptSocialToken(tokenData.refresh_token)
      : null;

    const { error: credentialError } = await admin
      .from("agent_social_channel_credentials")
      .upsert({
        channel_id: channel.id,
        user_id: oauthState.user_id,
        platform: "x",
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        token_type: tokenData.token_type ?? "bearer",
        scopes: typeof tokenData.scope === "string" ? tokenData.scope.split(" ") : X_SCOPES,
        expires_at: expiresAt,
      }, { onConflict: "channel_id" });
    if (credentialError) {
      console.error("[agent-social-x-oauth-callback] credential upsert failed", credentialError);
      throw new Error("credential_save_failed");
    }

    await admin
      .from("agent_social_oauth_states")
      .update({ consumed_at: now.toISOString() })
      .eq("id", oauthState.id);

    await admin.from("entity_activity_log").insert({
      user_id: oauthState.user_id,
      agent_id: oauthState.agent_id,
      activity_type: "social_x_connected",
      title: "X channel connected",
      summary: `Connected @${userData.data.username ?? "x"} to agent ${oauthState.agent_id}`,
      content: { platform: "x", username: userData.data.username ?? null },
      source: "agent_social_x",
    });

    return redirectTo(req, redirectOrigin, redirectPath, {
      x_channel: "connected",
      username: userData.data.username ?? "",
    });
  } catch (err) {
    console.error("[agent-social-x-oauth-callback] failed", err);
    await admin
      .from("agent_social_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", oauthState.id);
    await admin
      .from("agent_social_channels")
      .update({ status: "needs_attention" })
      .eq("user_id", oauthState.user_id)
      .eq("agent_id", oauthState.agent_id)
      .eq("platform", "x");
    return redirectTo(req, redirectOrigin, redirectPath, {
      x_channel: "error",
      reason: err instanceof Error ? err.message : "oauth_failed",
    });
  }
});

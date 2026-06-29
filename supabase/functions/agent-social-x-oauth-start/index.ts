import {
  assertEditableAgent,
  defaultXBilling,
  defaultXPolicy,
  jsonResponse,
  pkceChallenge,
  randomBase64Url,
  requireUser,
  X_AUTH_URL,
  X_SCOPES,
} from "../_shared/social-x.ts";
import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const ctx = await requireUser(req);
    if (ctx instanceof Response) return ctx;

    const clientId = Deno.env.get("X_CLIENT_ID");
    if (!clientId) return jsonResponse(req, { error: "X_CLIENT_ID is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
    if (!agentId) return jsonResponse(req, { error: "agent_id is required" }, 400);

    const agent = await assertEditableAgent(ctx.admin, ctx.userId, agentId);
    if (!agent.ok) return jsonResponse(req, { error: agent.error }, agent.status);

    const origin = req.headers.get("Origin") || Deno.env.get("PUBLIC_APP_URL") || "https://polyphonic.chat";
    const redirectPath = typeof body.redirect_path === "string" && body.redirect_path.startsWith("/")
      ? body.redirect_path.slice(0, 256)
      : `/settings/agents/${encodeURIComponent(agentId)}`;
    const redirectUri = Deno.env.get("X_REDIRECT_URI")
      || `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-social-x-oauth-callback`;

    const state = await randomBase64Url(32);
    const codeVerifier = await randomBase64Url(64);
    const codeChallenge = await pkceChallenge(codeVerifier);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await ctx.admin
      .from("agent_social_oauth_states")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("agent_id", agentId)
      .eq("platform", "x");

    const { error: stateError } = await ctx.admin
      .from("agent_social_oauth_states")
      .insert({
        user_id: ctx.userId,
        agent_id: agentId,
        platform: "x",
        state,
        code_verifier: codeVerifier,
        redirect_origin: origin,
        redirect_path: redirectPath,
        expires_at: expiresAt,
      });
    if (stateError) {
      console.error("[agent-social-x-oauth-start] state insert failed", stateError);
      return jsonResponse(req, { error: "Could not initialize X OAuth" }, 500);
    }

    const { data: existingChannel } = await ctx.admin
      .from("agent_social_channels")
      .select("policy,billing,posting_enabled")
      .eq("user_id", ctx.userId)
      .eq("agent_id", agentId)
      .eq("platform", "x")
      .maybeSingle();

    const { error: channelError } = await ctx.admin
      .from("agent_social_channels")
      .upsert({
        user_id: ctx.userId,
        agent_id: agentId,
        platform: "x",
        status: "connecting",
        policy: existingChannel?.policy ?? defaultXPolicy(),
        billing: existingChannel?.billing ?? defaultXBilling(),
        posting_enabled: existingChannel?.posting_enabled === true,
      }, { onConflict: "user_id,agent_id,platform" });
    if (channelError) {
      console.error("[agent-social-x-oauth-start] channel upsert failed", channelError);
      return jsonResponse(req, { error: "Could not prepare X channel" }, 500);
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: X_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return jsonResponse(req, {
      auth_url: `${X_AUTH_URL}?${params.toString()}`,
      expires_at: expiresAt,
      redirect_origin: origin,
      scopes: X_SCOPES,
    });
  } catch (error) {
    console.error("[agent-social-x-oauth-start] failed", error);
    return jsonResponse(req, { error: "Could not start X connection" }, 500);
  }
});

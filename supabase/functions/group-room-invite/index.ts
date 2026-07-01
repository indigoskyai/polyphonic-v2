import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  appOrigin,
  createInviteToken,
  insertSystemMessage,
  inviteUrl,
  jsonResponse,
  normalizeHandle,
  readJson,
  requireAuthedContext,
  requireRoomManager,
  requireString,
  resolveUserByHandle,
  sha256,
} from "../_shared/group-rooms.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  return wrapHandler(corsHeaders, async () => {
    if (req.method !== "POST") throw new ValidationError("Method not allowed");
    const ctx = await requireAuthedContext(req);
    const body = await readJson(req);
    const roomId = requireString(body.room_id, "room_id");
    await requireRoomManager(ctx.admin, roomId, ctx.userId);

    const inviteeHandle = normalizeHandle(body.invitee_handle);
    const explicitInviteeUserId = typeof body.invitee_user_id === "string" && body.invitee_user_id
      ? body.invitee_user_id
      : null;
    const inviteeUserId = explicitInviteeUserId || (inviteeHandle ? await resolveUserByHandle(ctx.admin, inviteeHandle) : null);
    const expiresInHours = typeof body.expires_in_hours === "number"
      ? Math.max(1, Math.min(24 * 30, Math.floor(body.expires_in_hours)))
      : 24 * 7;
    const token = createInviteToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    const { data: invite, error } = await ctx.admin
      .from("group_room_invites")
      .insert({
        room_id: roomId,
        inviter_user_id: ctx.userId,
        invitee_user_id: inviteeUserId,
        invitee_handle: inviteeHandle,
        token_hash: tokenHash,
        status: "pending",
        history_policy: "join_forward",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw error;

    await insertSystemMessage(ctx.admin, roomId, inviteeHandle ? `Invite created for @${inviteeHandle}.` : "Invite link created.", {
      event: "invite_created",
      actor_user_id: ctx.userId,
      invite_id: invite.id,
      invitee_user_id: inviteeUserId,
      invitee_handle: inviteeHandle,
      expires_at: expiresAt,
    });

    if (inviteeUserId) {
      await ctx.admin.from("entity_activity_log").insert({
        user_id: inviteeUserId,
        agent_id: "luca",
        activity_type: "group_invite",
        title: "Group room invite",
        summary: "You were invited to a Polyphonic group room.",
        content: { room_id: roomId, invite_id: invite.id, invite_url: inviteUrl(appOrigin(req), token) },
        source: "group-room",
        severity: "important",
        surface_to_user: true,
      });
    }

    return jsonResponse({ invite, token, invite_url: inviteUrl(appOrigin(req), token) }, corsHeaders);
  })(req);
});

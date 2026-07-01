import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  insertSystemMessage,
  jsonResponse,
  loadProfileSnapshot,
  notifyRoomMembers,
  readJson,
  requireAuthedContext,
  requireString,
  roomUrl,
  appOrigin,
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
    const token = requireString(body.token, "token");
    const tokenHash = await sha256(token);

    const { data: invite, error: inviteError } = await ctx.admin
      .from("group_room_invites")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite || invite.status !== "pending") throw new ForbiddenError("This invite is no longer available.");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      await ctx.admin.from("group_room_invites").update({ status: "expired" }).eq("id", invite.id);
      throw new ForbiddenError("This invite has expired.");
    }
    if (invite.invitee_user_id && invite.invitee_user_id !== ctx.userId) {
      throw new ForbiddenError("This invite belongs to a different account.");
    }

    const joinedAt = new Date().toISOString();
    const snapshot = await loadProfileSnapshot(ctx.admin, ctx.userId);
    const { data: existingMember, error: existingMemberError } = await ctx.admin
      .from("group_room_members")
      .select("*")
      .eq("room_id", invite.room_id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (existingMemberError) throw existingMemberError;

    let member = existingMember;
    if (!existingMember || existingMember.state !== "active") {
      const { data: upsertedMember, error: memberError } = await ctx.admin
        .from("group_room_members")
        .upsert({
          room_id: invite.room_id,
          user_id: ctx.userId,
          role: existingMember?.role ?? "member",
          state: "active",
          joined_at: joinedAt,
          left_at: null,
          can_see_history_before_join: existingMember?.can_see_history_before_join === true,
          display_snapshot: snapshot,
        }, { onConflict: "room_id,user_id" })
        .select("*")
        .single();
      if (memberError) throw memberError;
      member = upsertedMember;
    }

    const { error: updateError } = await ctx.admin
      .from("group_room_invites")
      .update({
        status: "accepted",
        invitee_user_id: ctx.userId,
        accepted_at: joinedAt,
      })
      .eq("id", invite.id);
    if (updateError) throw updateError;

    if (!existingMember || existingMember.state !== "active") {
      const displayName = typeof snapshot.display_name === "string" ? snapshot.display_name : "A member";
      await insertSystemMessage(ctx.admin, invite.room_id, `${displayName} joined the room.`, {
        event: "invite_accepted",
        actor_user_id: ctx.userId,
        invite_id: invite.id,
        joined_at: joinedAt,
        history_policy: "join_forward",
      });
      await notifyRoomMembers(ctx.admin, invite.room_id, ctx.userId, {
        type: "group_member_joined",
        title: "New group room member",
        summary: `${displayName} joined the room.`,
        content: { member_user_id: ctx.userId, invite_id: invite.id, room_url: roomUrl(appOrigin(req), invite.room_id) },
        includeActor: false,
      });
    }

    return jsonResponse({ room_id: invite.room_id, member }, corsHeaders);
  })(req);
});

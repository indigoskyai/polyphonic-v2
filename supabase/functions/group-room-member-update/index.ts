import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  insertSystemMessage,
  jsonResponse,
  loadActiveMember,
  notifyRoomMembers,
  optionalString,
  readJson,
  requireAuthedContext,
  requireRoomManager,
  requireString,
} from "../_shared/group-rooms.ts";

async function transferOwnershipIfNeeded(admin: any, roomId: string, leavingUserId: string): Promise<void> {
  const { data: room } = await admin
    .from("group_rooms")
    .select("owner_user_id")
    .eq("id", roomId)
    .maybeSingle();
  if (room?.owner_user_id !== leavingUserId) return;

  const { data: nextMember } = await admin
    .from("group_room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("state", "active")
    .neq("user_id", leavingUserId)
    .order("role", { ascending: true })
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextMember?.user_id) {
    await admin.from("group_rooms").update({ state: "archived" }).eq("id", roomId);
    return;
  }

  await admin.from("group_rooms").update({ owner_user_id: nextMember.user_id }).eq("id", roomId);
  await admin
    .from("group_room_members")
    .update({ role: "owner" })
    .eq("room_id", roomId)
    .eq("user_id", nextMember.user_id);
}

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
    const action = requireString(body.action, "action");
    const actorMember = await loadActiveMember(ctx.admin, roomId, ctx.userId);

    if (action === "mark_read") {
      const messageId = optionalString(body.message_id);
      const { data: member, error } = await ctx.admin
        .from("group_room_members")
        .update({ last_read_message_id: messageId })
        .eq("room_id", roomId)
        .eq("user_id", ctx.userId)
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse({ member }, corsHeaders);
    }

    if (action === "mute" || action === "unmute") {
      const { data: member, error } = await ctx.admin
        .from("group_room_members")
        .update({ muted: action === "mute" })
        .eq("room_id", roomId)
        .eq("user_id", ctx.userId)
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse({ member }, corsHeaders);
    }

    if (action === "leave") {
      await transferOwnershipIfNeeded(ctx.admin, roomId, ctx.userId);
      const now = new Date().toISOString();
      const { data: member, error } = await ctx.admin
        .from("group_room_members")
        .update({ state: "left", left_at: now, role: actorMember.role === "owner" ? "member" : actorMember.role })
        .eq("room_id", roomId)
        .eq("user_id", ctx.userId)
        .select("*")
        .single();
      if (error) throw error;
      await ctx.admin
        .from("group_room_agents")
        .update({ state: "removed", removed_at: now })
        .eq("room_id", roomId)
        .eq("owner_user_id", ctx.userId)
        .eq("state", "active");
      await insertSystemMessage(ctx.admin, roomId, "A member left the room.", {
        event: "member_left",
        actor_user_id: ctx.userId,
      });
      await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
        type: "group_member_left",
        title: "A member left",
        summary: "A room member left and their agents were removed.",
        content: { member_user_id: ctx.userId },
      });
      return jsonResponse({ member }, corsHeaders);
    }

    if (action === "remove_member") {
      await requireRoomManager(ctx.admin, roomId, ctx.userId);
      const targetUserId = requireString(body.target_user_id, "target_user_id");
      if (targetUserId === ctx.userId) throw new ValidationError("Use leave to remove yourself.");
      const { data: target } = await ctx.admin
        .from("group_room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (target?.role === "owner") throw new ForbiddenError("The room owner cannot be removed.");

      const now = new Date().toISOString();
      const { data: member, error } = await ctx.admin
        .from("group_room_members")
        .update({ state: "removed", left_at: now })
        .eq("room_id", roomId)
        .eq("user_id", targetUserId)
        .select("*")
        .single();
      if (error) throw error;
      await ctx.admin
        .from("group_room_agents")
        .update({ state: "removed", removed_at: now })
        .eq("room_id", roomId)
        .eq("owner_user_id", targetUserId)
        .eq("state", "active");
      await insertSystemMessage(ctx.admin, roomId, "A member was removed from the room.", {
        event: "member_removed",
        actor_user_id: ctx.userId,
        target_user_id: targetUserId,
      });
      await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
        type: "group_member_removed",
        title: "Member removed",
        summary: "A room member was removed and immediately lost access.",
        content: { target_user_id: targetUserId },
        critical: true,
      });
      return jsonResponse({ member }, corsHeaders);
    }

    if (action === "reveal_history") {
      await requireRoomManager(ctx.admin, roomId, ctx.userId);
      const targetUserId = requireString(body.target_user_id, "target_user_id");
      const { data: member, error } = await ctx.admin
        .from("group_room_members")
        .update({ can_see_history_before_join: true })
        .eq("room_id", roomId)
        .eq("user_id", targetUserId)
        .select("*")
        .single();
      if (error) throw error;
      await insertSystemMessage(ctx.admin, roomId, "Earlier history was revealed to a member.", {
        event: "history_visibility_changed",
        actor_user_id: ctx.userId,
        target_user_id: targetUserId,
      });
      return jsonResponse({ member }, corsHeaders);
    }

    throw new ValidationError("Unsupported member action.");
  })(req);
});

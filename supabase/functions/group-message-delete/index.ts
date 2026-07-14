import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  insertSystemMessage,
  jsonResponse,
  loadActiveMember,
  readJson,
  requireAuthedContext,
  requireRoomManager,
  requireString,
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
    const messageId = requireString(body.message_id, "message_id");
    await loadActiveMember(ctx.admin, roomId, ctx.userId);

    const { data: message, error: messageError } = await ctx.admin
      .from("group_messages")
      .select("*")
      .eq("room_id", roomId)
      .eq("id", messageId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message) throw new ValidationError("Message was not found.");

    if (message.sender_user_id !== ctx.userId) {
      await requireRoomManager(ctx.admin, roomId, ctx.userId);
    }
    if (message.role === "system" && message.sender_user_id !== ctx.userId) {
      throw new ForbiddenError("System messages cannot be deleted from the client.");
    }

    const now = new Date().toISOString();
    const { error: attachmentDeleteError } = await ctx.admin
      .from("chat_attachments")
      .delete()
      .eq("group_message_id", messageId);
    if (attachmentDeleteError) throw attachmentDeleteError;

    const { data: deleted, error } = await ctx.admin
      .from("group_messages")
      .update({
        state: "deleted",
        content: "",
        attachments: [],
        attachment_ids: [],
        deleted_at: now,
        metadata: {
          ...(message.metadata ?? {}),
          deleted_by_user_id: ctx.userId,
          deleted_at: now,
        },
      })
      .eq("id", messageId)
      .select("*")
      .single();
    if (error) throw error;

    await insertSystemMessage(ctx.admin, roomId, "A message was deleted.", {
      event: "message_deleted",
      actor_user_id: ctx.userId,
      message_id: messageId,
    });

    return jsonResponse({ message: deleted }, corsHeaders);
  })(req);
});

import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import { requireAuthedContext, jsonResponse, readJson } from "../_shared/group-rooms.ts";
import { MAX_ATTACHMENTS_PER_TURN, assertAttachmentScope, signedDescriptor } from "../_shared/attachments.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  return wrapHandler(corsHeaders, async () => {
    if (req.method !== "POST") throw new ValidationError("Method not allowed");
    const ctx = await requireAuthedContext(req);
    const body = await readJson(req);
    const ids = Array.isArray(body.attachment_ids)
      ? [...new Set(body.attachment_ids.filter((id): id is string => typeof id === "string"))]
      : [];
    if (!ids.length) throw new ValidationError("attachment_ids is required");
    if (ids.length > MAX_ATTACHMENTS_PER_TURN) throw new ValidationError(`A turn can include at most ${MAX_ATTACHMENTS_PER_TURN} attachments`);
    const threadId = typeof body.thread_id === "string" ? body.thread_id : null;
    const roomId = typeof body.room_id === "string" ? body.room_id : null;
    await assertAttachmentScope(ctx.admin, ctx.userId, threadId, roomId, false);

    const { data: rows, error } = await ctx.admin.from("chat_attachments").select("*").in("id", ids).eq("user_id", ctx.userId);
    if (error) throw error;
    if ((rows || []).length !== ids.length) throw new ForbiddenError("One or more attachments are unavailable");
    if ((rows || []).some((row) => row.status !== "ready")) throw new ValidationError("Every attachment must be ready before sending");
    if ((rows || []).some((row) =>
      (row.thread_id && row.thread_id !== threadId) ||
      (row.room_id && row.room_id !== roomId) ||
      (row.message_id && row.message_id !== body.message_id) ||
      (row.group_message_id && row.group_message_id !== body.group_message_id)
    )) throw new ForbiddenError("An attachment already belongs to another conversation");

    const messageId = typeof body.message_id === "string" ? body.message_id : null;
    const groupMessageId = typeof body.group_message_id === "string" ? body.group_message_id : null;
    if (messageId) {
      const { data: message } = await ctx.admin.from("messages").select("id, thread_id").eq("id", messageId).eq("user_id", ctx.userId).maybeSingle();
      if (!message || message.thread_id !== threadId) throw new ForbiddenError("Message not found");
    }
    if (groupMessageId) {
      const { data: message } = await ctx.admin.from("group_messages").select("id, room_id, sender_user_id").eq("id", groupMessageId).maybeSingle();
      if (!message || message.room_id !== roomId || message.sender_user_id !== ctx.userId) throw new ForbiddenError("Message not found");
    }

    const { data: updated, error: updateError } = await ctx.admin.from("chat_attachments").update({
      thread_id: threadId,
      room_id: roomId,
      message_id: messageId,
      group_message_id: groupMessageId,
    }).in("id", ids).eq("user_id", ctx.userId).select("*");
    if (updateError) throw updateError;
    const attachments = [];
    for (const row of updated || []) attachments.push(await signedDescriptor(ctx.admin, row));
    return jsonResponse({ attachments }, corsHeaders);
  })(req);
});

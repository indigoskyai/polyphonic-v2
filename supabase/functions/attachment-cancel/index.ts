import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import { requireAuthedContext, jsonResponse, readJson } from "../_shared/group-rooms.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  return wrapHandler(corsHeaders, async () => {
    if (req.method !== "POST") throw new ValidationError("Method not allowed");
    const ctx = await requireAuthedContext(req);
    const body = await readJson(req);
    const id = typeof body.attachment_id === "string" ? body.attachment_id : "";
    const { data: row, error } = await ctx.admin.from("chat_attachments").select("id, user_id, message_id, group_message_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row || row.user_id !== ctx.userId) throw new ForbiddenError("Attachment not found");
    if (row.message_id || row.group_message_id) throw new ValidationError("A sent attachment cannot be cancelled");
    const { error: deleteError } = await ctx.admin.from("chat_attachments").delete().eq("id", id).eq("user_id", ctx.userId);
    if (deleteError) throw deleteError;
    return jsonResponse({ cancelled: true }, corsHeaders);
  });
});

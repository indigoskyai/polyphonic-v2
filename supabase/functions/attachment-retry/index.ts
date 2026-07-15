import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import { requireAuthedContext, jsonResponse, readJson } from "../_shared/group-rooms.ts";
import { descriptorFromRow } from "../_shared/attachments.ts";
import { finalizeAttachmentRecord, recordAttachmentFailure } from "../_shared/attachment-finalization.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  return wrapHandler(corsHeaders, async () => {
    if (req.method !== "POST") throw new ValidationError("Method not allowed");
    const ctx = await requireAuthedContext(req);
    const body = await readJson(req);
    const id = typeof body.attachment_id === "string" ? body.attachment_id : "";
    const { data: row, error } = await ctx.admin.from("chat_attachments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row || row.user_id !== ctx.userId) throw new ForbiddenError("Attachment not found");
    if (row.status !== "failed") throw new ValidationError("Only failed file preparation can be retried");
    try {
      const ready = await finalizeAttachmentRecord(ctx.admin, row, body.extraction);
      return jsonResponse({ attachment: descriptorFromRow(ready), ready: true }, corsHeaders);
    } catch (retryError) {
      const failed = await recordAttachmentFailure(ctx.admin, id, retryError);
      if (!failed) throw retryError;
      return jsonResponse({ attachment: descriptorFromRow(failed), ready: false }, corsHeaders);
    }
  })(req);
});

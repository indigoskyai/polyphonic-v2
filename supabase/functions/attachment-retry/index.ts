import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import { requireAuthedContext, jsonResponse, readJson } from "../_shared/group-rooms.ts";
import { descriptorFromRow } from "../_shared/attachments.ts";

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
    if (row.status !== "failed") throw new ValidationError("Only failed processing jobs can be retried");
    const { data: updated, error: updateError } = await ctx.admin.from("chat_attachments").update({
      status: "quarantined",
      processing_error: null,
    }).eq("id", id).select("*").single();
    if (updateError) throw updateError;
    const { error: jobError } = await ctx.admin.from("attachment_processing_jobs").upsert({
      attachment_id: id,
      status: "queued",
      attempts: 0,
      available_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
    }, { onConflict: "attachment_id" });
    if (jobError) throw jobError;
    return jsonResponse({ attachment: descriptorFromRow(updated), queued: true }, corsHeaders, 202);
  });
});

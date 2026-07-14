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
    if (!id) throw new ValidationError("attachment_id is required");

    const { data: attachment, error } = await ctx.admin.from("chat_attachments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!attachment || attachment.user_id !== ctx.userId) throw new ForbiddenError("Attachment not found");
    if (["ready", "quarantined", "scanning", "extracting"].includes(attachment.status)) {
      return jsonResponse({ attachment: descriptorFromRow(attachment) }, corsHeaders);
    }
    if (attachment.status !== "uploading") throw new ValidationError("This upload cannot be finalized");

    const { data: objects, error: listError } = await ctx.admin.storage
      .from(attachment.bucket)
      .list(attachment.storage_path.slice(0, attachment.storage_path.lastIndexOf("/")), {
        search: attachment.storage_path.slice(attachment.storage_path.lastIndexOf("/") + 1),
        limit: 2,
      });
    if (listError) throw listError;
    const object = objects?.find((item) => attachment.storage_path.endsWith(`/${item.name}`));
    if (!object) throw new ValidationError("The uploaded object is missing");
    const objectSize = Number((object.metadata as Record<string, unknown> | null)?.size ?? 0);
    if (objectSize > 0 && objectSize !== Number(attachment.size_bytes)) {
      const { data: rejected } = await ctx.admin.from("chat_attachments").update({
        status: "rejected",
        processing_error: "Uploaded size does not match the initialized upload",
      }).eq("id", id).select("*").single();
      return jsonResponse({ attachment: descriptorFromRow(rejected) }, corsHeaders, 422);
    }

    const { data: queued, error: queueError } = await ctx.admin.from("chat_attachments").update({
      status: "quarantined",
      processing_error: null,
    }).eq("id", id).select("*").single();
    if (queueError) throw queueError;

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

    return jsonResponse({ attachment: descriptorFromRow(queued), queued: true }, corsHeaders, 202);
  })(req);
});

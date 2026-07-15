import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ValidationError, wrapHandler } from "../_shared/errors.ts";
import { requireAuthedContext, jsonResponse, readJson } from "../_shared/group-rooms.ts";
import {
  ATTACHMENT_BUCKET,
  DEFAULT_USER_STORAGE_QUOTA_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TURN,
  assertAttachmentScope,
  capabilitiesFor,
  classifyAttachment,
  cleanFileName,
  descriptorFromRow,
  safeStorageName,
} from "../_shared/attachments.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  return wrapHandler(corsHeaders, async () => {
    if (req.method !== "POST") throw new ValidationError("Method not allowed");
    const ctx = await requireAuthedContext(req);
    const body = await readJson(req);
    const name = cleanFileName(body.name);
    const mime = typeof body.mime_type === "string" ? body.mime_type.trim().toLowerCase().slice(0, 160) : "application/octet-stream";
    const size = Number(body.size_bytes);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError("File must be between 1 byte and 100 MB");
    }
    const threadId = typeof body.thread_id === "string" && UUID_RE.test(body.thread_id) ? body.thread_id : null;
    const roomId = typeof body.room_id === "string" && UUID_RE.test(body.room_id) ? body.room_id : null;
    const uploadBatchId = typeof body.upload_batch_id === "string" && UUID_RE.test(body.upload_batch_id)
      ? body.upload_batch_id
      : crypto.randomUUID();
    await assertAttachmentScope(ctx.admin, ctx.userId, threadId, roomId, true);
    const kind = classifyAttachment(name, mime);
    if ((kind === "audio" || kind === "video") && size > 20 * 1024 * 1024) {
      throw new ValidationError("Audio and video files must be 20 MB or smaller so agents can analyze them reliably");
    }

    const { count: batchCount, error: batchError } = await ctx.admin
      .from("chat_attachments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("upload_batch_id", uploadBatchId)
      .not("status", "in", "(cancelled,rejected)");
    if (batchError) throw batchError;
    if ((batchCount || 0) >= MAX_ATTACHMENTS_PER_TURN) throw new ValidationError("A turn can include at most 10 files");

    const { data: usageData, error: usageError } = await ctx.admin.rpc("chat_attachment_usage_bytes", { p_user_id: ctx.userId });
    if (usageError) throw usageError;
    const { data: configuredQuota, error: quotaError } = await ctx.admin
      .from("chat_attachment_quotas")
      .select("quota_bytes")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (quotaError) throw quotaError;
    const quota = Number(configuredQuota?.quota_bytes || DEFAULT_USER_STORAGE_QUOTA_BYTES);
    if (Number(usageData || 0) + size > quota) throw new ValidationError("Your attachment storage quota would be exceeded");

    const id = crypto.randomUUID();
    const scope = threadId || roomId || uploadBatchId;
    const path = `${ctx.userId}/${scope}/${id}-${safeStorageName(name)}`;
    const { data: row, error } = await ctx.admin.from("chat_attachments").insert({
      id,
      user_id: ctx.userId,
      thread_id: threadId,
      room_id: roomId,
      upload_batch_id: uploadBatchId,
      bucket: ATTACHMENT_BUCKET,
      storage_path: path,
      original_name: name,
      declared_mime_type: mime,
      kind,
      size_bytes: size,
      status: "uploading",
      capabilities: capabilitiesFor(kind),
    }).select("*").single();
    if (error) throw error;

    const { data: upload, error: uploadError } = await ctx.admin.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (uploadError || !upload?.token) {
      await ctx.admin.from("chat_attachments").delete().eq("id", id);
      throw uploadError || new Error("Could not initialize upload");
    }

    return jsonResponse({
      attachment: descriptorFromRow(row),
      upload: { bucket: ATTACHMENT_BUCKET, path, token: upload.token },
    }, corsHeaders, 201);
  })(req);
});

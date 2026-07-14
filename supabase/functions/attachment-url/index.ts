import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import { requireAuthedContext, jsonResponse, readJson } from "../_shared/group-rooms.ts";
import { signedDescriptor } from "../_shared/attachments.ts";

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
    const { data: row, error } = await ctx.userClient.from("chat_attachments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) throw new ForbiddenError("Attachment not found");
    return jsonResponse({ attachment: await signedDescriptor(ctx.admin, row) }, corsHeaders);
  });
});

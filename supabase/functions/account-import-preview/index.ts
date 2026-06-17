import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  buildImportPreview,
  decryptArchiveBody,
  handleError,
  jsonResponse,
  readJsonBody,
  requireAuth,
} from "../_shared/account-portability/server.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const { payload, archiveHash } = await decryptArchiveBody(body);
    const { preview } = await buildImportPreview(admin, payload, user.id, archiveHash);
    return jsonResponse(req, { ok: true, preview });
  } catch (error) {
    return handleError(req, error);
  }
});

import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  buildImportPreviewForArchive,
  handleError,
  jsonResponse,
  readJsonBody,
  requireAuth,
  resolveArchiveBody,
} from "../_shared/account-portability/server.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const resolved = await resolveArchiveBody(body);
    const { preview } = await buildImportPreviewForArchive(admin, resolved, user.id);
    return jsonResponse(req, { ok: true, preview });
  } catch (error) {
    return handleError(req, error);
  }
});

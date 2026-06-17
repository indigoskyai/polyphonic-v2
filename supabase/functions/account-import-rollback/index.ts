import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  handleError,
  jsonResponse,
  readJsonBody,
  requireAuth,
  requiredString,
  rollbackImportJob,
} from "../_shared/account-portability/server.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const jobId = requiredString(body, "job_id");

    const { data: job, error } = await admin
      .from("account_portability_jobs")
      .select("id,direction,status,user_id")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job || job.direction !== "import") return jsonResponse(req, { error: "Import job not found" }, 404);
    if (job.status === "processing") return jsonResponse(req, { error: "Import is still processing" }, 409);

    const deleted = await rollbackImportJob(admin, user.id, jobId);
    const { error: updateError } = await admin
      .from("account_portability_jobs")
      .update({
        status: "rolled_back",
        errors: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("user_id", user.id);
    if (updateError) throw new Error(updateError.message);

    return jsonResponse(req, { ok: true, job_id: jobId, deleted });
  } catch (error) {
    return handleError(req, error);
  }
});

import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  handleError,
  jsonResponse,
  readJsonBody,
  requireAuth,
  requiredString,
  startChunkedAccountExportJob,
} from "../_shared/account-portability/server.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  let jobId: string | null = null;
  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const passphrase = requiredString(body, "passphrase");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: job, error: jobError } = await admin
      .from("account_portability_jobs")
      .insert({
        user_id: user.id,
        direction: "export",
        status: "processing",
        archive_version: 1,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    const insertedJobId = typeof job?.id === "string" ? job.id : "";
    if (jobError || !insertedJobId) throw new Error(jobError?.message || "Could not create export job");
    jobId = insertedJobId;

    startChunkedAccountExportJob(admin, user.id, passphrase, insertedJobId, expiresAt);

    return jsonResponse(req, {
      ok: true,
      job_id: insertedJobId,
      status: "processing",
      expires_at: expiresAt,
      archive_version: 1,
    });
  } catch (error) {
    try {
      if (jobId) {
        const { admin } = await requireAuth(req);
        await admin
          .from("account_portability_jobs")
          .update({
            status: "failed",
            errors: [error instanceof Error ? error.message : "Unknown error"],
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    } catch {
      // Preserve the original response.
    }
    return handleError(req, error);
  }
});

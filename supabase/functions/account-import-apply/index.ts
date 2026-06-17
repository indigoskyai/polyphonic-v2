import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import type { JsonRecord } from "../_shared/account-portability/archive.ts";
import {
  buildImportPreviewForArchive,
  handleError,
  jsonResponse,
  readJsonBody,
  requireAuth,
  resolveArchiveBody,
  rollbackFailedImportAttempts,
  startAccountImportJob,
} from "../_shared/account-portability/server.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  let jobId: string | null = null;
  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const resolved = await resolveArchiveBody(body);
    const { preview, maps } = await buildImportPreviewForArchive(admin, resolved, user.id);

    if (preview.duplicate_job_id) {
      return jsonResponse(req, {
        ok: true,
        already_imported: true,
        job_id: preview.duplicate_job_id,
        preview,
      });
    }

    const rolledBackFailedJobs = await rollbackFailedImportAttempts(admin, user.id, resolved.archiveHash);
    if (rolledBackFailedJobs.length > 0) {
      preview.warnings = [
        ...preview.warnings,
        `Rolled back ${rolledBackFailedJobs.length} previous failed import attempt${rolledBackFailedJobs.length === 1 ? "" : "s"} for this archive before retrying.`,
      ];
    }

    const { data: job, error: jobError } = await admin
      .from("account_portability_jobs")
      .insert({
        user_id: user.id,
        direction: "import",
        status: "processing",
        archive_version: 1,
        archive_hash: resolved.archiveHash,
        counts: preview.counts,
        warnings: preview.warnings,
        preview: preview as unknown as JsonRecord,
        manifest: resolved.kind === "full" ? resolved.payload.manifest : resolved.archive.manifest,
      })
      .select("id")
      .single();
    const insertedJobId = typeof job?.id === "string" ? job.id : "";
    if (jobError || !insertedJobId) {
      if (jobError?.code === "23505") {
        return jsonResponse(req, { ok: true, already_imported: true, preview });
      }
      throw new Error(jobError?.message || "Could not create import job");
    }
    jobId = insertedJobId;

    startAccountImportJob(admin, resolved, user.id, insertedJobId, maps);

    return jsonResponse(req, {
      ok: true,
      job_id: insertedJobId,
      status: "processing",
      preview,
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

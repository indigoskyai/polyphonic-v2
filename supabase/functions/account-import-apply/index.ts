import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  applyImportPayload,
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

  let jobId: string | null = null;
  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const { payload, archiveHash } = await decryptArchiveBody(body);
    const { preview, maps } = await buildImportPreview(admin, payload, user.id, archiveHash);

    if (preview.duplicate_job_id) {
      return jsonResponse(req, {
        ok: true,
        already_imported: true,
        job_id: preview.duplicate_job_id,
        preview,
      });
    }

    const { data: job, error: jobError } = await admin
      .from("account_portability_jobs")
      .insert({
        user_id: user.id,
        direction: "import",
        status: "processing",
        archive_version: payload.version,
        archive_hash: archiveHash,
        counts: preview.counts,
        warnings: preview.warnings,
        preview,
        manifest: payload.manifest,
      })
      .select("id")
      .single();
    if (jobError || !job?.id) {
      if (jobError?.code === "23505") {
        return jsonResponse(req, { ok: true, already_imported: true, preview });
      }
      throw new Error(jobError?.message || "Could not create import job");
    }
    jobId = job.id;

    const result = await applyImportPayload(admin, payload, user.id, job.id, maps);
    const { error: updateError } = await admin
      .from("account_portability_jobs")
      .update({
        status: "completed",
        counts: result.counts,
        warnings: result.warnings,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", user.id);
    if (updateError) throw new Error(updateError.message);

    return jsonResponse(req, {
      ok: true,
      job_id: job.id,
      counts: result.counts,
      warnings: result.warnings,
      row_maps: result.row_maps,
      assets_uploaded: result.assets_uploaded,
      assets_missing: result.assets_missing,
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

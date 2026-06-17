import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ACCOUNT_PORTABILITY_BUCKET } from "../_shared/account-portability/archive.ts";
import {
  createEncryptedAccountExport,
  handleError,
  jsonResponse,
  readJsonBody,
  requireAuth,
  requiredString,
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
    if (jobError || !job?.id) throw new Error(jobError?.message || "Could not create export job");
    jobId = job.id;

    const exportArchive = await createEncryptedAccountExport(admin, user.id, passphrase);
    const storagePath = `${user.id}/${job.id}/${exportArchive.fileName}`;
    const archiveBlob = new Blob([exportArchive.archiveText], { type: "application/json" });

    const { error: uploadError } = await admin.storage
      .from(ACCOUNT_PORTABILITY_BUCKET)
      .upload(storagePath, archiveBlob, { upsert: true, contentType: "application/json" });
    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signedError } = await admin.storage
      .from(ACCOUNT_PORTABILITY_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message || "Could not create export link");

    const { error: updateError } = await admin
      .from("account_portability_jobs")
      .update({
        status: "completed",
        archive_hash: exportArchive.archiveHash,
        file_name: exportArchive.fileName,
        storage_bucket: ACCOUNT_PORTABILITY_BUCKET,
        storage_path: storagePath,
        counts: exportArchive.payload.manifest.tables,
        warnings: exportArchive.payload.warnings,
        manifest: exportArchive.payload.manifest,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", user.id);
    if (updateError) throw new Error(updateError.message);

    return jsonResponse(req, {
      ok: true,
      job_id: job.id,
      file_name: exportArchive.fileName,
      signed_url: signed.signedUrl,
      expires_at: expiresAt,
      counts: exportArchive.payload.manifest.tables,
      warnings: exportArchive.payload.warnings,
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

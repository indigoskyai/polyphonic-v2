import { handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
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

  try {
    const { admin, user } = await requireAuth(req);
    const body = await readJsonBody(req);
    const jobId = requiredString(body, "job_id");
    const { data: job, error } = await admin
      .from("account_portability_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return jsonResponse(req, { error: "Job not found" }, 404);

    const { count } = await admin
      .from("account_portability_row_map")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("user_id", user.id);

    return jsonResponse(req, { ok: true, job, row_maps: count || 0 });
  } catch (error) {
    return handleError(req, error);
  }
});

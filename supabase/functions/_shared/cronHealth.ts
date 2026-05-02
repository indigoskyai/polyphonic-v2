// Cron health tracking — wraps a cron-target handler and records start/success/failure.
// Backed by public.cron_health via the record_cron_run RPC.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let _client: SupabaseClient | null = null;
function svc(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return _client;
}

export async function recordCronSuccess(jobName: string, durationMs: number) {
  try {
    await svc().rpc("record_cron_run", {
      p_job_name: jobName,
      p_success: true,
      p_duration_ms: Math.max(0, Math.floor(durationMs)),
      p_error: null,
    });
  } catch (e) {
    console.warn(`[cronHealth] failed to record success for ${jobName}:`, e);
  }
}

export async function recordCronFailure(jobName: string, durationMs: number, error: unknown) {
  try {
    const msg = error instanceof Error ? error.message : String(error);
    await svc().rpc("record_cron_run", {
      p_job_name: jobName,
      p_success: false,
      p_duration_ms: Math.max(0, Math.floor(durationMs)),
      p_error: msg.slice(0, 500),
    });
  } catch (e) {
    console.warn(`[cronHealth] failed to record failure for ${jobName}:`, e);
  }
}

/**
 * Wraps a job body, automatically recording cron_health start/success/failure.
 * Re-throws on failure so callers can still produce error responses.
 */
export async function trackCronJob<T>(jobName: string, body: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await body();
    await recordCronSuccess(jobName, Date.now() - start);
    return result;
  } catch (err) {
    await recordCronFailure(jobName, Date.now() - start, err);
    throw err;
  }
}

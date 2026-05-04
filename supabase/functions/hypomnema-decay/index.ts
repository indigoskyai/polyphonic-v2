// hypomnema-decay — 6-hour cron pass.
//
// Invoked by pg_cron at `45 */6 * * *` via invoke_edge_function('hypomnema-decay', '{}'::jsonb).
// Computes salience for every active hypomnema_entry, applies anti-decay floors
// (foundational / active_attention / revision_count), and deactivates entries
// that fall below the threshold.
//
// Service-role-only entrypoint. Cron health is recorded under jobName='hypomnema-decay'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { decayAllActiveEntries } from "../_shared/hypomnema/index.ts";
import { recordCronFailure, recordCronSuccess } from "../_shared/cronHealth.ts";

const JOB_NAME = "hypomnema-decay";

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  const start = Date.now();

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${serviceRole}`) {
      return json({ error: "service_role only" }, 401, corsHeaders);
    }

    const supabase = createClient(url, serviceRole);
    const result = await decayAllActiveEntries(supabase);
    const ms = Date.now() - start;

    if (result.errors > 0) {
      await recordCronFailure(JOB_NAME, ms, new Error(`partial: ${JSON.stringify(result)}`));
    } else {
      await recordCronSuccess(JOB_NAME, ms);
    }

    return json({ ok: true, ms, ...result }, 200, corsHeaders);
  } catch (err) {
    const ms = Date.now() - start;
    await recordCronFailure(JOB_NAME, ms, err);
    console.error("[hypomnema-decay] error:", err);
    return json({ ok: false, error: (err as Error).message }, 500, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

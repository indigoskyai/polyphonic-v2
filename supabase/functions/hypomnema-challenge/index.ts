// hypomnema-challenge — daily belief-challenge pass at 04:00 UTC.
//
// Critic-reviews active hypomnema entries that haven't been challenged in 14+
// days. Sonnet 4.6 critique → revised confidence + verdict (hold / revise_down
// / revise_up / retire). Retires when confidence drops below 0.30 or critic
// returns retire verdict.
//
// Service-role-only entrypoint. Cron health under jobName='hypomnema-challenge'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { challengeAllStaleEntries } from "../_shared/hypomnema/index.ts";
import { recordCronFailure, recordCronSuccess } from "../_shared/cronHealth.ts";

const JOB_NAME = "hypomnema-challenge";

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
    const result = await challengeAllStaleEntries(supabase);
    const ms = Date.now() - start;

    if (result.errors > 0) {
      await recordCronFailure(JOB_NAME, ms, new Error(`partial: ${JSON.stringify({ scanned: result.scanned, challenged: result.challenged, errors: result.errors })}`));
    } else {
      await recordCronSuccess(JOB_NAME, ms);
    }

    return json({ ok: true, ms, ...result }, 200, corsHeaders);
  } catch (err) {
    const ms = Date.now() - start;
    await recordCronFailure(JOB_NAME, ms, err);
    console.error("[hypomnema-challenge] error:", err);
    return json({ ok: false, error: (err as Error).message }, 500, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

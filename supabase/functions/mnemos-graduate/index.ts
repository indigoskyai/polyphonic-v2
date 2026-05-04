// mnemos-graduate — daily graduation pass at 04:15 UTC.
//
// Promotes hypomnema entries with sustained attention to Mnemos engrams.
// Score >= 0.85 graduates deterministically; [0.65, 0.85] consults a Haiku
// borderline judge; below 0.65 stays in hypomnema.
//
// Service-role-only entrypoint. Cron health under jobName='mnemos-graduate'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { graduateAllEligible } from "../_shared/hypomnema/index.ts";
import { recordCronFailure, recordCronSuccess } from "../_shared/cronHealth.ts";

const JOB_NAME = "mnemos-graduate";

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
    const result = await graduateAllEligible(supabase);
    const ms = Date.now() - start;

    if (result.errors > 0) {
      await recordCronFailure(JOB_NAME, ms, new Error(`partial: ${JSON.stringify({ scanned: result.scanned, graduated: result.graduated, errors: result.errors })}`));
    } else {
      await recordCronSuccess(JOB_NAME, ms);
    }

    return json({ ok: true, ms, ...result }, 200, corsHeaders);
  } catch (err) {
    const ms = Date.now() - start;
    await recordCronFailure(JOB_NAME, ms, err);
    console.error("[mnemos-graduate] error:", err);
    return json({ ok: false, error: (err as Error).message }, 500, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

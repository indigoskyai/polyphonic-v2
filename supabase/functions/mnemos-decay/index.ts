import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/serviceRoleGuard.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { decayMultiplierFromRate, getMemorySettings } from "../_shared/mnemos/settings.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const unauthorized = requireServiceRole(req, corsHeaders);
  if (unauthorized) return unauthorized;

  const __jobStart = Date.now();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;

    const runForUser = async (uid: string) => {
      const settings = await getMemorySettings(supabase, uid);
      if (!settings.mnemos_enabled) {
        return { skipped: true, reason: "mnemos_disabled" };
      }
      const engine = new MnemosEngine(supabase, uid);
      return engine.decay({
        min_hours_since_access: 1,
        archive_below_threshold: true,
        rate_multiplier: decayMultiplierFromRate(settings.decay_rate),
      });
    };

    if (userId) {
      const result = await runForUser(userId);
      await recordCronSuccess("mnemos-decay", Date.now() - __jobStart);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode
    const { data: users } = await supabase
      .from("engrams")
      .select("user_id")
      .in("state", ["active", "consolidating", "dormant"])
      .limit(100);

    const uniqueUsers = [...new Set((users ?? []).map((u: { user_id: string }) => u.user_id))];
    const results: Record<string, unknown> = {};

    for (const uid of uniqueUsers) {
      try {
        results[uid] = await runForUser(uid);
      } catch (e) {
        results[uid] = { error: (e as Error).message };
      }
    }

    await recordCronSuccess("mnemos-decay", Date.now() - __jobStart);
    return new Response(JSON.stringify({ success: true, users_processed: uniqueUsers.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await recordCronFailure("mnemos-decay", Date.now() - __jobStart, err);
    console.error("mnemos-decay error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message, code: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

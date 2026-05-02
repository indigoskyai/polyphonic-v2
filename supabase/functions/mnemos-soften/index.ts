import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/serviceRoleGuard.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { runSofteningCycle } from "../_shared/mnemos/softening.ts";

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

    // Get OpenRouter API key for LLM compression
    let apiKey: string | null = null;
    if (userId) {
      const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      if (userKeyData) apiKey = userKeyData;
    }
    // No platform fallback — user must have their own key

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured. User must add their OpenRouter key in Settings." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId) {
      const results = await runSofteningCycle(supabase, userId, apiKey);
      await recordCronSuccess("mnemos-soften", Date.now() - __jobStart);
      return new Response(JSON.stringify({ success: true, softened: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode
    const { data: users } = await supabase
      .from("engrams")
      .select("user_id")
      .eq("state", "active")
      .lt("strength", 0.3)
      .limit(100);

    const uniqueUsers = [...new Set((users ?? []).map((u: { user_id: string }) => u.user_id))];
    const allResults: Record<string, unknown> = {};

    for (const uid of uniqueUsers) {
      try {
        let userApiKey = apiKey;
        const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: uid });
        if (keyData) userApiKey = keyData;

        const results = await runSofteningCycle(supabase, uid, userApiKey!);
        allResults[uid] = { softened: results.length };
      } catch (e) {
        allResults[uid] = { error: (e as Error).message };
      }
    }

    await recordCronSuccess("mnemos-soften", Date.now() - __jobStart);
    return new Response(JSON.stringify({ success: true, users_processed: uniqueUsers.length, results: allResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await recordCronFailure("mnemos-soften", Date.now() - __jobStart, err);
    console.error("mnemos-soften error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message, code: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

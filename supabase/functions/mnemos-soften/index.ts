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
    const requestedAgentId = typeof body.agent_id === "string" ? body.agent_id : null;

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
      const agentId = requestedAgentId || "luca";
      const results = await runSofteningCycle(supabase, userId, apiKey, agentId);
      await recordCronSuccess("mnemos-soften", Date.now() - __jobStart);
      return new Response(JSON.stringify({ success: true, agent_id: agentId, softened: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode
    const { data: users } = await supabase
      .from("engrams")
      .select("user_id, agent_id")
      .eq("state", "active")
      .lt("strength", 0.3)
      .limit(100);

    const uniqueScopes = [...new Map((users ?? []).map((u: { user_id: string; agent_id?: string | null }) =>
      [`${u.user_id}:${u.agent_id || "luca"}`, { userId: u.user_id, agentId: u.agent_id || "luca" }],
    )).values()];
    const allResults: Record<string, unknown> = {};

    for (const scope of uniqueScopes) {
      try {
        let userApiKey = apiKey;
        const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: scope.userId });
        if (keyData) userApiKey = keyData;

        const results = await runSofteningCycle(supabase, scope.userId, userApiKey!, scope.agentId);
        allResults[`${scope.userId}:${scope.agentId}`] = { softened: results.length };
      } catch (e) {
        allResults[`${scope.userId}:${scope.agentId}`] = { error: (e as Error).message };
      }
    }

    await recordCronSuccess("mnemos-soften", Date.now() - __jobStart);
    return new Response(JSON.stringify({ success: true, scopes_processed: uniqueScopes.length, results: allResults }), {
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

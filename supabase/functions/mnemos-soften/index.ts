import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/serviceRoleGuard.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { runSofteningCycle } from "../_shared/mnemos/softening.ts";
import { getMemorySettings } from "../_shared/mnemos/settings.ts";
import { resolveRoleModel } from "../_shared/model-backend.ts";

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

    if (userId) {
      const agentId = requestedAgentId || "luca";
      const settings = await getMemorySettings(supabase, userId);
      if (!settings.mnemos_enabled) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "mnemos_disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!settings.full_cognition_enabled) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "full_cognition_disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!settings.softening_enabled) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "softening_disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      const apiKey = (userKeyData as string | null) ?? null;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "No API key configured. User must add their OpenRouter key in Settings." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = await resolveRoleModel(supabase, userId, agentId, "mechanical");
      const results = await runSofteningCycle(supabase, userId, apiKey, agentId, {
        dryRun: settings.softening_dry_run,
        model,
      });
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
        const settings = await getMemorySettings(supabase, scope.userId);
        if (!settings.mnemos_enabled) {
          allResults[`${scope.userId}:${scope.agentId}`] = { skipped: true, reason: "mnemos_disabled" };
          continue;
        }
        if (!settings.full_cognition_enabled) {
          allResults[`${scope.userId}:${scope.agentId}`] = { skipped: true, reason: "full_cognition_disabled" };
          continue;
        }
        if (!settings.softening_enabled) {
          allResults[`${scope.userId}:${scope.agentId}`] = { skipped: true, reason: "softening_disabled" };
          continue;
        }
        const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: scope.userId });
        const userApiKey = (keyData as string | null) ?? null;
        if (!userApiKey) {
          allResults[`${scope.userId}:${scope.agentId}`] = { skipped: true, reason: "no_api_key" };
          continue;
        }

        const model = await resolveRoleModel(supabase, scope.userId, scope.agentId, "mechanical");
        const results = await runSofteningCycle(supabase, scope.userId, userApiKey, scope.agentId, {
          dryRun: settings.softening_dry_run,
          model,
        });
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

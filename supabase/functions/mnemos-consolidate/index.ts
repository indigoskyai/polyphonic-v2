import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { dispatchProactiveEngagement } from "../_shared/proactive-engagement.ts";
import { getMemorySettings, isConsolidationDue } from "../_shared/mnemos/settings.ts";
import {
  consolidationIsNoteworthy,
  formatConsolidationSummary,
  type ConsolidationCounts,
} from "../_shared/mnemos/insight-surface.ts";
  formatConsolidationSummary,
  type ConsolidationCounts,
} from "../_shared/mnemos/insight-surface.ts";

async function maybeSurfaceConsolidation(
  supabase: any,
  supabaseUrl: string,
  serviceRole: string,
  userId: string,
  result: ConsolidationCounts | null | undefined,
): Promise<void> {
  if (!consolidationIsNoteworthy(result)) return;
  try {
    await dispatchProactiveEngagement(supabase, supabaseUrl, serviceRole, {
      userId,
      source: "mnemos_consolidate",
      severity: "notable",
      title: "I noticed something while you were away",
      summary: formatConsolidationSummary(result!),
      rationale: "Consolidation surfaced a pattern worth flagging — promotions, new connections, or belief shifts crossed the noteworthy threshold.",
      activityType: "mnemos_insight",
      content: {
        promotions: Number(result?.promotions ?? 0),
        new_connections: Number(result?.new_connections ?? 0),
        beliefs_updated: Number(result?.beliefs_updated ?? 0),
        strengthened: Number(result?.strengthened ?? 0),
      },
    });
  } catch (err) {
    console.warn("[mnemos-consolidate] proactive surface failed:", err);
  }
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;

    // Get OpenRouter API key for dreaming
    let apiKey: string | null = null;
    if (userId) {
      const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      if (userKeyData) apiKey = userKeyData;
    }
    // No platform fallback — user must have their own key

    if (userId) {
      const engine = new MnemosEngine(supabase, userId);
      const result = await engine.consolidate({
        lookback_hours: body.lookback_hours || 24,
        openrouter_api_key: apiKey || undefined,
      });
      await maybeSurfaceConsolidation(supabase, supabaseUrl, supabaseServiceKey, userId, result);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode: consolidate for all users with recent activity
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: users } = await supabase
      .from("engrams")
      .select("user_id")
      .gte("last_accessed_at", cutoff)
      .limit(100);

    const uniqueUsers = [...new Set((users ?? []).map((u: { user_id: string }) => u.user_id))];
    const results: Record<string, unknown> = {};

    for (const uid of uniqueUsers) {
      try {
        // Get user's API key for dreaming
        let userApiKey = apiKey;
        const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: uid });
        if (keyData) userApiKey = keyData;

        const engine = new MnemosEngine(supabase, uid);
        const userResult = await engine.consolidate({
          lookback_hours: 24,
          openrouter_api_key: userApiKey || undefined,
        });
        results[uid] = userResult;
        await maybeSurfaceConsolidation(supabase, supabaseUrl, supabaseServiceKey, uid, userResult);
      } catch (e) {
        results[uid] = { error: (e as Error).message };
      }
    }

    return new Response(JSON.stringify({ success: true, users_processed: uniqueUsers.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mnemos-consolidate error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { dispatchProactiveEngagement } from "../_shared/proactive-engagement.ts";
import { getMemorySettings, isConsolidationDue } from "../_shared/mnemos/settings.ts";
import {
  consolidationIsNoteworthy,
  formatConsolidationSummary,
  type ConsolidationCounts,
} from "../_shared/mnemos/insight-surface.ts";
import { logProcessRan } from "../_shared/activity-gate.ts";

async function maybeSurfaceConsolidation(
  supabase: any,
  supabaseUrl: string,
  serviceRole: string,
  userId: string,
  agentId: string,
  result: ConsolidationCounts | null | undefined,
): Promise<void> {
  if (!consolidationIsNoteworthy(result)) return;
  try {
    await dispatchProactiveEngagement(supabase, supabaseUrl, serviceRole, {
      userId,
      agentId,
      source: "mnemos_consolidate",
      severity: "notable",
      title: "I noticed something while you were away",
      summary: formatConsolidationSummary(result!),
      rationale: "Consolidation surfaced a pattern worth flagging — promotions, new connections, or belief shifts crossed the noteworthy threshold.",
      activityType: "mnemos_insight",
      content: {
        promotions: Number(result?.promotions ?? 0),
        memory_candidates_created: Number(result?.memory_candidates_created ?? 0),
        new_connections: Number(result?.new_connections ?? 0),
        beliefs_updated: Number(result?.beliefs_updated ?? 0),
        strengthened: Number(result?.strengthened ?? 0),
        insights: result?.insights ?? null,
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
  const __jobStart = Date.now();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;
    const requestedAgentId = typeof body.agent_id === "string" ? body.agent_id : null;
    const force = !!body.force; // bypass cadence check (manual trigger from UI)
    const authHeader = req.headers.get("Authorization") || "";
    const calledWithServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;
    let callerUserId: string | null = null;

    if (!calledWithServiceRole) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await userClient.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = userData.user.id;
      if (userId && userId !== callerUserId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const runForUser = async (uid: string, agentId = "luca") => {
      const settings = await getMemorySettings(supabase, uid);
      if (!settings.mnemos_enabled) {
        console.log("[mnemos-consolidate] skipped", { user_id: uid, reason: "mnemos_disabled", force });
        return { skipped: true, reason: "mnemos_disabled" };
      }
      if (!settings.consolidation_enabled) {
        console.log("[mnemos-consolidate] skipped", { user_id: uid, reason: "consolidation_disabled", force });
        return { skipped: true, reason: "consolidation_disabled" };
      }

      // Cadence gate (cron mode only — explicit calls with force bypass).
      // Consolidation is an agent-substrate process, so cadence must be scoped
      // by both user and agent. The older memory_settings timestamp is kept as
      // a coarse UI/legacy stamp, but it must not suppress other agents.
      if (!force) {
        const { data: lastRunLog } = await supabase
          .from("activity_events")
          .select("created_at")
          .eq("user_id", uid)
          .eq("agent_id", agentId)
          .eq("event_type", "process_ran")
          .eq("metadata->>process", "mnemos-consolidate")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!isConsolidationDue(settings.dream_frequency, lastRunLog?.created_at ?? null)) {
          console.log("[mnemos-consolidate] skipped", {
            user_id: uid,
            agent_id: agentId,
            reason: "not_due",
            dream_frequency: settings.dream_frequency,
            last_consolidated_at: lastRunLog?.created_at ?? null,
          });
          return { skipped: true, reason: "not_due", dream_frequency: settings.dream_frequency };
        }
      }

      const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: uid });
      const userApiKey = (keyData as string | null) ?? null;

      // BYOK gate: consolidation (engram promotion, belief formation, connections)
      // is a real agent process — never run it for a keyless user. They get
      // free-tier chat only; no memory substrate is built without their own key.
      if (!userApiKey) {
        console.log("[mnemos-consolidate] skipped", { user_id: uid, reason: "no_api_key", force });
        return { skipped: true, reason: "no_api_key" };
      }

      const engine = new MnemosEngine(supabase, uid, agentId);
      const userResult = await engine.consolidate({
        lookback_hours: body.lookback_hours || 24,
        openrouter_api_key: userApiKey || undefined,
      });

      // Stamp last-run for cadence tracking
      await supabase
        .from("memory_settings")
        .update({ last_consolidated_at: new Date().toISOString() })
        .eq("user_id", uid);

      await logProcessRan(supabase, uid, "mnemos-consolidate", {
        candidates_found: userResult.candidates_found ?? 0,
        promotions: userResult.promotions ?? 0,
        memory_candidates_created: userResult.memory_candidates_created ?? 0,
        new_connections: userResult.new_connections ?? 0,
        beliefs_updated: userResult.beliefs_updated ?? 0,
        memory_candidates_created: userResult.memory_candidates_created ?? 0,
        duration_ms: userResult.duration_ms ?? 0,
      }, agentId);

      console.log("[mnemos-consolidate] cycle result", {
        user_id: uid,
        agent_id: agentId,
        force,
        candidates_found: userResult.candidates_found ?? 0,
        pairs_analyzed: userResult.pairs_analyzed ?? 0,
        promotions: userResult.promotions ?? 0,
        memory_candidates_created: userResult.memory_candidates_created ?? 0,
        new_connections: userResult.new_connections ?? 0,
        connections_strengthened: userResult.connections_strengthened ?? 0,
        beliefs_updated: userResult.beliefs_updated ?? 0,
        strengthened: userResult.strengthened ?? 0,
        memory_candidates_created: userResult.memory_candidates_created ?? 0,
        duration_ms: userResult.duration_ms ?? 0,
      });


      await maybeSurfaceConsolidation(supabase, supabaseUrl, supabaseServiceKey, uid, agentId, userResult);
      return userResult;
    };

    if (callerUserId) {
      const result = await runForUser(callerUserId, requestedAgentId || "luca");
      await recordCronSuccess("mnemos-consolidate", Date.now() - __jobStart);
      return new Response(JSON.stringify({ success: true, manual: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!calledWithServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId) {
      const result = await runForUser(userId, requestedAgentId || "luca");
      await recordCronSuccess("mnemos-consolidate", Date.now() - __jobStart);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode: consolidate for scopes with newly formed or recently accessed
    // substrate. Using only last_accessed_at can miss custom agents whose new
    // engrams have not yet been pulled through retrieval/rehearsal.
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [
      { data: newlyFormed, error: createdErr },
      { data: recentlyAccessed, error: accessedErr },
    ] = await Promise.all([
      supabase
        .from("engrams")
        .select("user_id, agent_id")
        .in("state", ["active", "consolidating"])
        .gte("created_at", cutoff)
        .limit(100),
      supabase
        .from("engrams")
        .select("user_id, agent_id")
        .in("state", ["active", "consolidating"])
        .gte("last_accessed_at", cutoff)
        .limit(100),
    ]);
    if (createdErr) throw createdErr;
    if (accessedErr) throw accessedErr;

    const users = [...(newlyFormed ?? []), ...(recentlyAccessed ?? [])];
    const uniqueScopes = [...new Map((users ?? []).map((u: { user_id: string; agent_id?: string | null }) =>
      [`${u.user_id}:${u.agent_id || "luca"}`, { userId: u.user_id, agentId: u.agent_id || "luca" }]
    )).values()];

    const results: Record<string, unknown> = {};

    for (const scope of uniqueScopes) {
      try {
        results[`${scope.userId}:${scope.agentId}`] = await runForUser(scope.userId, scope.agentId);
      } catch (e) {
        results[`${scope.userId}:${scope.agentId}`] = { error: (e as Error).message };
      }
    }

    await recordCronSuccess("mnemos-consolidate", Date.now() - __jobStart);
    return new Response(JSON.stringify({ success: true, scopes_processed: uniqueScopes.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await recordCronFailure("mnemos-consolidate", Date.now() - __jobStart, err);
    console.error("mnemos-consolidate error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message, code: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

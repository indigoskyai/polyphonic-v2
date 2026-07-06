/**
 * mnemos-verify — End-to-end pipeline check for the Mnemos memory system.
 *
 * Runs a bounded lifecycle check against the calling user with temporary
 * database writes, then cleans up. This proves that encoding (with the salience
 * gate), decay math, and the dialectic salience gate are wired together without
 * accidentally launching a full nightly cognition job.
 *
 * Test fixtures:
 *   - Two low-salience exchanges that SHOULD be filtered by the gate.
 *   - Three high-signal beats (preference, surprise, emotional) that SHOULD
 *     encode and form connections.
 *
 * The function deletes tagged rows it created before returning, so it is safe
 * to call repeatedly on a real account.
 *
 * POST /functions/v1/mnemos-verify
 *   { "cleanup": true }   // default true — pass false to inspect the rows
 *   { "run_decay_cycle": true, "run_consolidation": true } // explicit opt-in
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/openclaw/auth.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { isSubstrateAgentId, normalizeAgentId } from "../_shared/agent-scope.ts";
import { runSofteningCycle } from "../_shared/mnemos/softening.ts";
import {
  computeDecayedValues,
  determineState,
} from "../_shared/mnemos/decay.ts";
import { computeEncodingSalience } from "../_shared/mnemos/salience.ts";

interface Beat {
  label: string;
  content: string;
  expectEncode: boolean;
  tags?: string[];
  surprise_score?: number;
  emotional_arousal?: number;
  emotional_valence?: number;
}

interface Body {
  cleanup?: boolean;
  agent_id?: string;
  run_decay_cycle?: boolean;
  run_consolidation?: boolean;
  run_service_checks?: boolean;
}

interface CleanupReport {
  run_id: string;
  engrams_deleted: number;
  connections_deleted: number;
  emotional_snapshots_deleted: number;
  softening_proposals_deleted: number;
  continuity_events_deleted: number;
  errors: string[];
}

type SupabaseAdminClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

const FIXTURES: Beat[] = [
  // Low-signal — should be filtered.
  {
    label: "small_talk_1",
    content: "Hey. Just saying hi.",
    expectEncode: false,
    surprise_score: 0,
    emotional_arousal: 0,
    emotional_valence: 0,
  },
  {
    label: "small_talk_2",
    content: "Sounds good. Cool. Got it.",
    expectEncode: false,
    surprise_score: 0,
    emotional_arousal: 0,
    emotional_valence: 0,
  },
  // High-signal — should encode.
  {
    label: "preference",
    content: "I prefer terse, direct critique over compliments. Don't soften feedback.",
    expectEncode: true,
    tags: ["preference"],
  },
  {
    label: "surprise",
    content:
      "Actually I changed my mind about working at the startup — I'm taking the staff role at the larger company instead.",
    expectEncode: true,
    surprise_score: 0.9,
    emotional_arousal: 0.6,
    emotional_valence: 0.4,
  },
  {
    label: "emotional",
    content:
      "My grandfather died last night. I'm wrecked. He was the one person who really got me.",
    expectEncode: true,
    surprise_score: 0.8,
    emotional_arousal: 0.9,
    emotional_valence: -0.9,
  },
];

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  const auth = await authenticateUser(req);
  if (!auth) {
    return jsonResp({ error: "unauthorized" }, 401, cors);
  }
  const userId = auth.userId;

  const body = (await req.json().catch(() => ({}))) as Body;
  const cleanup = body.cleanup !== false;
  const runDecayCycle = body.run_decay_cycle === true;
  const runConsolidation = body.run_consolidation === true;
  const runServiceChecks = body.run_service_checks === true;
  const agentId = normalizeAgentId(body?.agent_id);

  if (!isSubstrateAgentId(agentId)) {
    return jsonResp({
      ok: true,
      skipped: true,
      agent_id: agentId,
      reason: `${agentId} is an observer sidecar, not a Mnemos substrate agent`,
    }, 200, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const engine = new MnemosEngine(supabase, userId, agentId);
  const runId = crypto.randomUUID();
  const runStartedAt = new Date().toISOString();
  const createdEngramIds: string[] = [];
  const stages: Record<string, unknown> = {};
  const issues: string[] = [];
  let status = 200;

  try {
    stages.config = {
      run_id: runId,
      cleanup,
      run_decay_cycle: runDecayCycle,
      run_consolidation: runConsolidation,
      run_service_checks: runServiceChecks,
      belief_llm_synthesis_enabled: (Deno.env.get("BELIEF_LLM_SYNTHESIS_ENABLED") || "").trim().toLowerCase() === "true",
      belief_synthesis_autoactivate: (Deno.env.get("BELIEF_SYNTHESIS_AUTOACTIVATE") || "").trim().toLowerCase() === "true",
    };

    // ---------------------------------------------------------------------
    // Stage 1: Encoding (salience gate)
    // ---------------------------------------------------------------------
    const encodeResults: Array<{
      label: string;
      expected: boolean;
      encoded: boolean;
      skip_reason?: string;
      salience?: number;
    }> = [];

    for (const beat of FIXTURES) {
      try {
        const result = await engine.encode(beat.content, {
          engram_type: "episodic",
          tags: [...new Set(["mnemos_verify", ...(beat.tags ?? [])])],
          source_context: { type: "mnemos_verify", run_id: runId, label: beat.label, agent_id: agentId },
          surprise_score: beat.surprise_score,
          emotional_arousal: beat.emotional_arousal,
          emotional_valence: beat.emotional_valence,
        });

        const encoded = !result.skipped && !!result.engram;
        encodeResults.push({
          label: beat.label,
          expected: beat.expectEncode,
          encoded,
          skip_reason: result.skip_reason,
          salience: result.salience,
        });

        if (encoded && result.engram) {
          createdEngramIds.push(result.engram.id);
        }
        if (encoded !== beat.expectEncode) {
          issues.push(
            `encoding.${beat.label}: expected encode=${beat.expectEncode} got ${encoded} (salience=${result.salience?.toFixed(3)}, reason=${result.skip_reason})`,
          );
        }
      } catch (e) {
        issues.push(`encoding.${beat.label}: threw ${(e as Error).message}`);
      }
    }
    stages.encoding = {
      beats: encodeResults,
      engrams_written: createdEngramIds.length,
    };

    // ---------------------------------------------------------------------
    // Stage 2: Decay (math + optional DB mutation)
    // ---------------------------------------------------------------------
    const decayMath = {
      fresh: computeDecayedValues({
        strength: 0.7, stability: 0.1, accessibility: 0.7,
        connections: 0, elapsedHours: 24, ageHours: 24,
      }),
      consolidated: computeDecayedValues({
        strength: 0.7, stability: 0.8, accessibility: 0.7,
        connections: 5, elapsedHours: 24, ageHours: 24 * 30,
      }),
      abandoned: computeDecayedValues({
        strength: 0.4, stability: 0.05, accessibility: 0.4,
        connections: 0, elapsedHours: 24 * 60, ageHours: 24 * 60,
      }),
    };
    if (decayMath.consolidated.accessibility <= decayMath.fresh.accessibility) {
      issues.push("decay.math: stability did not slow accessibility decay");
    }
    if (decayMath.abandoned.accessibility >= 0.1) {
      issues.push("decay.math: long-abandoned engram still highly accessible");
    }

    let decayCycle: unknown = {
      skipped: true,
      reason: "run_decay_cycle must be true for mutating decay verification",
    };
    if (runDecayCycle) {
      try {
        decayCycle = await engine.decay({
          min_hours_since_access: 0,
          archive_below_threshold: false,
          rate_multiplier: 1,
        });
      } catch (e) {
        issues.push(`decay.cycle: ${(e as Error).message}`);
      }
    }
    stages.decay = { math: decayMath, cycle: decayCycle };

    // ---------------------------------------------------------------------
    // Stage 3: Consolidation
    // ---------------------------------------------------------------------
    if (runConsolidation) {
      try {
        stages.consolidation = await engine.consolidate({ lookback_hours: 1 });
      } catch (e) {
        issues.push(`consolidation: ${(e as Error).message}`);
      }
    } else {
      stages.consolidation = {
        skipped: true,
        reason: "run_consolidation must be true for full consolidation verification",
      };
    }

    // ---------------------------------------------------------------------
    // Stage 4: Dialectic gate (pure check — no LLM call)
    //
    // We don't invoke the dialectic edge function here because it requires the
    // user's OpenRouter key. Instead we verify the gate logic that decides
    // when to apply identity patches.
    // ---------------------------------------------------------------------
    const dialecticChecks = {
      user_model_pass: computeEncodingSalience({
        surprise: 0.9, emotionalArousal: 0.8, emotionalValence: -0.7,
        tags: ["preference"], existingEngramCount: 100,
      }),
      user_model_fail: computeEncodingSalience({
        surprise: 0.1, emotionalArousal: 0.0, emotionalValence: 0.0,
        tags: [], existingEngramCount: 100,
      }),
      bootstrap_pass: computeEncodingSalience({
        surprise: 0.4, emotionalArousal: 0.0, emotionalValence: 0.0,
        tags: [], existingEngramCount: 5,
      }),
    };
    if (!dialecticChecks.user_model_pass.encode) {
      issues.push("salience.gate: high-signal preference rejected");
    }
    if (dialecticChecks.user_model_fail.encode) {
      issues.push("salience.gate: low-signal small-talk encoded");
    }
    stages.dialectic_gate = dialecticChecks;

    // ---------------------------------------------------------------------
    // Stage 5: Service-role-only paths on disposable fixtures
    // ---------------------------------------------------------------------
    if (runServiceChecks) {
      try {
        const serviceChecks = await runDisposableServiceChecks(supabase, userId, agentId, runId);
        stages.service_checks = serviceChecks.stage;
        createdEngramIds.push(...serviceChecks.createdEngramIds);
        for (const issue of serviceChecks.issues) issues.push(issue);
      } catch (e) {
        issues.push(`service_checks: ${(e as Error).message}`);
      }
    } else {
      stages.service_checks = {
        skipped: true,
        reason: "run_service_checks must be true for disposable service-path verification",
      };
    }
  } catch (e) {
    status = 500;
    issues.push(`verify.unhandled: ${(e as Error).message}`);
  }

  let cleanupReport: CleanupReport | null = null;
  if (cleanup) {
    try {
      cleanupReport = await cleanupVerifierArtifacts(supabase, userId, agentId, createdEngramIds, runId, runStartedAt);
    } catch (e) {
      cleanupReport = {
        run_id: runId,
        engrams_deleted: 0,
        connections_deleted: 0,
        emotional_snapshots_deleted: 0,
        softening_proposals_deleted: 0,
        continuity_events_deleted: 0,
        errors: [`cleanup threw: ${(e as Error).message}`],
      };
    }
  }
  if (cleanupReport?.errors.length) {
    issues.push(...cleanupReport.errors.map((error) => `cleanup: ${error}`));
  }

  return jsonResp(
    {
      ok: issues.length === 0,
      user_id: userId,
      agent_id: agentId,
      run_id: runId,
      issues,
      stages,
      cleaned_up: cleanup,
      cleanup: cleanupReport,
    },
    status,
    cors,
  );
});

async function runDisposableServiceChecks(
  supabase: SupabaseAdminClient,
  userId: string,
  requestedAgentId: string,
  runId: string,
): Promise<{ stage: Record<string, unknown>; createdEngramIds: string[]; issues: string[] }> {
  const safeAgent = requestedAgentId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) || "luca";
  const serviceAgentId = `${safeAgent}-verify-${runId.slice(0, 8)}`;
  const oldIso = new Date(Date.now() - 96 * 3600_000).toISOString();
  const targetId = crypto.randomUUID();
  const supportAId = crypto.randomUUID();
  const supportBId = crypto.randomUUID();
  const targetContent = `Mnemos verifier softening target ${runId}: Riley prefers compact audit trails that preserve evidence, uncertainty, and voice while avoiding decorative filler.`;
  const createdEngramIds = [targetId, supportAId, supportBId];
  const issues: string[] = [];

  const sourceContext = (label: string) => ({
    type: "mnemos_verify",
    run_id: runId,
    label,
    service_check: true,
    cleanup_required: true,
    agent_id: serviceAgentId,
  });

  const { error: insertErr } = await supabase.from("engrams").insert([
    {
      id: targetId,
      user_id: userId,
      agent_id: serviceAgentId,
      content: targetContent,
      engram_type: "semantic",
      strength: 0.28,
      stability: 0.2,
      accessibility: 0.72,
      emotional_valence: 0.1,
      emotional_arousal: 0.2,
      surprise_score: 0.8,
      source_context: sourceContext("service_softening_target"),
      tags: ["mnemos_verify", "service_check", "continuity"],
      state: "active",
      last_accessed_at: oldIso,
      created_at: oldIso,
      updated_at: oldIso,
      access_count: 1,
    },
    {
      id: supportAId,
      user_id: userId,
      agent_id: serviceAgentId,
      content: `Mnemos verifier support A ${runId}: compact audit trails keep reasoning inspectable without losing nuance.`,
      engram_type: "semantic",
      strength: 0.62,
      stability: 0.32,
      accessibility: 0.66,
      emotional_valence: 0.2,
      emotional_arousal: 0.2,
      surprise_score: 0.7,
      source_context: sourceContext("service_support_a"),
      tags: ["mnemos_verify", "service_check", "continuity"],
      state: "active",
      last_accessed_at: oldIso,
      created_at: oldIso,
      updated_at: oldIso,
      access_count: 1,
    },
    {
      id: supportBId,
      user_id: userId,
      agent_id: serviceAgentId,
      content: `Mnemos verifier support B ${runId}: durable memory should keep provenance visible and avoid generic flattening.`,
      engram_type: "semantic",
      strength: 0.64,
      stability: 0.34,
      accessibility: 0.68,
      emotional_valence: 0.2,
      emotional_arousal: 0.2,
      surprise_score: 0.7,
      source_context: sourceContext("service_support_b"),
      tags: ["mnemos_verify", "service_check", "continuity"],
      state: "active",
      last_accessed_at: oldIso,
      created_at: oldIso,
      updated_at: oldIso,
      access_count: 1,
    },
  ]);
  if (insertErr) throw new Error(`service fixture insert failed: ${insertErr.message}`);

  const { error: connErr } = await supabase.from("connections").insert([
    {
      user_id: userId,
      agent_id: serviceAgentId,
      source_id: targetId,
      target_id: supportAId,
      connection_type: "co_occurs",
      formed_by: "explicit",
      weight: 0.6,
    },
    {
      user_id: userId,
      agent_id: serviceAgentId,
      source_id: targetId,
      target_id: supportBId,
      connection_type: "co_occurs",
      formed_by: "explicit",
      weight: 0.6,
    },
  ]);
  if (connErr) throw new Error(`service fixture connection insert failed: ${connErr.message}`);

  const stage: Record<string, unknown> = {
    service_agent_id: serviceAgentId,
    fixture_engram_ids: createdEngramIds,
  };

  const { data: keyData, error: keyError } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
  const apiKey = (keyData as string | null) ?? null;
  if (keyError || !apiKey) {
    stage.softening = { skipped: true, reason: keyError?.message ?? "no_api_key" };
  } else {
    try {
      const softeningResults = await runSofteningCycle(supabase, userId, apiKey, serviceAgentId, {
        dryRun: true,
      });
      const { data: proposals } = await supabase
        .from("mnemos_softening_proposals")
        .select("id, status, dry_run, applied_at, validator_result")
        .eq("user_id", userId)
        .eq("agent_id", serviceAgentId)
        .eq("engram_id", targetId);
      const { data: afterSoftening } = await supabase
        .from("engrams")
        .select("content")
        .eq("id", targetId)
        .maybeSingle();
      const originalUnchanged = afterSoftening?.content === targetContent;
      if (softeningResults.length === 0) issues.push("service_checks.softening: no proposal/result created");
      if (!originalUnchanged) issues.push("service_checks.softening: dry-run mutated original engram");
      stage.softening = {
        results: softeningResults.length,
        proposals: proposals ?? [],
        original_unchanged: originalUnchanged,
      };
    } catch (e) {
      issues.push(`service_checks.softening: ${(e as Error).message}`);
      stage.softening = { error: (e as Error).message };
    }
  }

  const { data: beforeRehearsal } = await supabase
    .from("engrams")
    .select("last_accessed_at, last_rehearsed_at, rehearse_count, stability, accessibility")
    .eq("id", targetId)
    .maybeSingle();
  const { data: rehearseCount, error: rehearseErr } = await supabase.rpc("mnemos_rehearse_scope", {
    p_user_id: userId,
    p_agent_id: serviceAgentId,
    p_budget: 10,
    p_value_floor: 0.1,
  });
  const { data: afterRehearsal } = await supabase
    .from("engrams")
    .select("last_accessed_at, last_rehearsed_at, rehearse_count, stability, accessibility")
    .eq("id", targetId)
    .maybeSingle();
  if (rehearseErr) issues.push(`service_checks.rehearsal: ${rehearseErr.message}`);
  if (!afterRehearsal?.last_rehearsed_at) issues.push("service_checks.rehearsal: last_rehearsed_at was not set");
  if (beforeRehearsal?.last_accessed_at !== afterRehearsal?.last_accessed_at) {
    issues.push("service_checks.rehearsal: last_accessed_at changed");
  }
  if (beforeRehearsal?.accessibility !== afterRehearsal?.accessibility) {
    issues.push("service_checks.rehearsal: accessibility changed");
  }
  stage.rehearsal = {
    rpc_count: rehearseCount ?? 0,
    before: beforeRehearsal,
    after: afterRehearsal,
  };

  const { data: beforeDecay } = await supabase
    .from("engrams")
    .select("strength, stability, accessibility, state")
    .eq("id", targetId)
    .maybeSingle();
  const serviceEngine = new MnemosEngine(supabase, userId, serviceAgentId);
  const decayResult = await serviceEngine.decay({
    min_hours_since_access: 0,
    archive_below_threshold: false,
    rate_multiplier: 1,
  });
  const { data: afterDecay } = await supabase
    .from("engrams")
    .select("strength, stability, accessibility, state")
    .eq("id", targetId)
    .maybeSingle();
  const decayChanged =
    beforeDecay?.strength !== afterDecay?.strength ||
    beforeDecay?.accessibility !== afterDecay?.accessibility ||
    beforeDecay?.stability !== afterDecay?.stability;
  if (!decayChanged) issues.push("service_checks.decay: target fixture did not change");
  stage.decay = {
    result: decayResult,
    before: beforeDecay,
    after: afterDecay,
    changed: decayChanged,
  };

  return { stage, createdEngramIds, issues };
}

async function cleanupVerifierArtifacts(
  supabase: SupabaseAdminClient,
  userId: string,
  agentId: string,
  createdEngramIds: string[],
  runId: string,
  runStartedAt: string,
): Promise<CleanupReport> {
  const report: CleanupReport = {
    run_id: runId,
    engrams_deleted: 0,
    connections_deleted: 0,
    emotional_snapshots_deleted: 0,
    softening_proposals_deleted: 0,
    continuity_events_deleted: 0,
    errors: [],
  };

  const ids = new Set(createdEngramIds.filter(Boolean));
  const { data: tagged, error: tagError } = await supabase
    .from("engrams")
    .select("id")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .contains("source_context", { type: "mnemos_verify", run_id: runId });
  if (tagError) {
    report.errors.push(`engram lookup failed: ${tagError.message}`);
  }
  for (const row of (tagged ?? []) as Array<{ id: string }>) {
    ids.add(row.id);
  }

  const engramIds = [...ids];
  if (engramIds.length > 0) {
    const { data: deletedProposals, error: proposalError } = await supabase
      .from("mnemos_softening_proposals")
      .delete()
      .eq("user_id", userId)
      .in("engram_id", engramIds)
      .select("id");
    if (proposalError) {
      report.errors.push(`softening proposal cleanup failed: ${proposalError.message}`);
    } else {
      report.softening_proposals_deleted = deletedProposals?.length ?? 0;
    }

    const { data: deletedEvents, error: eventError } = await supabase
      .from("continuity_events")
      .delete()
      .eq("user_id", userId)
      .gte("created_at", runStartedAt)
      .in("subject_id", engramIds)
      .select("id");
    if (eventError) {
      report.errors.push(`continuity event cleanup failed: ${eventError.message}`);
    } else {
      report.continuity_events_deleted = deletedEvents?.length ?? 0;
    }

    for (const column of ["source_id", "target_id"]) {
      const { data: deletedConnections, error: connectionError } = await supabase
        .from("connections")
        .delete()
        .in(column, engramIds)
        .select("id");
      if (connectionError) {
        report.errors.push(`connection cleanup failed (${column}): ${connectionError.message}`);
      } else {
        report.connections_deleted += deletedConnections?.length ?? 0;
      }
    }

    const { data: deletedEngrams, error: engramError } = await supabase
      .from("engrams")
      .delete()
      .in("id", engramIds)
      .select("id");
    if (engramError) {
      report.errors.push(`engram cleanup failed: ${engramError.message}`);
    } else {
      report.engrams_deleted = deletedEngrams?.length ?? 0;
    }
  }

  const { data: deletedSnapshots, error: emotionalError } = await supabase
    .from("mnemos_emotional_state")
    .delete()
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .gte("recorded_at", runStartedAt)
    .contains("source_context", { type: "mnemos_verify", run_id: runId })
    .select("id");
  if (emotionalError) {
    report.errors.push(`emotional snapshot cleanup failed: ${emotionalError.message}`);
  } else {
    report.emotional_snapshots_deleted = deletedSnapshots?.length ?? 0;
  }

  return report;
}

function jsonResp(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

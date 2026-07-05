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
}

interface CleanupReport {
  run_id: string;
  engrams_deleted: number;
  connections_deleted: number;
  emotional_snapshots_deleted: number;
  errors: string[];
}

type SupabaseAdminClient = { from: (table: string) => any };

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
    const idList = engramIds.join(",");
    const { data: deletedConnections, error: connectionError } = await supabase
      .from("connections")
      .delete()
      .or(`source_id.in.(${idList}),target_id.in.(${idList})`)
      .select("id");
    if (connectionError) {
      report.errors.push(`connection cleanup failed: ${connectionError.message}`);
    } else {
      report.connections_deleted = deletedConnections?.length ?? 0;
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

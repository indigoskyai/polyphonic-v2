/**
 * Mnemos Memory System — Decay (dual-trace, reference-aligned)
 *
 * Models a human-feeling forgetting curve:
 *   - Accessibility decays exponentially with elapsed time, modulated by
 *     stability: effective_rate = base * exp(-k * stability).
 *   - Connection-rich engrams resist decay (well-embedded memories last).
 *   - Strength decays at 10% of accessibility's rate (durable storage trace).
 *   - Engrams with ≥ STABILITY_CONNECTION_THRESHOLD connections gain a small
 *     amount of stability per cycle — graph topology drives persistence.
 *   - Recently-created or "foundational" / "active_project" engrams have
 *     accessibility floors so the agent doesn't forget what's right in front
 *     of it.
 *   - State transitions: active → dormant when accessibility drops below
 *     DORMANT_ACCESSIBILITY_THRESHOLD; dormant → archived only after
 *     ARCHIVE_DORMANT_DAYS of no access AND strength below ARCHIVE_THRESHOLD.
 */

import type { DecayOptions, DecayResult, Engram, EngramArchive } from "./types.ts";
import {
  ACCESSIBILITY_DECAY_RATE,
  STRENGTH_DECAY_FACTOR,
  STABILITY_DECAY_FACTOR,
  STABILITY_CONNECTION_THRESHOLD,
  STABILITY_GROWTH_RATE,
  STABILITY_GROWTH_CAP,
  DORMANT_ACCESSIBILITY_THRESHOLD,
  ARCHIVE_THRESHOLD,
  ARCHIVE_DORMANT_DAYS,
  RECENT_ACCESSIBILITY_FLOOR,
} from "./constants.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Pure math (exported for tests)
// ---------------------------------------------------------------------------

export interface DecayInputs {
  strength: number;
  stability: number;
  accessibility: number;
  /** Number of connections this engram participates in. */
  connections: number;
  /** Hours since last access. */
  elapsedHours: number;
  /** Hours since the engram was created (for the recency floor). */
  ageHours: number;
  /** Tags can pin floors (foundational, active_project). */
  tags?: readonly string[];
}

export interface DecayOutputs {
  strength: number;
  stability: number;
  accessibility: number;
}

/**
 * Compute the new dual-trace values after a decay interval. Pure function —
 * no I/O, fully testable. Mirrors mnemos/consolidation/decay.py.
 */
export function computeDecayedValues(input: DecayInputs): DecayOutputs {
  const { strength, stability, accessibility, connections, elapsedHours, ageHours, tags } = input;

  // Effective accessibility decay rate, modulated by stability.
  let effective = ACCESSIBILITY_DECAY_RATE * Math.exp(-STABILITY_DECAY_FACTOR * stability);

  // Connection resistance: well-connected memories decay slower (multiplicative).
  if (connections > 0) {
    const connectionFactor = Math.min(1, 0.2 + 0.2 * Math.log1p(connections));
    effective *= 1 - connectionFactor * 0.5;
  }

  // Connection-driven stability growth.
  let nextStability = stability;
  if (connections >= STABILITY_CONNECTION_THRESHOLD) {
    const growth = Math.min(STABILITY_GROWTH_CAP, STABILITY_GROWTH_RATE * Math.log1p(connections));
    nextStability = Math.min(1, +(stability + growth).toFixed(4));
  }

  // Exponential decay of accessibility.
  let nextAccessibility = accessibility * Math.exp(-effective * elapsedHours);
  nextAccessibility = Math.max(0, Math.min(1, nextAccessibility));

  // Strength decays 10× slower than accessibility's effective rate.
  const strengthLoss = strength * (1 - Math.exp(-effective * STRENGTH_DECAY_FACTOR * elapsedHours));
  let nextStrength = Math.max(0, strength - strengthLoss);

  // Floors.
  const tagSet = new Set(tags ?? []);
  if (tagSet.has("foundational")) {
    nextAccessibility = Math.max(0.5, nextAccessibility);
    nextStrength = Math.max(0.5, nextStrength);
  }
  if (tagSet.has("active_project")) {
    nextAccessibility = Math.max(0.6, nextAccessibility);
  }
  if (ageHours < 72) {
    nextAccessibility = Math.max(RECENT_ACCESSIBILITY_FLOOR, nextAccessibility);
  }

  return {
    strength: +nextStrength.toFixed(4),
    stability: +nextStability.toFixed(4),
    accessibility: +nextAccessibility.toFixed(4),
  };
}

/** Determine the lifecycle state after decay. */
export function determineState(
  strength: number,
  accessibility: number,
  currentState: Engram["state"],
  hoursSinceAccess: number
): Engram["state"] {
  if (currentState === "archived") return "archived";

  if (
    currentState === "dormant" &&
    strength < ARCHIVE_THRESHOLD &&
    hoursSinceAccess >= ARCHIVE_DORMANT_DAYS * 24
  ) {
    return "archived";
  }

  if (accessibility < DORMANT_ACCESSIBILITY_THRESHOLD) {
    return "dormant";
  }

  // Recover from dormant if accessibility climbed back up (shouldn't happen
  // during pure decay, but is safe under reconsolidation).
  if (currentState === "dormant" && accessibility >= DORMANT_ACCESSIBILITY_THRESHOLD) {
    return "active";
  }

  return currentState;
}

// ---------------------------------------------------------------------------
// Batch decay execution
// ---------------------------------------------------------------------------

async function countConnections(
  supabase: SupabaseClient,
  agentId: string,
  engramIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (engramIds.length === 0) return counts;

  // Two queries (source side / target side) — cheaper than a giant OR.
  const { data: sourceRows } = await supabase
    .from("connections")
    .select("source_id")
    .eq("agent_id", agentId)
    .in("source_id", engramIds);

  const { data: targetRows } = await supabase
    .from("connections")
    .select("target_id")
    .eq("agent_id", agentId)
    .in("target_id", engramIds);

  for (const r of (sourceRows ?? []) as Array<{ source_id: string }>) {
    counts.set(r.source_id, (counts.get(r.source_id) ?? 0) + 1);
  }
  for (const r of (targetRows ?? []) as Array<{ target_id: string }>) {
    counts.set(r.target_id, (counts.get(r.target_id) ?? 0) + 1);
  }
  return counts;
}

export async function runDecayCycle(
  supabase: SupabaseClient,
  userId: string,
  options: DecayOptions = {}
): Promise<DecayResult> {
  const { min_hours_since_access = 1, archive_below_threshold = true, rate_multiplier = 1 } = options;
  const agentId = (options as DecayOptions & { agentId?: string }).agentId || "luca";

  const now = new Date();
  let totalProcessed = 0;
  let totalDecayed = 0;
  let totalArchived = 0;
  let offset = 0;

  while (true) {
    const { data: engrams, error } = await supabase
      .from("engrams")
      .select(
        "id, strength, stability, accessibility, state, last_accessed_at, content, engram_type, tags, source_context, created_at"
      )
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .in("state", ["active", "consolidating", "dormant"])
      .order("last_accessed_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Decay: failed to fetch engrams — ${error.message}`);
    if (!engrams || engrams.length === 0) break;

    const ids = (engrams as Array<{ id: string }>).map((e) => e.id);
    const connectionCounts = await countConnections(supabase, agentId, ids);

    const toUpdate: Array<{
      id: string;
      strength: number;
      stability: number;
      accessibility: number;
      state: Engram["state"];
    }> = [];
    const toArchive: EngramArchive[] = [];

    for (const engram of engrams as Engram[]) {
      const lastAccessed = new Date(engram.last_accessed_at);
      const created = new Date(engram.created_at);
      const elapsedHoursRaw = (now.getTime() - lastAccessed.getTime()) / 3_600_000;
      const ageHours = (now.getTime() - created.getTime()) / 3_600_000;
      const elapsedHours = elapsedHoursRaw * rate_multiplier;

      if (elapsedHoursRaw < min_hours_since_access) continue;

      const decayed = computeDecayedValues({
        strength: engram.strength,
        stability: engram.stability,
        accessibility: engram.accessibility,
        connections: connectionCounts.get(engram.id) ?? 0,
        elapsedHours,
        ageHours,
        tags: engram.tags ?? [],
      });

      const newState = determineState(decayed.strength, decayed.accessibility, engram.state, elapsedHoursRaw);

      const noChange =
        Math.abs(decayed.strength - engram.strength) < 0.001 &&
        Math.abs(decayed.accessibility - engram.accessibility) < 0.001 &&
        Math.abs(decayed.stability - engram.stability) < 0.0005 &&
        newState === engram.state;
      if (noChange) continue;

      if (newState === "archived" && archive_below_threshold) {
        toArchive.push({
          id: engram.id,
          user_id: userId,
          agent_id: agentId,
          content: engram.content,
          engram_type: engram.engram_type,
          original_strength: engram.strength,
          original_stability: engram.stability,
          tags: engram.tags ?? [],
          source_context: engram.source_context ?? {},
          archived_at: now.toISOString(),
          original_created_at: engram.created_at,
        });
      } else {
        toUpdate.push({ id: engram.id, ...decayed, state: newState });
      }
    }

    for (const u of toUpdate) {
      const { error: e } = await supabase
        .from("engrams")
        .update({
          strength: u.strength,
          stability: u.stability,
          accessibility: u.accessibility,
          state: u.state,
          updated_at: now.toISOString(),
        })
        .eq("id", u.id);
      if (e) {
        console.error(`Decay: failed to update engram ${u.id} — ${e.message}`);
        continue;
      }
      totalDecayed++;
    }

    if (toArchive.length > 0) {
      const { error: aErr } = await supabase.from("engram_archive").insert(toArchive);
      if (aErr) {
        console.error(`Decay: failed to insert archive batch — ${aErr.message}`);
      } else {
        const archivedIds = toArchive.map((a) => a.id);
        const { error: dErr } = await supabase.from("engrams").delete().in("id", archivedIds);
        if (dErr) {
          console.error(`Decay: failed to delete archived engrams — ${dErr.message}`);
        } else {
          totalArchived += toArchive.length;
        }
        for (const id of archivedIds) {
          await supabase
            .from("connections")
            .delete()
            .eq("agent_id", agentId)
            .or(`source_id.eq.${id},target_id.eq.${id}`);
        }
      }
    }

    totalProcessed += engrams.length;
    if (engrams.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return {
    engrams_decayed: totalDecayed,
    engrams_archived: totalArchived,
    total_processed: totalProcessed,
  };
}

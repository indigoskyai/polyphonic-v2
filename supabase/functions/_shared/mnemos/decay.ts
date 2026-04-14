/**
 * Mnemos Memory System — Decay
 *
 * Time-based decay of engram strength and accessibility.
 * Accessibility decays faster than strength (per dual-trace theory).
 * Stability acts as a decay buffer — well-rehearsed memories resist forgetting.
 *
 * State transitions:
 *   active -> dormant   (accessibility < 0.1 AND strength < DORMANT_THRESHOLD)
 *   dormant -> archived (strength < ARCHIVE_THRESHOLD AND 30+ days since access)
 */

import type { DecayOptions, DecayResult, Engram, EngramArchive } from "./types.ts";
import {
  STRENGTH_DECAY_RATE,
  ACCESSIBILITY_DECAY_RATE,
  DORMANT_THRESHOLD,
  ARCHIVE_THRESHOLD,
} from "./constants.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

/** How many engrams to process per batch to avoid timeouts. */
const BATCH_SIZE = 100;

/** Days a dormant engram must be untouched before archiving. */
const ARCHIVE_DORMANT_DAYS = 30;

/** Accessibility threshold below which an engram qualifies for dormancy. */
const DORMANT_ACCESSIBILITY_THRESHOLD = 0.1;

// ---------------------------------------------------------------------------
// Core Decay Math
// ---------------------------------------------------------------------------

/**
 * Compute the effective decay rate, modulated by stability.
 * Higher stability slows decay: effective_rate = base_rate / (1 + stability)
 */
function effectiveDecayRate(baseRate: number, stability: number): number {
  return baseRate / (1 + stability);
}

/**
 * Apply exponential decay to a value.
 * new_value = value * exp(-rate * elapsed_hours)
 */
function applyDecay(value: number, rate: number, elapsedHours: number): number {
  return value * Math.exp(-rate * elapsedHours);
}

/**
 * Calculate decayed strength and accessibility for an engram.
 * Accessibility decays at the full rate; strength decays at 0.3x the rate
 * (strength is more durable than accessibility in dual-trace theory).
 */
export function computeDecayedValues(
  engram: Pick<Engram, "strength" | "accessibility" | "stability">,
  elapsedHours: number
): { strength: number; accessibility: number } {
  const strengthRate = effectiveDecayRate(STRENGTH_DECAY_RATE, engram.stability);
  const accessibilityRate = effectiveDecayRate(ACCESSIBILITY_DECAY_RATE, engram.stability);

  return {
    // Strength decays at 0.3x the rate — more durable trace
    strength: applyDecay(engram.strength, strengthRate * 0.3, elapsedHours),
    // Accessibility decays at the full rate — fades faster
    accessibility: applyDecay(engram.accessibility, accessibilityRate, elapsedHours),
  };
}

/**
 * Determine the new state for an engram based on its decayed values.
 */
export function determineState(
  strength: number,
  accessibility: number,
  currentState: Engram["state"],
  hoursSinceAccess: number
): Engram["state"] {
  // Already archived — no further transitions
  if (currentState === "archived") return "archived";

  // Dormant -> archived: below archive threshold and untouched for 30+ days
  if (
    currentState === "dormant" &&
    strength < ARCHIVE_THRESHOLD &&
    hoursSinceAccess >= ARCHIVE_DORMANT_DAYS * 24
  ) {
    return "archived";
  }

  // Active/consolidating -> dormant: both traces have faded significantly
  if (accessibility < DORMANT_ACCESSIBILITY_THRESHOLD && strength < DORMANT_THRESHOLD) {
    return "dormant";
  }

  return currentState;
}

// ---------------------------------------------------------------------------
// Batch Decay Execution
// ---------------------------------------------------------------------------

/**
 * Run a full decay cycle across all active/consolidating/dormant engrams
 * for a given user. Returns counts of decayed and archived engrams.
 */
export async function runDecayCycle(
  supabase: SupabaseClient,
  userId: string,
  options: DecayOptions = {}
): Promise<DecayResult> {
  const {
    min_hours_since_access = 1,
    archive_below_threshold = true,
  } = options;

  const now = new Date();
  let totalProcessed = 0;
  let totalDecayed = 0;
  let totalArchived = 0;
  let offset = 0;

  // Process in batches to avoid edge function timeouts
  while (true) {
    const { data: engrams, error } = await supabase
      .from("engrams")
      .select("id, strength, stability, accessibility, state, last_accessed_at, content, engram_type, tags, source_context, created_at")
      .eq("user_id", userId)
      .in("state", ["active", "consolidating", "dormant"])
      .order("last_accessed_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      throw new Error(`Decay: failed to fetch engrams — ${error.message}`);
    }

    if (!engrams || engrams.length === 0) break;

    const toUpdate: Array<{ id: string; strength: number; accessibility: number; state: Engram["state"] }> = [];
    const toArchive: Array<EngramArchive> = [];

    for (const engram of engrams) {
      const lastAccessed = new Date(engram.last_accessed_at);
      const elapsedHours = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60);

      // Skip recently accessed engrams
      if (elapsedHours < min_hours_since_access) continue;

      const { strength, accessibility } = computeDecayedValues(engram, elapsedHours);
      const newState = determineState(strength, accessibility, engram.state, elapsedHours);

      // Only update if values actually changed meaningfully
      const strengthDelta = Math.abs(engram.strength - strength);
      const accessibilityDelta = Math.abs(engram.accessibility - accessibility);

      if (strengthDelta < 0.001 && accessibilityDelta < 0.001 && newState === engram.state) {
        continue;
      }

      if (newState === "archived" && archive_below_threshold) {
        toArchive.push({
          id: engram.id,
          user_id: userId,
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
        toUpdate.push({ id: engram.id, strength, accessibility, state: newState });
      }
    }

    // Batch update decayed engrams
    for (const update of toUpdate) {
      const { error: updateError } = await supabase
        .from("engrams")
        .update({
          strength: update.strength,
          accessibility: update.accessibility,
          state: update.state,
          updated_at: now.toISOString(),
        })
        .eq("id", update.id);

      if (updateError) {
        console.error(`Decay: failed to update engram ${update.id} — ${updateError.message}`);
        continue;
      }
      totalDecayed++;
    }

    // Archive engrams below threshold
    if (toArchive.length > 0) {
      // Insert into archive table
      const { error: archiveInsertError } = await supabase
        .from("engram_archive")
        .insert(toArchive);

      if (archiveInsertError) {
        console.error(`Decay: failed to insert archive batch — ${archiveInsertError.message}`);
      } else {
        // Delete archived engrams from the main table
        const archivedIds = toArchive.map((a) => a.id);
        const { error: deleteError } = await supabase
          .from("engrams")
          .delete()
          .in("id", archivedIds);

        if (deleteError) {
          console.error(`Decay: failed to delete archived engrams — ${deleteError.message}`);
        } else {
          totalArchived += toArchive.length;
        }

        // Clean up orphaned connections for archived engrams
        for (const id of archivedIds) {
          await supabase
            .from("connections")
            .delete()
            .or(`source_id.eq.${id},target_id.eq.${id}`);
        }
      }
    }

    totalProcessed += engrams.length;

    // If we got fewer than a full batch, we're done
    if (engrams.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return {
    engrams_decayed: totalDecayed,
    engrams_archived: totalArchived,
    total_processed: totalProcessed,
  };
}

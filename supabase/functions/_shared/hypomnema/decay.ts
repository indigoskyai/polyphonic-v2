/**
 * Hypomnema decay — internal helper.
 *
 * Runs every 6 hours via pg_cron (`hypomnema-decay`, schedule "45 H/6 * * *").
 * Computes a salience score for each active entry, applies anti-decay
 * floors (foundational / active_attention / revision_count), and
 * deactivates entries that fall below threshold.
 *
 * Decay is gentler than Mnemos:
 *   - 14-day exponential half-life on recency (vs 4h for Mnemos)
 *   - foundational entries floor at salience 0.7 — never deactivate
 *   - active_attention (touched in last 7 days) floors at 0.5
 *   - revision_count >= 2 floors at 0.5
 *   - below 0.15 → set active=false (preserve revision history)
 *
 * Salience formula (PLAN.md §2):
 *   salience = confidence*0.30 + recency*0.25 + revision*0.20 + domain*0.15 + foundational_bonus
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const HALF_LIFE_DAYS = 14;
const ATTENTION_WINDOW_DAYS = 7;
const DEACTIVATE_THRESHOLD = 0.15;

const FLOOR_FOUNDATIONAL = 0.70;
const FLOOR_ATTENTION = 0.50;
const FLOOR_REVISED = 0.50;

const BATCH_SIZE = 500;

interface EntryRow {
  id: string;
  confidence: number;
  domain: string | null;
  foundational: boolean;
  active_attention: boolean;
  revision_count: number;
  last_revised: string;
  created_at: string;
}

interface DecayedRow {
  id: string;
  salience: number;
  active: boolean;
  active_attention: boolean;
}

/** Score a single entry. Returns the post-decay salience and lifecycle flags. */
export function computeDecayedSalience(row: EntryRow, nowMs: number): DecayedRow {
  const lastTs = new Date(row.last_revised || row.created_at).getTime();
  const ageDays = Math.max(0, (nowMs - lastTs) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);

  // Domain weight — lightweight: identity/relationship/philosophy carry; everything else is neutral.
  const domain = (row.domain || "").toLowerCase();
  const domainWeight = domain === "identity" || domain === "relationship" || domain === "philosophy"
    ? 1.0
    : 0.7;

  // Revision factor — saturates at 4 revisions.
  const revisionFactor = Math.min(1, (row.revision_count ?? 0) / 4);

  const foundationalBonus = row.foundational ? 0.20 : 0;

  const raw =
    (row.confidence ?? 0) * 0.30 +
    recency * 0.25 +
    revisionFactor * 0.20 +
    domainWeight * 0.15 +
    foundationalBonus;

  // Apply floors
  let salience = raw;
  if (row.foundational) salience = Math.max(salience, FLOOR_FOUNDATIONAL);
  if (row.active_attention && ageDays <= ATTENTION_WINDOW_DAYS) salience = Math.max(salience, FLOOR_ATTENTION);
  if ((row.revision_count ?? 0) >= 2) salience = Math.max(salience, FLOOR_REVISED);

  // Active_attention drops off after the window — write it back so future runs reflect reality.
  const active_attention = row.active_attention && ageDays <= ATTENTION_WINDOW_DAYS;

  // Deactivate below floor (foundational entries are immune via the floor logic above).
  const active = salience >= DEACTIVATE_THRESHOLD;

  return { id: row.id, salience, active, active_attention };
}

export interface DecayResult {
  scanned: number;
  deactivated: number;
  attention_decayed: number;
  errors: number;
}

/**
 * Run the full decay pass across all active entries. Cron-invoked.
 *
 * Streams in batches to keep memory bounded, applies the decay function,
 * and writes back only the entries whose state actually changed.
 */
export async function decayAllActiveEntries(supabase: SupabaseClient): Promise<DecayResult> {
  const result: DecayResult = { scanned: 0, deactivated: 0, attention_decayed: 0, errors: 0 };
  const nowMs = Date.now();
  let cursor: string | null = null;

  // Paginate by created_at so we don't miss/duplicate as updates land.
  // PostgREST keyset on (created_at, id) keeps it simple.
  while (true) {
    let q = supabase
      .from("hypomnema_entry")
      .select("id, confidence, domain, foundational, active_attention, revision_count, last_revised, created_at, active")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    if (cursor) q = q.gt("created_at", cursor);

    const { data, error } = await q;
    if (error) {
      console.error("[hypomnema.decay] fetch failed:", error.message);
      result.errors += 1;
      break;
    }
    if (!data || data.length === 0) break;

    const rows = data as EntryRow[];
    result.scanned += rows.length;

    // Compute and collect changes.
    const updates: Array<{ id: string; active: boolean; active_attention: boolean }> = [];
    for (const row of rows) {
      const decayed = computeDecayedSalience(row, nowMs);
      const wasActive = true; // we filtered on active=true
      const wasAttention = row.active_attention;

      if (decayed.active !== wasActive || decayed.active_attention !== wasAttention) {
        updates.push({ id: row.id, active: decayed.active, active_attention: decayed.active_attention });
        if (!decayed.active) result.deactivated += 1;
        else if (decayed.active_attention !== wasAttention) result.attention_decayed += 1;
      }
    }

    // Apply updates one at a time (small batches; could be optimized to RPC if needed).
    for (const up of updates) {
      const { error: upErr } = await supabase
        .from("hypomnema_entry")
        .update({ active: up.active, active_attention: up.active_attention })
        .eq("id", up.id);
      if (upErr) {
        console.warn("[hypomnema.decay] update failed for", up.id, upErr.message);
        result.errors += 1;
      }
    }

    if (data.length < BATCH_SIZE) break;
    cursor = rows[rows.length - 1].created_at;
  }

  return result;
}

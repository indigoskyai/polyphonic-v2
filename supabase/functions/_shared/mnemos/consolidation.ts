/**
 * Mnemos Memory System — Consolidation
 *
 * The autonomous consolidation cycle reviews recent engrams and:
 * 1. Selects candidates accessed within a configurable window
 * 2. Analyzes pairs for new connection opportunities
 * 3. Strengthens connections that were co-activated
 * 4. Promotes episodic engrams to semantic when mature enough
 * 5. Attempts to form new beliefs from converging evidence
 *
 * This is the structural half of "dreaming" — the narrative half
 * lives in dreaming.ts.
 *
 * Wave 4, Step 23.
 */

import type {
  Belief,
  ConsolidationResult,
  Connection,
  ConnectionType,
  Engram,
} from "./types.ts";

import {
  CONSOLIDATION_MIN_WEIGHT,
  CONSOLIDATION_STRENGTH_BOOST,
  CO_ACTIVATION_WEIGHT_BOOST,
  MAX_CONNECTION_WEIGHT,
  DEFAULT_CONNECTION_WEIGHT,
  PROMOTION_MIN_ACCESSES,
  PROMOTION_MIN_STABILITY,
  CONFIDENCE_TIERS,
  BELIEF_UPDATE_THRESHOLD,
} from "./constants.ts";
import { applySupersession } from "./supersession.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default lookback window for consolidation candidates (hours). */
const DEFAULT_LOOKBACK_HOURS = 24;

/** Maximum candidates to process per consolidation cycle. */
const MAX_CANDIDATES = 100;

/** Maximum pairs to analyze per cycle (controls quadratic blowup). */
const MAX_PAIRS = 500;

/** Similarity threshold for discovering new connections during consolidation. */
const CONSOLIDATION_SIMILARITY_THRESHOLD = 0.2;

// Tier-2 belief-formation relaxation (emergent formation ran at 0.23%).
/** Similarity bar for an engram to "support" a belief seed. Was 0.3 — above even
 *  the 0.2 connection bar, so almost nothing qualified. */
const BELIEF_SIMILARITY_THRESHOLD = 0.18;
/** Lookback for the belief-candidate pool: beliefs should form from evidence that
 *  converges over days/weeks, not only the 24h connection window. Rehearsal's
 *  refreshed last_accessed_at feeds this pool. */
const BELIEF_LOOKBACK_DAYS = 14;

// ---------------------------------------------------------------------------
// Trigram similarity (reused from encoding — lightweight text comparison)
// ---------------------------------------------------------------------------

function trigramSimilarity(a: string, b: string): number {
  const trigramsOf = (s: string): Set<string> => {
    const normalized = s.toLowerCase().trim();
    const set = new Set<string>();
    for (let i = 0; i <= normalized.length - 3; i++) {
      set.add(normalized.slice(i, i + 3));
    }
    return set;
  };

  const setA = trigramsOf(a);
  const setB = trigramsOf(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const tri of setA) {
    if (setB.has(tri)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Step 1: Candidate Selection
// ---------------------------------------------------------------------------

/**
 * Select engrams accessed within the lookback window.
 * These are the memories "replayed" during consolidation.
 */
async function selectCandidates(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  lookbackHours: number
): Promise<Engram[]> {
  const cutoff = new Date(Date.now() - lookbackHours * 3600_000).toISOString();

  const { data, error } = await supabase
    .from("engrams")
    .select("*")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating"])
    .gte("last_accessed_at", cutoff)
    .order("access_count", { ascending: false })
    .limit(MAX_CANDIDATES);

  if (error) {
    throw new Error(`Consolidation: candidate selection failed — ${error.message}`);
  }

  return (data ?? []) as Engram[];
}

/**
 * Wider per-scope pool for belief formation: engrams accessed within the last
 * BELIEF_LOOKBACK_DAYS (vs the 24h connection window), so a tag's evidence can
 * converge over days/weeks. Kept separate from selectCandidates so the quadratic
 * connection-discovery pass is not widened.
 */
async function selectBeliefCandidates(
  supabase: SupabaseClient,
  userId: string,
  agentId: string
): Promise<Engram[]> {
  const cutoff = new Date(Date.now() - BELIEF_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("engrams")
    .select("*")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating"])
    .gte("last_accessed_at", cutoff)
    .order("access_count", { ascending: false })
    .limit(300);
  if (error) {
    throw new Error(`Consolidation: belief candidate selection failed — ${error.message}`);
  }
  return (data ?? []) as Engram[];
}

// ---------------------------------------------------------------------------
// Step 2: Pair Analysis — discover new connections
// ---------------------------------------------------------------------------

interface NewConnectionCandidate {
  sourceId: string;
  targetId: string;
  connectionType: ConnectionType;
  weight: number;
}

/**
 * Analyze pairs of candidate engrams for potential connections.
 * Uses trigram similarity to find related memories that aren't yet connected.
 */
async function analyzePairs(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  candidates: Engram[]
): Promise<NewConnectionCandidate[]> {
  if (candidates.length < 2) return [];

  // Fetch existing connections to avoid duplicates
  const candidateIds = candidates.map((e) => e.id);
  const { data: existingConns } = await supabase
    .from("connections")
    .select("source_id, target_id")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("source_id", candidateIds);

  const { data: existingConnsReverse } = await supabase
    .from("connections")
    .select("source_id, target_id")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("target_id", candidateIds);

  // Build a set of existing pairs for O(1) lookup
  const existingPairs = new Set<string>();
  for (const conn of [...(existingConns ?? []), ...(existingConnsReverse ?? [])]) {
    existingPairs.add(`${conn.source_id}:${conn.target_id}`);
    existingPairs.add(`${conn.target_id}:${conn.source_id}`);
  }

  const newConnections: NewConnectionCandidate[] = [];
  let pairsChecked = 0;

  for (let i = 0; i < candidates.length && pairsChecked < MAX_PAIRS; i++) {
    for (let j = i + 1; j < candidates.length && pairsChecked < MAX_PAIRS; j++) {
      pairsChecked++;

      const a = candidates[i];
      const b = candidates[j];

      // Skip if already connected
      if (existingPairs.has(`${a.id}:${b.id}`)) continue;

      const similarity = trigramSimilarity(a.content, b.content);
      if (similarity < CONSOLIDATION_SIMILARITY_THRESHOLD) continue;

      // Determine connection type from similarity and content relationship
      const connectionType = inferConnectionType(a, b, similarity);

      newConnections.push({
        sourceId: a.id,
        targetId: b.id,
        connectionType,
        weight: clamp(similarity, 0.1, DEFAULT_CONNECTION_WEIGHT),
      });
    }
  }

  return newConnections;
}

/**
 * Infer a connection type between two engrams based on their properties.
 */
function inferConnectionType(a: Engram, b: Engram, similarity: number): ConnectionType {
  // High similarity suggests parallel memories
  if (similarity > 0.5) return "parallels";

  // Same tags suggest extension
  const sharedTags = a.tags.filter((t) => b.tags.includes(t));
  if (sharedTags.length > 0) return "extends";

  // Opposite emotional valence might indicate contradiction
  if (
    Math.sign(a.emotional_valence) !== Math.sign(b.emotional_valence) &&
    Math.abs(a.emotional_valence) > 0.3 &&
    Math.abs(b.emotional_valence) > 0.3
  ) {
    return "contradicts";
  }

  // Default: the memories support each other (general relationship)
  return "supports";
}

// ---------------------------------------------------------------------------
// Step 3: Connection Strengthening (co-activation boost)
// ---------------------------------------------------------------------------

/**
 * Strengthen connections between engrams that were co-activated
 * (both accessed within the consolidation window).
 */
async function strengthenConnections(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  candidates: Engram[]
): Promise<number> {
  if (candidates.length < 2) return 0;

  const candidateIds = candidates.map((e) => e.id);
  let strengthened = 0;

  // Find connections between candidates (co-activated pairs)
  const { data: connections, error } = await supabase
    .from("connections")
    .select("id, source_id, target_id, weight")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("source_id", candidateIds)
    .in("target_id", candidateIds)
    .gte("weight", CONSOLIDATION_MIN_WEIGHT);

  if (error || !connections) return 0;

  for (const conn of connections as Array<{ id: string; weight: number }>) {
    const newWeight = clamp(
      conn.weight + CO_ACTIVATION_WEIGHT_BOOST,
      0,
      MAX_CONNECTION_WEIGHT
    );

    if (newWeight <= conn.weight) continue;

    const { error: updateError } = await supabase
      .from("connections")
      .update({ weight: newWeight })
      .eq("id", conn.id);

    if (!updateError) strengthened++;
  }

  return strengthened;
}

// ---------------------------------------------------------------------------
// Step 4: Engram Strengthening
// ---------------------------------------------------------------------------

/**
 * Boost strength of well-connected engrams during consolidation.
 * Engrams with many connections benefit from the network — they're
 * structurally important and should resist decay.
 */
async function strengthenEngrams(
  supabase: SupabaseClient,
  agentId: string,
  candidates: Engram[]
): Promise<number> {
  let strengthened = 0;

  for (const engram of candidates) {
    // Count connections for this engram
    const { count, error: countError } = await supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .or(`source_id.eq.${engram.id},target_id.eq.${engram.id}`);

    if (countError || (count ?? 0) < 2) continue;

    // Scale boost by connection count (diminishing returns)
    const connectionBoost = CONSOLIDATION_STRENGTH_BOOST * Math.log2(count ?? 2);
    const newStrength = clamp(engram.strength + connectionBoost, 0, 1.0);

    if (newStrength <= engram.strength) continue;

    const { error: updateError } = await supabase
      .from("engrams")
      .update({
        strength: newStrength,
        updated_at: new Date().toISOString(),
      })
      .eq("id", engram.id);

    if (!updateError) strengthened++;
  }

  return strengthened;
}

// ---------------------------------------------------------------------------
// Step 5: Episodic -> Semantic Promotion
// ---------------------------------------------------------------------------

/**
 * Promote episodic engrams to semantic when they've been accessed enough
 * and have sufficient stability. This mirrors biological memory:
 * repeated experiences become general knowledge.
 */
async function promoteEngrams(
  supabase: SupabaseClient,
  candidates: Engram[]
): Promise<number> {
  let promoted = 0;

  for (const engram of candidates) {
    if (engram.engram_type !== "episodic") continue;
    if (engram.access_count < PROMOTION_MIN_ACCESSES) continue;
    if (engram.stability < PROMOTION_MIN_STABILITY) continue;

    const { error } = await supabase
      .from("engrams")
      .update({
        engram_type: "semantic",
        source_context: {
          ...engram.source_context,
          promoted_from: "episodic",
          promoted_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", engram.id);

    if (!error) promoted++;
  }

  return promoted;
}

// ---------------------------------------------------------------------------
// Step 6: Belief Formation
// ---------------------------------------------------------------------------

/**
 * Attempt to form or update beliefs from converging evidence.
 * When multiple engrams share tags and high similarity, they may
 * collectively support a belief.
 */
async function formBeliefs(
  supabase: SupabaseClient,
  userId: string,
  agentId: string
): Promise<number> {
  // Form beliefs from accumulated history (14-day pool), not just the 24h
  // connection window — so a tag whose evidence converges over time produces a
  // belief. Rehearsal's refreshed last_accessed_at feeds this pool.
  const candidates = await selectBeliefCandidates(supabase, userId, agentId);
  if (candidates.length < 3) return 0;

  let beliefsUpdated = 0;

  // Group engrams by their primary tag
  const tagGroups = new Map<string, Engram[]>();
  for (const engram of candidates) {
    for (const tag of engram.tags) {
      const group = tagGroups.get(tag) ?? [];
      group.push(engram);
      tagGroups.set(tag, group);
    }
  }

  // For each tag group with enough members, check for belief-worthy patterns
  for (const [tag, group] of tagGroups) {
    if (group.length < 3) continue;

    // Find the most representative engram (highest strength) as belief seed
    const sorted = [...group].sort((a, b) => b.strength - a.strength);
    const seed = sorted[0];

    // Check how many others support this seed (high similarity)
    const supporting: string[] = [];
    const contradicting: string[] = [];

    for (const other of sorted.slice(1)) {
      const sim = trigramSimilarity(seed.content, other.content);
      if (sim > BELIEF_SIMILARITY_THRESHOLD) {
        // Check emotional alignment — contradicting if opposite valence
        if (
          Math.sign(seed.emotional_valence) !== Math.sign(other.emotional_valence) &&
          Math.abs(other.emotional_valence) > 0.3
        ) {
          contradicting.push(other.id);
        } else {
          supporting.push(other.id);
        }
      }
    }

    // Need at least 2 supporting engrams to form a belief
    if (supporting.length < 2) continue;

    // Calculate confidence from evidence ratio
    const totalEvidence = supporting.length + contradicting.length;
    const confidence = clamp(
      (supporting.length - contradicting.length * 0.5) / totalEvidence,
      0,
      1
    );

    // Dedup by TAG, not by seed. The seed is the highest-strength engram in the
    // group, which churns across the 14-day rehearsal-fed pool — a seed-keyed
    // lookup misses the existing belief when the seed changes, accumulating
    // near-duplicate beliefs per tag (there is no unique constraint on beliefs).
    // One consolidation-belief per tag per scope; content is `[${tag}] ...`. (audit fix)
    const tagPattern = "[" + tag.replace(/([%_\\])/g, "\\$&") + "] %";
    const { data: existingBeliefs } = await supabase
      .from("beliefs")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("source", "consolidation")
      .ilike("content", tagPattern);

    const existingBelief = (existingBeliefs as Belief[] | null)?.[0];

    if (existingBelief) {
      // Update existing belief if confidence changed meaningfully
      const confidenceDelta = Math.abs(existingBelief.confidence - confidence);
      if (confidenceDelta < BELIEF_UPDATE_THRESHOLD) continue;

      // Merge evidence lists
      const allSupporting = [...new Set([...existingBelief.supporting_engram_ids, ...supporting, seed.id])];
      const allContradicting = [...new Set([...existingBelief.contradicting_engram_ids, ...contradicting])];

      const { error } = await supabase
        .from("beliefs")
        .update({
          confidence,
          supporting_engram_ids: allSupporting,
          contradicting_engram_ids: allContradicting,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBelief.id);

      if (!error) beliefsUpdated++;
    } else {
      // Create new belief
      const beliefContent = `[${tag}] ${seed.content}`;

      const { error } = await supabase
        .from("beliefs")
        .insert({
          user_id: userId,
          agent_id: agentId,
          content: beliefContent,
          confidence,
          supporting_engram_ids: [seed.id, ...supporting],
          contradicting_engram_ids: contradicting,
          // Record provenance (this path left source blank, so all beliefs in prod
          // were unattributable) and start the challenge clock at creation — without
          // this, last_challenged was NULL and the stagnation sweep skipped them.
          source: "consolidation",
          last_challenged: new Date().toISOString(),
        });

      if (!error) beliefsUpdated++;
    }
  }

  return beliefsUpdated;
}

// ---------------------------------------------------------------------------
// Step 7: Persist new connections
// ---------------------------------------------------------------------------

async function persistNewConnections(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  connections: NewConnectionCandidate[]
): Promise<number> {
  let created = 0;

  for (const conn of connections) {
    const { error } = await supabase
      .from("connections")
      .insert({
        user_id: userId,
        agent_id: agentId,
        source_id: conn.sourceId,
        target_id: conn.targetId,
        connection_type: conn.connectionType,
        weight: conn.weight,
      });

    if (!error) {
      created++;
      // Supersession (M6): contradicting connections archive the older engram.
      if (conn.connectionType === "contradicts") {
        await applySupersession(supabase, conn.sourceId, conn.targetId, "contradicts").catch(() => {});
      }
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for the consolidation cycle. */
export interface ConsolidationOptions {
  /** How far back to look for candidates (hours). Default: 24. */
  lookback_hours?: number;
  /** Agent substrate to consolidate. */
  agentId?: string;
  /** Whether to run softening after consolidation. Default: false (handled by decay). */
  run_softening?: boolean;
  /** OpenRouter API key (needed if run_softening is true). */
  openrouter_api_key?: string;
}

/** Detailed report of what happened during consolidation. */
export interface ConsolidationReport {
  candidates_found: number;
  pairs_analyzed: number;
  new_connections: NewConnectionCandidate[];
  connections_strengthened: number;
  engrams_strengthened: number;
  promotions: number;
  beliefs_updated: number;
  duration_ms: number;
  /** Summaries of consolidated engrams for the dreaming module. */
  candidate_summaries: Array<{
    id: string;
    content: string;
    engram_type: string;
    strength: number;
    tags: string[];
  }>;
}

/**
 * Run a full consolidation cycle.
 *
 * This is the structural work of "dreaming": reviewing recent memories,
 * discovering connections, strengthening networks, promoting episodic
 * memories, and forming beliefs.
 *
 * Returns both a ConsolidationResult (for the engine) and a detailed
 * ConsolidationReport (for the dreaming narrative generator).
 */
export async function runConsolidation(
  supabase: SupabaseClient,
  userId: string,
  options: ConsolidationOptions = {}
): Promise<{ result: ConsolidationResult; report: ConsolidationReport }> {
  const { lookback_hours = DEFAULT_LOOKBACK_HOURS } = options;
  const agentId = options.agentId || "luca";
  const startTime = Date.now();

  // 1. Select candidates
  const candidates = await selectCandidates(supabase, userId, agentId, lookback_hours);

  if (candidates.length === 0) {
    const emptyResult: ConsolidationResult = {
      strengthened: 0,
      new_connections: 0,
      beliefs_updated: 0,
      promotions: 0,
      duration_ms: Date.now() - startTime,
    };
    const emptyReport: ConsolidationReport = {
      candidates_found: 0,
      pairs_analyzed: 0,
      new_connections: [],
      connections_strengthened: 0,
      engrams_strengthened: 0,
      promotions: 0,
      beliefs_updated: 0,
      duration_ms: Date.now() - startTime,
      candidate_summaries: [],
    };
    return { result: emptyResult, report: emptyReport };
  }

  // Mark candidates as consolidating
  const candidateIds = candidates.map((e) => e.id);
  await supabase
    .from("engrams")
    .update({ state: "consolidating", updated_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .in("id", candidateIds);

  // 2. Pair analysis — discover new connections
  const newConnections = await analyzePairs(supabase, userId, agentId, candidates);

  // 3. Persist new connections
  const connectionsCreated = await persistNewConnections(supabase, userId, agentId, newConnections);

  // 4. Strengthen co-activated connections
  const connectionsStrengthened = await strengthenConnections(supabase, userId, agentId, candidates);

  // 5. Strengthen well-connected engrams
  const engramsStrengthened = await strengthenEngrams(supabase, agentId, candidates);

  // 6. Promote episodic -> semantic
  const promotions = await promoteEngrams(supabase, candidates);

  // 7. Belief formation
  const beliefsUpdated = await formBeliefs(supabase, userId, agentId);

  // Return candidates to active state
  await supabase
    .from("engrams")
    .update({ state: "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("state", "consolidating");

  const duration = Date.now() - startTime;

  const result: ConsolidationResult = {
    strengthened: engramsStrengthened,
    new_connections: connectionsCreated,
    beliefs_updated: beliefsUpdated,
    promotions,
    duration_ms: duration,
  };

  const report: ConsolidationReport = {
    candidates_found: candidates.length,
    pairs_analyzed: Math.min(candidates.length * (candidates.length - 1) / 2, MAX_PAIRS),
    new_connections: newConnections,
    connections_strengthened: connectionsStrengthened,
    engrams_strengthened: engramsStrengthened,
    promotions,
    beliefs_updated: beliefsUpdated,
    duration_ms: duration,
    candidate_summaries: candidates.map((e) => ({
      id: e.id,
      content: e.content,
      engram_type: e.engram_type,
      strength: e.strength,
      tags: e.tags,
    })),
  };

  return { result, report };
}

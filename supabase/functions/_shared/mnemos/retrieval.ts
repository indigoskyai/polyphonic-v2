/**
 * Mnemos Memory System — Retrieval (Spreading Activation)
 *
 * Implements spreading activation retrieval: seed engrams are found by
 * embedding similarity, then activation spreads through typed connections
 * with per-hop decay. Accessed engrams get their accessibility trace
 * updated (reconsolidation).
 */

import type {
  ActivationResult,
  Connection,
  ConnectionType,
  Engram,
  RetrievalOptions,
} from "./types.ts";

import {
  ACTIVATION_RECENCY_WEIGHT,
  ACTIVATION_RELEVANCE_WEIGHT,
  ACTIVATION_STRENGTH_WEIGHT,
  DEFAULT_MIN_ACTIVATION,
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_SPREAD_DEPTH,
  SPREAD_DECAY_FACTOR,
  STABILITY_GROWTH_FACTOR,
} from "./constants.ts";

import type { MnemosEngine } from "./engine.ts";
import { embedOne, reciprocalRankFusion } from "../embeddings.ts";
import { isMemoryAugmentationEnabled } from "../config.ts";

// ---------------------------------------------------------------------------
// Connection-type spread weights
// ---------------------------------------------------------------------------

/** How much activation passes through each connection type. */
const SPREAD_WEIGHTS: Record<ConnectionType, number> = {
  supports: 1.0,
  contradicts: 0.4,
  causes: 1.0,
  extends: 1.0,
  parallels: 0.7,
  synthesizes: 1.0,
  grounds: 0.8,
};

// ---------------------------------------------------------------------------
// Activation scoring
// ---------------------------------------------------------------------------

/**
 * Compute activation score for a seed engram based on strength, recency,
 * and semantic relevance (similarity score from the database).
 */
function computeSeedActivation(engram: Engram, similarity: number): number {
  const hoursSinceAccess =
    (Date.now() - new Date(engram.last_accessed_at).getTime()) / 3_600_000;

  // Recency decays exponentially — more recent = higher score
  const recency = Math.exp(-0.01 * hoursSinceAccess);

  const activation =
    ACTIVATION_STRENGTH_WEIGHT * engram.strength +
    ACTIVATION_RECENCY_WEIGHT * recency +
    ACTIVATION_RELEVANCE_WEIGHT * similarity;

  return Math.min(1, Math.max(0, activation));
}

// ---------------------------------------------------------------------------
// Core retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve engrams relevant to `query` using spreading activation.
 *
 * 1. Seed — find top-N engrams by embedding similarity (Supabase `match_engrams` RPC)
 * 2. Score — compute activation for each seed
 * 3. Spread — traverse connections, propagating activation with decay
 * 4. Rank & deduplicate — return by descending activation
 * 5. Reconsolidate — update accessibility trace on accessed engrams
 */
export async function retrieve(
  engine: MnemosEngine,
  query: string,
  options: RetrievalOptions = {},
): Promise<ActivationResult[]> {
  const {
    limit = DEFAULT_RETRIEVAL_LIMIT,
    min_activation = DEFAULT_MIN_ACTIVATION,
    engram_types,
    states,
    tags,
    spread_activation = true,
    spread_depth = DEFAULT_SPREAD_DEPTH,
  } = options;

  const supabase = engine.getClient();
  const userId = engine.getUserId();
  const agentId = engine.getAgentId();

  // ── Step 1: Seed via hybrid retrieval (M4) ─────────────────────────────
  // Default: trigram-only via match_engrams (existing behavior).
  // When options.api_key is provided AND memory augmentation is enabled, we
  // also pull vector seeds via match_engrams_vector and RRF-fuse the two
  // ranked lists. Spreading activation continues unchanged from the fused
  // seed set.
  const seedCount = Math.max(limit, 10);
  const seeds = await hybridSeed(supabase, query, userId, agentId, seedCount, options.api_key);

  if (!seeds || seeds.length === 0) {
    return [];
  }

  // ── Step 2: Compute seed activations ───────────────────────────────────
  // Map of engram ID → ActivationResult
  const activationMap = new Map<string, ActivationResult>();

  for (const seed of seeds) {
    const engram = seedToEngram(seed);

    // Apply optional filters
    if (engram_types && !engram_types.includes(engram.engram_type)) continue;
    if (states && !states.includes(engram.state)) continue;
    if (tags && tags.length > 0 && !tags.some((t) => engram.tags.includes(t))) continue;

    const activation = computeSeedActivation(engram, seed.similarity ?? 0);
    if (activation < min_activation) continue;

    activationMap.set(engram.id, {
      engram,
      activation,
      path: "direct",
    });
  }

  // ── Step 3: Spreading activation ───────────────────────────────────────
  if (spread_activation && spread_depth > 0) {
    await spreadActivation(
      supabase,
      userId,
      agentId,
      activationMap,
      spread_depth,
      min_activation,
    );
  }

  // ── Step 4: Rank, filter, and limit ────────────────────────────────────
  const results = Array.from(activationMap.values())
    .filter((r) => r.activation >= min_activation)
    .sort((a, b) => b.activation - a.activation)
    .slice(0, limit);

  // ── Step 5: Reconsolidate — update accessibility trace ─────────────────
  await reconsolidate(supabase, results);

  return results;
}

// ---------------------------------------------------------------------------
// Spreading activation traversal
// ---------------------------------------------------------------------------

/**
 * BFS-style spreading activation across connection graph.
 * Each hop reduces activation by SPREAD_DECAY_FACTOR × connection-type weight.
 * Stops when activation falls below threshold or max depth is reached.
 */
async function spreadActivation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
  supabase: { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any },
  userId: string,
  agentId: string,
  activationMap: Map<string, ActivationResult>,
  maxDepth: number,
  threshold: number,
): Promise<void> {
  // Frontier: engram IDs to spread from, with their current activation
  let frontier: Array<{ id: string; activation: number; chain: ActivationResult["spread_chain"] }> = [];

  // Initialize frontier from direct matches
  for (const [id, result] of activationMap) {
    frontier.push({ id, activation: result.activation, chain: [] });
  }

  for (let depth = 0; depth < maxDepth; depth++) {
    if (frontier.length === 0) break;

    // Collect all frontier IDs for batch query
    const frontierIds = frontier.map((f) => f.id);

    // Fetch outgoing connections from frontier engrams
    const { data: connections, error: connError } = await supabase
      .from("connections")
      .select("id, source_id, target_id, connection_type, weight")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .in("source_id", frontierIds);

    if (connError || !connections || connections.length === 0) break;

    // Fetch incoming connections too (activation spreads bidirectionally)
    const { data: incomingConns } = await supabase
      .from("connections")
      .select("id, source_id, target_id, connection_type, weight")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .in("target_id", frontierIds);

    const allConnections: Connection[] = [
      ...(connections as Connection[]),
      ...(incomingConns as Connection[] ?? []),
    ];

    // Collect target IDs we haven't activated yet
    const newTargetIds = new Set<string>();
    // Map from target ID → best incoming activation info
    const spreadCandidates = new Map<
      string,
      { activation: number; chain: NonNullable<ActivationResult["spread_chain"]> }
    >();

    for (const conn of allConnections) {
      // Determine which end is the "source" in the frontier and which is the "target"
      const frontierItem = frontier.find(
        (f) => f.id === conn.source_id || f.id === conn.target_id,
      );
      if (!frontierItem) continue;

      const neighborId =
        conn.source_id === frontierItem.id ? conn.target_id : conn.source_id;

      // Skip if already activated with a higher score
      const existing = activationMap.get(neighborId);

      const typeWeight = SPREAD_WEIGHTS[conn.connection_type] ?? 0.5;
      const spreadActivationScore =
        frontierItem.activation * SPREAD_DECAY_FACTOR * typeWeight * conn.weight;

      if (spreadActivationScore < threshold) continue;

      if (existing && existing.activation >= spreadActivationScore) continue;

      const chain: NonNullable<ActivationResult["spread_chain"]> = [
        ...(frontierItem.chain ?? []),
        { connection_id: conn.id, connection_type: conn.connection_type },
      ];

      const prev = spreadCandidates.get(neighborId);
      if (!prev || prev.activation < spreadActivationScore) {
        spreadCandidates.set(neighborId, { activation: spreadActivationScore, chain });
        newTargetIds.add(neighborId);
      }
    }

    if (newTargetIds.size === 0) break;

    // Fetch engram data for newly discovered targets
    const targetIdArray = Array.from(newTargetIds);
    const { data: neighborEngrams, error: nErr } = await supabase
      .from("engrams")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .in("id", targetIdArray)
      .neq("state", "archived");

    if (nErr || !neighborEngrams) break;

    // Build next frontier
    const nextFrontier: typeof frontier = [];

    for (const engram of neighborEngrams as Engram[]) {
      const candidate = spreadCandidates.get(engram.id);
      if (!candidate) continue;

      const existing = activationMap.get(engram.id);
      if (existing && existing.activation >= candidate.activation) continue;

      activationMap.set(engram.id, {
        engram,
        activation: candidate.activation,
        path: "spread",
        spread_chain: candidate.chain,
      });

      nextFrontier.push({
        id: engram.id,
        activation: candidate.activation,
        chain: candidate.chain,
      });
    }

    frontier = nextFrontier;
  }
}

// ---------------------------------------------------------------------------
// Reconsolidation — accessing a memory strengthens it
// ---------------------------------------------------------------------------

/**
 * Update accessibility trace for all retrieved engrams.
 * Increments access_count, refreshes last_accessed_at, and applies
 * a small stability boost (successful retrieval = reconsolidation).
 */
async function reconsolidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
  supabase: { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any },
  results: ActivationResult[],
): Promise<void> {
  if (results.length === 0) return;

  const now = new Date().toISOString();

  // Batch update — one query per engram (Supabase doesn't support
  // batch upsert with computed columns easily, so we fire in parallel).
  const updates = results.map((r) => {
    const newStability = Math.min(
      1.0,
      r.engram.stability + STABILITY_GROWTH_FACTOR * (1 - r.engram.stability),
    );
    const newAccessibility = Math.min(1.0, r.engram.accessibility + 0.1);

    return supabase
      .from("engrams")
      .update({
        last_accessed_at: now,
        access_count: r.engram.access_count + 1,
        stability: newStability,
        accessibility: newAccessibility,
        // Move dormant engrams back to active on access
        ...(r.engram.state === "dormant" ? { state: "active" } : {}),
      })
      .eq("id", r.engram.id);
  });

  // Fire all updates concurrently — don't block on individual results
  await Promise.allSettled(updates);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a seed row (from match_engrams RPC) to an Engram shape.
 * The RPC may return columns in a flat structure.
 */
/**
 * Hybrid seed retrieval — fuses trigram similarity (existing match_engrams) with
 * vector cosine similarity (M1's match_engrams_vector RPC) via Reciprocal Rank
 * Fusion. Falls back to trigram-only if no API key is provided or the memory
 * augmentation flag is off.
 *
 * Returns an array of seed rows in match_engrams shape (flat fields including
 * `similarity`). Vector-only hits are hydrated by re-fetching the missing
 * fields with a single `select * where id in (...)` against engrams.
 */
async function hybridSeed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
  supabase: any,
  query: string,
  userId: string,
  agentId: string,
  matchCount: number,
  apiKey?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match_engrams row shape varies
): Promise<any[]> {
  const trigramP = supabase.rpc("match_engrams", {
    query_text: query,
    match_count: matchCount,
    p_user_id: userId,
    p_agent_id: agentId,
  }).then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: { data: any[] | null; error: any }) => ({ rows: r.data ?? [], err: r.error }),
  );

  const vectorP = (async () => {
    if (!apiKey || !isMemoryAugmentationEnabled(userId)) return { rows: [], err: null };
    try {
      const embed = await embedOne(apiKey, query);
      if (!embed || embed.vector.length === 0) return { rows: [], err: null };
      const r = await supabase.rpc("match_engrams_vector", {
        query_embedding: embed.vector,
        match_count: matchCount,
        p_user_id: userId,
        p_agent_id: agentId,
        min_strength: 0.05,
      });
      return { rows: r.data ?? [], err: r.error };
    } catch (err) {
      console.warn("[mnemos.retrieve] vector seed failed (non-fatal):", (err as Error).message);
      return { rows: [], err: null };
    }
  })();

  const [trigramRes, vectorRes] = await Promise.all([trigramP, vectorP]);
  if (trigramRes.err) {
    throw new Error(`Seed retrieval failed: ${trigramRes.err.message}`);
  }

  const trigramRows = trigramRes.rows;
  const vectorRows = vectorRes.rows;

  // No vector hits → return trigram unchanged.
  if (vectorRows.length === 0) return trigramRows;

  // Index trigram rows by id for fusion + hydration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trigramById = new Map<string, any>(trigramRows.map((r: any) => [r.id, r]));

  const fusedIds = reciprocalRankFusion(
    [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ids: trigramRows.map((r: any) => r.id), weight: 0.3 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ids: vectorRows.map((r: any) => r.id), weight: 0.5 },
    ],
    60,
  ).slice(0, matchCount);

  // Hydrate any vector-only ids that don't appear in the trigram set.
  const missingIds = fusedIds.filter((id) => !trigramById.has(id));
  if (missingIds.length > 0) {
    const { data: hydrated, error: hydErr } = await supabase
      .from("engrams")
      .select("id, user_id, agent_id, content, engram_type, strength, stability, accessibility, emotional_valence, emotional_arousal, surprise_score, source_context, tags, state, last_accessed_at, access_count, created_at, updated_at")
      .eq("agent_id", agentId)
      .in("id", missingIds);
    if (hydErr) {
      console.warn("[mnemos.retrieve] vector-only hydration failed:", hydErr.message);
    } else if (hydrated) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of hydrated as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vecRow = vectorRows.find((v: any) => v.id === row.id);
        trigramById.set(row.id, { ...row, similarity: vecRow?.similarity ?? 0.5 });
      }
    }
  }

  // For vector-also hits in the trigram set, blend the similarity score so
  // computeSeedActivation gives weight to vector-found relevance too.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const vRow of vectorRows as any[]) {
    const tRow = trigramById.get(vRow.id);
    if (tRow) {
      const triSim = typeof tRow.similarity === "number" ? tRow.similarity : 0;
      const vecSim = typeof vRow.similarity === "number" ? vRow.similarity : 0;
      tRow.similarity = Math.max(triSim, vecSim);
    }
  }

  // Return rows in fused order, dropping any that hydration couldn't recover.
  return fusedIds.map((id) => trigramById.get(id)).filter(Boolean);
}

function seedToEngram(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC row shape varies
  seed: any,
): Engram {
  return {
    id: seed.id,
    user_id: seed.user_id,
    agent_id: seed.agent_id || "luca",
    content: seed.content,
    engram_type: seed.engram_type,
    strength: seed.strength ?? 0.5,
    stability: seed.stability ?? 0.3,
    accessibility: seed.accessibility ?? 0.5,
    emotional_valence: seed.emotional_valence ?? 0,
    emotional_arousal: seed.emotional_arousal ?? 0,
    surprise_score: seed.surprise_score ?? 0,
    source_context: seed.source_context ?? {},
    tags: seed.tags ?? [],
    state: seed.state ?? "active",
    last_accessed_at: seed.last_accessed_at ?? new Date().toISOString(),
    access_count: seed.access_count ?? 0,
    created_at: seed.created_at ?? new Date().toISOString(),
    updated_at: seed.updated_at ?? new Date().toISOString(),
  };
}

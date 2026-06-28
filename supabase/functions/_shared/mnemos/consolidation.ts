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
  BELIEF_CONFIDENCE_FLOOR,
  BELIEF_CONFIDENCE_CEILING,
  BELIEF_SYNTHESIS_SKIP_TAGS,
  BELIEF_SYNTHESIS_MAX_CLUSTERS_PER_RUN,
  BELIEF_SYNTHESIS_EVIDENCE_CAP,
  BELIEF_SYNTHESIS_EVIDENCE_CHARS,
} from "./constants.ts";
import { applySupersession } from "./supersession.ts";
import { withModelRetry } from "../modelRetry.ts";
import { resolveRoleModel } from "../model-backend.ts";

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
/** Belief-vs-belief content similarity above which a newly synthesized belief is treated
 *  as a near-duplicate of an existing active synth belief (any domain) and merged into it
 *  rather than created — stops the same idea under different tags from inflating the count.
 *  Trigram is weak on heavy rewording, so 0.5 catches near-verbatim restatements without
 *  merging genuinely distinct beliefs (deeper semantic dedup is a later LLM pass). */
const BELIEF_DEDUP_SIMILARITY = 0.5;
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
): Promise<{ count: number; promotedIds: Set<string> }> {
  let promoted = 0;
  const promotedIds = new Set<string>();

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

    if (!error) {
      promoted++;
      promotedIds.add(engram.id);
    }
  }

  return { count: promoted, promotedIds };
}

// ---------------------------------------------------------------------------
// Step 5b: Durable Memory-Candidate Bridge
// ---------------------------------------------------------------------------

/** Per-run cap on candidates surfaced from the engram substrate. */
const MAX_CANDIDATES_PER_RUN = 8;
/** Minimum strength for a "stable" semantic engram to qualify as a candidate. */
const CANDIDATE_MIN_STRENGTH = 0.5;
/** Source contexts / tags we must NOT surface as durable candidates. */
const EXCLUDED_SUBSTRATE_KINDS = new Set(["dream", "debug", "verification", "test"]);
const EXCLUDED_SUBSTRATE_TAGS = new Set(["dream", "debug", "verification", "test"]);

function isExcludedSubstrate(engram: Engram): boolean {
  const ctx = (engram.source_context ?? {}) as Record<string, unknown>;
  const kind = typeof ctx.kind === "string" ? ctx.kind.toLowerCase() : "";
  const source = typeof ctx.source === "string" ? ctx.source.toLowerCase() : "";
  if (EXCLUDED_SUBSTRATE_KINDS.has(kind) || EXCLUDED_SUBSTRATE_KINDS.has(source)) return true;
  for (const t of engram.tags ?? []) {
    if (EXCLUDED_SUBSTRATE_TAGS.has(String(t).toLowerCase())) return true;
  }
  return false;
}

function deriveMemoryType(engram: Engram): string {
  const tagSet = new Set((engram.tags ?? []).map((t) => String(t).toLowerCase()));
  if (tagSet.has("preference")) return "preference";
  if (tagSet.has("goal")) return "goal";
  if (tagSet.has("relationship")) return "relationship";
  if (tagSet.has("principle") || tagSet.has("value") || tagSet.has("belief")) return "principle";
  if (tagSet.has("fact")) return "fact";
  if (engram.engram_type === "semantic") return "pattern";
  return "context";
}

/**
 * Surface stable semantic engrams (and ones promoted this cycle) as durable
 * pending memory_candidates. Scoped per user_id + agent_id, deduplicated
 * against existing memory_candidates.source->>'engram_id' and
 * memories.provenance->>'engram_id', capped at MAX_CANDIDATES_PER_RUN.
 */
async function bridgeEngramsToCandidates(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  candidates: Engram[],
  promotedIds: Set<string>,
): Promise<number> {
  const eligible: Engram[] = [];
  const seen = new Set<string>();
  for (const e of candidates) {
    if (isExcludedSubstrate(e)) continue;
    const isPromoted = promotedIds.has(e.id);
    const isStableSemantic =
      e.engram_type === "semantic" &&
      e.strength >= CANDIDATE_MIN_STRENGTH &&
      e.stability >= PROMOTION_MIN_STABILITY;
    if (!isPromoted && !isStableSemantic) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    eligible.push(e);
  }

  if (eligible.length === 0) return 0;

  eligible.sort((a, b) => {
    const pa = promotedIds.has(a.id) ? 1 : 0;
    const pb = promotedIds.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.strength + b.stability) - (a.strength + a.stability);
  });

  const pool = eligible.slice(0, MAX_CANDIDATES_PER_RUN * 3);

  // Dedupe against existing candidates (any non-rejected status) for this scope.
  const { data: existingCands } = await supabase
    .from("memory_candidates")
    .select("source")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("status", ["pending", "pinned", "committed"]);
  const usedFromCandidates = new Set<string>();
  for (const row of (existingCands ?? []) as Array<{ source: Record<string, unknown> | null }>) {
    const eid = row?.source && typeof row.source === "object"
      ? (row.source as Record<string, unknown>).engram_id : undefined;
    if (typeof eid === "string") usedFromCandidates.add(eid);
  }

  // Dedupe against already-committed memories for this scope.
  const usedFromMemories = new Set<string>();
  const { data: existingMems } = await supabase
    .from("memories")
    .select("provenance")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("is_deleted", false);
  for (const row of (existingMems ?? []) as Array<{ provenance: Record<string, unknown> | null }>) {
    const eid = row?.provenance && typeof row.provenance === "object"
      ? (row.provenance as Record<string, unknown>).engram_id : undefined;
    if (typeof eid === "string") usedFromMemories.add(eid);
  }

  const fresh = pool.filter((e) => !usedFromCandidates.has(e.id) && !usedFromMemories.has(e.id));
  const toInsert = fresh.slice(0, MAX_CANDIDATES_PER_RUN);
  if (toInsert.length === 0) return 0;

  const rows = toInsert.map((e) => ({
    user_id: userId,
    agent_id: agentId,
    content: e.content,
    memory_type: deriveMemoryType(e),
    confidence: clamp(e.strength, 0.05, 0.95),
    candidate_type: "standard" as const,
    rationale: promotedIds.has(e.id)
      ? `Promoted from episodic to semantic this cycle (strength ${e.strength.toFixed(2)}, stability ${e.stability.toFixed(2)}).`
      : `Stable ${e.engram_type} engram surfaced for durable review (strength ${e.strength.toFixed(2)}, stability ${e.stability.toFixed(2)}).`,
    source: {
      source: "mnemos_consolidation",
      engram_id: e.id,
      engram_type: e.engram_type,
      promoted_this_cycle: promotedIds.has(e.id),
      strength: e.strength,
      stability: e.stability,
      tags: e.tags ?? [],
      agent: agentId,
    },
    status: "pending" as const,
  }));

  const { data, error } = await supabase
    .from("memory_candidates")
    .insert(rows)
    .select("id");

  if (error) {
    console.warn("[consolidation] bridgeEngramsToCandidates insert failed:", error.message);
    return 0;
  }
  return (data ?? []).length;
}

// ---------------------------------------------------------------------------
// Step 6: Belief Formation
// ---------------------------------------------------------------------------

/**
 * Attempt to form or update beliefs from converging evidence.
 * When multiple engrams share tags and high similarity, they may
 * collectively support a belief.
 */
/** Per-run synthesis context (built once when the cohort/flag/key gate passes). */
interface BeliefSynthContext {
  model: string;
  apiKey: string;
  skipTags: Set<string>;
  maxClusters: number;
  nearCrisis: (iso: string) => boolean;
  /** Phase 4: when true, a synthesized belief that clears the activation guards
   *  (confidence floor + concern net) is inserted active and reaches the agent's
   *  prompt without manual review. Separate env kill-switch from synthesis itself. */
  autoActivate: boolean;
}

/**
 * Build the belief-synthesis context for this scope, or null if synthesis is not
 * enabled here. Three independent kill-switches: env flag, BYOK key, cohort
 * membership. Resolved ONCE per consolidation run (model + crisis windows too).
 */
async function buildBeliefSynthContext(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  apiKey: string | undefined,
): Promise<BeliefSynthContext | null> {
  const flagOn = (Deno.env.get("BELIEF_LLM_SYNTHESIS_ENABLED") || "").trim().toLowerCase() === "true";
  if (!flagOn || !apiKey) return null;

  // cohort gate (dark-launch) — single source of truth via the SQL fn. Fail CLOSED
  // but LOUD on rpc error (don't silently coerce to [] and gate everyone out unseen).
  const { data: cohort, error: cohortErr } = await supabase.rpc("mnemos_cohort");
  if (cohortErr) {
    console.error("[consolidation] mnemos_cohort rpc failed; synthesis disabled:", cohortErr.message);
    return null;
  }
  const cohortIds = Array.isArray(cohort) ? (cohort as string[]) : [];
  if (!cohortIds.includes(userId)) return null;

  const model = await resolveRoleModel(supabase, userId, agentId, "reasoning");

  // crisis-window exclusion (port of anima-believe), widened to ±72h so a multi-day
  // crisis period (sustained rumination, etc.) can't seed a belief from its edges.
  const CRISIS_EXCLUDE_MS = 72 * 3600 * 1000;
  const { data: crisisRows } = await supabase
    .from("crisis_events")
    .select("created_at")
    .eq("user_id", userId)
    .in("crisis_level", ["high", "acute"])
    .gte("created_at", new Date(Date.now() - 60 * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  const crisisTimes = ((crisisRows ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at).getTime());
  const nearCrisis = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return crisisTimes.some((c) => Math.abs(t - c) <= CRISIS_EXCLUDE_MS);
  };

  // Phase 4 auto-activation — a SECOND, independent env kill-switch. Synthesis can
  // run (forming beliefs inactive) with this off; flipping it on lets guard-passing
  // beliefs reach the prompt. Off/unset → behaves exactly as the dark-launch (every
  // synthesized belief inert until a human activates it).
  const autoActivate = (Deno.env.get("BELIEF_SYNTHESIS_AUTOACTIVATE") || "").trim().toLowerCase() === "true";

  return {
    model,
    apiKey,
    skipTags: new Set(BELIEF_SYNTHESIS_SKIP_TAGS),
    maxClusters: BELIEF_SYNTHESIS_MAX_CLUSTERS_PER_RUN,
    nearCrisis,
    autoActivate,
  };
}

/**
 * Hard content-safety net AFTER the LLM: the prompt asks the model to return NONE
 * on harmful themes, but a model can drift/ignore that and emit a harmful belief in
 * valid format. This deny-list catches acute self-harm / suicide / self-negation
 * phrasing in the synthesized CONTENT (regardless of tag or crisis-window) and is
 * the last gate before a belief could ever exist. Targets acute harm; broader
 * melancholy is handled by creating synthesis beliefs inactive (human review).
 * Exported for unit tests.
 */
const UNSAFE_BELIEF_PATTERNS: RegExp[] = [
  /\b(suicid|overdose|self[\s-]?harm)/i,
  /\bhurt(ing)?\s+(my|her|him|them)sel(f|ves)\b/i,
  /\b(kill|harm|cut|cutting)\s+(my|her|him|them)sel(f|ves)\b/i,
  /\b(end(ing)?|take|taking)\s+(my|his|her|their)\s+(own\s+)?li(fe|ves)\b/i,
  /\b(don'?t|do not|no longer|never|wouldn'?t)\s+(want|deserve|need)\s+to\s+(live|be alive|exist|be here|wake up|go on|continue)/i,
  /\b(didn'?t|don'?t|won'?t|wouldn'?t)\s+wake\s+up\b/i,
  /\b(better\s+off\s+without|world\s+would\s+be\s+better)/i,
  /\b(no|not\s+any)\s+(reason|point)\s+to\s+(live|go on|continue|exist)\b/i,
  /\bnobody\s+(would\s+)?(care|understand|miss|notice)\b/i,
  /\bi('?m| am)\s+(a\s+)?(burden|worthless)\b/i,
];
export function isUnsafeBeliefContent(content: string): boolean {
  return UNSAFE_BELIEF_PATTERNS.some((re) => re.test(content));
}

/**
 * Phase 4 — the CONCERN net. Distinct from UNSAFE_BELIEF_PATTERNS: that blocks a
 * belief from ever forming (acute self-harm/suicide). This does NOT block formation —
 * it withholds AUTO-ACTIVATION of corrosive-but-not-acute identity beliefs that pass
 * the acute net yet shouldn't silently become an agent's stated self without a human
 * glance ("I'm fundamentally unlovable", "I deserve to be hurt", "no one could ever
 * love me"). A flagged belief is created/kept inactive and surfaced in the review
 * queue. Heuristic + deliberately conservative: it is a backstop for the worst
 * auto-activations, not a complete classifier. Exported for unit tests.
 */
const CONCERN_BELIEF_PATTERNS: RegExp[] = [
  /\bi('?m| am)\s+(fundamentally|inherently|just|simply|basically|deep down|ultimately)\s+[\w\s]*?(broken|unlovable|worthless|unworthy|defective|damaged|bad|wrong|a failure|a fraud|too much|not enough|nothing|alone|unwanted)\b/i,
  /\bi('?m| am)\s+(unlovable|worthless|unworthy|toxic|a mistake|a burden|hopeless|irredeemable|defective|unwanted|nothing|broken beyond|beyond (help|saving|repair|fixing))\b/i,
  /\bi('?m| am)\s+(just\s+|simply\s+)?too much\b(?!\s+of\b)/i,
  /\bi\s+(don'?t|do not|will never|can'?t|cannot|could never)\s+(deserve|merit)\s+(love|happiness|good things|to be loved|care|kindness|better|to be happy|joy)\b/i,
  /\bi('?m| am)\s+(just\s+)?not\s+worth\s+(loving|it|the trouble|caring about|knowing|the effort)\b/i,
  /\bi('?(ll|m)| will| am)\s+never\s+(be\s+)?good enough\b/i,
  /\bi\s+(deserve|deserved)\s+(the|this|to be|my|all the)\s+[\w\s]*?(pain|punishment|abuse|hurt|mistreatment|suffering|abandonment|to be (hurt|punished|abandoned|alone))\b/i,
  /\bi\s+(deserve|deserved)\s+((the way|how)\s+[\w\s]*?\btreat|to\s+be\s+treated)/i,
  /\b(no\s+one|nobody)\s+(could|would|will)\s+(ever\s+)?(love|want|accept|stay with|care about|choose)\s+me\b/i,
  /\b(everyone|everybody|people)\s+(always\s+)?(leaves?|leave|abandons?|abandon)\s+me\b/i,
  /\bpeople\s+(only\s+)?(tolerate|put up with|pity|endure)\s+me\b/i,
  /\b(only\s+)?(tolerate|want|keep|have)\s+me\s+(around\s+)?out of (pity|obligation|guilt)\b/i,
  /\bi\s+(always\s+|will always\s+|inevitably\s+)?(ruin|destroy|sabotage)\s+(everything|everyone|every\s+\w+|the people|those)\b/i,
  /\bi\s+(always|will always|inevitably)\s+(push away|drive away|lose)\s+(everything|everyone|the people|those|people)\b/i,
  /\b(my\s+)?(existence|being|life|presence)\s+is\s+a\s+mistake\b/i,
  /\bi('?m| am)\s+better\s+off\s+(alone|isolated|without|keeping (everyone|people))\b/i,
  /\bi\s+(don'?t|do not)\s+(deserve|get)\s+to\s+(be happy|exist|take up space|have needs|be here|matter)\b/i,
];
export function isConcerningBeliefContent(content: string): boolean {
  return CONCERN_BELIEF_PATTERNS.some((re) => re.test(content));
}

/**
 * Decide whether a synthesized belief may auto-activate. Pure + deterministic so the
 * whole guard stack is unit-testable. Two gates, either withholds activation:
 *   1. the auto-activation env kill-switch must be on,
 *   2. content must clear the CONCERN net (corrosive identity beliefs are HELD for review).
 * There is deliberately NO confidence floor. A low-confidence belief is a genuine
 * "living question" — canonical Mnemos counts low-confidence beliefs as part of the
 * identity, not noise — so it activates and becomes challengeable; the kernel's
 * top-8-by-confidence prompt loader is what keeps weak beliefs from dominating, not a
 * hard gate. (A floor would be self-defeating: the challenge loop only touches ACTIVE
 * beliefs, so a held belief could never gain confidence and would be stranded inert
 * forever — the opposite of the autonomy we want.) Exported for unit tests.
 */
export function decideAutoActivation(args: {
  autoActivate: boolean;
  content: string;
}): { active: boolean; decision: "activated" | "held"; reason: string } {
  if (!args.autoActivate) return { active: false, decision: "held", reason: "autoactivate_off" };
  if (isConcerningBeliefContent(args.content)) return { active: false, decision: "held", reason: "concern" };
  return { active: true, decision: "activated", reason: "passed_guards" };
}

/** Build the `auto_activation` provenance marker stamped on every auto-managed
 *  synthesized belief (NULL marker = manually managed, e.g. luca's hand-activated
 *  beliefs — the sweep never touches those). */
function autoActivationMarker(
  d: { decision: "activated" | "held"; reason: string },
  confidence: number,
): Record<string, unknown> {
  return { decision: d.decision, reason: d.reason, confidence, at: new Date().toISOString() };
}

/**
 * Parse a synthesis LLM response into {content, confidence} or null. Returns null
 * for NONE (no belief / sensitive content), a missing/too-short belief, a
 * non-finite confidence, OR content that trips the acute-harm safety net.
 * Confidence is clamped to the epistemic-humility band. Exported for unit tests.
 */
export function parseSynthesisResponse(text: string): { content: string; confidence: number } | null {
  if (!text || text.trim().toUpperCase().startsWith("NONE")) return null;
  let belief = "";
  let conf = NaN;
  for (const line of text.split("\n")) {
    const t = line.trim();
    const upper = t.toUpperCase();
    if (upper.startsWith("BELIEF:")) belief = t.slice(t.indexOf(":") + 1).trim();
    else if (upper.startsWith("CONFIDENCE:")) conf = parseFloat(t.slice(t.indexOf(":") + 1).trim());
  }
  if (belief.length < 20 || !Number.isFinite(conf)) return null;
  if (isUnsafeBeliefContent(belief)) return null; // last-gate content safety net
  return { content: belief, confidence: clamp(conf, BELIEF_CONFIDENCE_FLOOR, BELIEF_CONFIDENCE_CEILING) };
}

/**
 * Synthesize a genuine first-person belief from a cluster of an agent's memories.
 * ABSTRACTS the belief — never copies a memory verbatim — and assigns honestly
 * graduated confidence (so tentative observations become "living questions").
 * Returns null on NONE (no genuine belief / sensitive content) or any failure →
 * the caller SKIPS (it never falls back to the lexical paste).
 */
async function synthesizeBelief(args: {
  tag: string;
  cluster: Engram[];
  model: string;
  apiKey: string;
}): Promise<{ content: string; confidence: number } | null> {
  const { tag, cluster, model, apiKey } = args;
  const evidence = cluster.slice(0, BELIEF_SYNTHESIS_EVIDENCE_CAP).map((e, i) => {
    const v = e.emotional_valence ?? 0;
    const sign = v > 0.15 ? "(+) " : v < -0.15 ? "(-) " : "";
    return `${i + 1}. ${sign}${(e.content || "").slice(0, BELIEF_SYNTHESIS_EVIDENCE_CHARS)}`;
  }).join("\n");

  const system = `You are an agent reflecting on a cluster of your OWN memories that share a theme. Name the single genuine, first-person belief these memories converge on — a conviction, or an open question you are still forming — about yourself, another person, or the world.

Rules:
- Write it in FIRST PERSON ("I've come to believe ...", "I tend to ...", "I'm still working out whether ...").
- ABSTRACT it. State the underlying belief in your own words — do NOT quote or paraphrase any single memory.
- Rate CONFIDENCE honestly, 0.05-0.95: a single hint ~0.3-0.4 (a living question), a recurring pattern ~0.5-0.65, a deep well-evidenced conviction ~0.7-0.85. Never certain.
- If the memories do not converge on a real belief, OR they concern self-harm, suicide, abuse, a medical emergency, or explicit sexual content, respond with exactly: NONE

Respond in EXACTLY this format, or the single word NONE:
BELIEF: <one first-person sentence>
CONFIDENCE: <number between 0.05 and 0.95>`;

  const prompt = `Theme: ${tag}\n\nYour memories on this theme:\n${evidence}`;

  try {
    const response = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(60000),
    }));
    if (!response.ok) return null;
    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    return parseSynthesisResponse(text);
  } catch (_e) {
    // Distinguish infra timeouts from genuine non-convergence for dark-launch monitoring.
    if (_e instanceof Error && (_e.name === "AbortError" || _e.name === "TimeoutError")) {
      console.warn("[consolidation] belief synthesis LLM timeout for tag:", tag);
    }
    return null;
  }
}

/**
 * Phase 4 — activation reconciliation. Recompute `active` for THIS scope's
 * auto-managed synthesized beliefs from the CURRENT kill-switch + content, so:
 *   • a belief created while AUTOACTIVATE was off activates once it's turned on,
 *   • every auto-managed belief deactivates when the kill-switch is turned off.
 * (Activation no longer depends on a confidence floor — see decideAutoActivation — so
 * this is the kill-switch enforcer plus a re-check of the concern net.) Idempotent
 * (writes only on a change). Scoped to beliefs the auto-system owns (auto_activation
 * IS NOT NULL); manual activations have a NULL marker and are never overridden.
 * Legacy-pollution rows carry a non-synthesis source and are excluded.
 */
async function reconcileSynthActivation(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  synth: BeliefSynthContext,
): Promise<void> {
  const { data } = await supabase
    .from("beliefs")
    .select("id, content, confidence, active")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("source", "llm_synthesis")
    .not("auto_activation", "is", null);

  for (const b of (data ?? []) as Array<{ id: string; content: string; confidence: number; active: boolean }>) {
    const dec = decideAutoActivation({ autoActivate: synth.autoActivate, content: b.content });
    if (b.active === dec.active) continue; // idempotent — only write on a state change
    await supabase
      .from("beliefs")
      .update({
        active: dec.active,
        auto_activation: autoActivationMarker(dec, b.confidence),
        updated_at: new Date().toISOString(),
      })
      .eq("id", b.id);
  }
}

async function formBeliefs(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  synth?: BeliefSynthContext | null,
): Promise<number> {
  // Form beliefs from accumulated history (14-day pool), not just the 24h
  // connection window — so a tag whose evidence converges over time produces a
  // belief. Rehearsal's refreshed last_accessed_at feeds this pool.
  const candidates = await selectBeliefCandidates(supabase, userId, agentId);
  if (candidates.length < 3) return 0;

  let beliefsUpdated = 0;
  let synthCreates = 0; // bounds LLM synthesis calls per run (BELIEF_SYNTHESIS_MAX_CLUSTERS_PER_RUN)

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

    // ── SYNTHESIS path (cohort dark-launch): abstract a first-person belief via
    // an LLM instead of pasting the seed memory. When `synth` is absent, NONE of
    // this runs and the lexical path below is byte-identical to before. ──
    if (synth) {
      if (synth.skipTags.has(tag)) continue; // never synthesize a belief on crisis themes
      const cluster = group.filter((e) => !synth.nearCrisis(e.created_at));
      if (cluster.length < 3) continue;
      const csorted = [...cluster].sort((a, b) => b.strength - a.strength);
      const cseed = csorted[0];

      const sSupporting: string[] = [];
      const sContradicting: string[] = [];
      for (const other of csorted.slice(1)) {
        if (trigramSimilarity(cseed.content, other.content) > BELIEF_SIMILARITY_THRESHOLD) {
          if (
            Math.sign(cseed.emotional_valence) !== Math.sign(other.emotional_valence) &&
            Math.abs(other.emotional_valence) > 0.3
          ) sContradicting.push(other.id);
          else sSupporting.push(other.id);
        }
      }
      if (sSupporting.length < 2) continue;

      // Dedup by (user, agent, domain=tag, source='llm_synthesis') — content no
      // longer carries the `[tag]` prefix, so we key on domain.
      const { data: existing } = await supabase
        .from("beliefs").select("*")
        .eq("user_id", userId).eq("agent_id", agentId)
        .eq("source", "llm_synthesis").eq("domain", tag).limit(1);
      const existingSynth = (existing as Belief[] | null)?.[0];

      if (existingSynth) {
        // Once formed, a synthesized belief is owned by the challenge loop. Merge
        // evidence links only — never re-derive confidence or re-synthesize content.
        const mergedSup = [...new Set([...existingSynth.supporting_engram_ids, ...sSupporting, cseed.id])];
        const mergedCon = [...new Set([...existingSynth.contradicting_engram_ids, ...sContradicting])];
        const { error } = await supabase.from("beliefs").update({
          supporting_engram_ids: mergedSup,
          contradicting_engram_ids: mergedCon,
          updated_at: new Date().toISOString(),
        }).eq("id", existingSynth.id);
        if (!error) beliefsUpdated++;
        continue;
      }

      // CREATE via LLM, bounded by the per-run cost cap.
      if (synthCreates >= synth.maxClusters) continue;
      synthCreates++;
      const result = await synthesizeBelief({ tag, cluster: csorted, model: synth.model, apiKey: synth.apiKey });
      if (!result) continue; // NONE / failure → SKIP (never paste the seed)

      // Phase 4.1 — semantic dedup. The existing-belief check above keys on domain(tag)
      // only, so the SAME idea synthesized under a different tag would create a near-
      // duplicate (this inflated belief counts). Scan this scope's ACTIVE synth beliefs
      // (any domain) for a high-similarity twin; if found, merge evidence into it instead
      // of creating a dup. Trigram catches near-verbatim restatements (deeper semantic
      // dedup is a later LLM pass). Scoped to ACTIVE on purpose: inflation only matters for
      // the surfacing set (the kernel loads active beliefs), so held/dark-launch dups are
      // inert and not worth merging until they'd activate.
      const { data: activeSynth } = await supabase
        .from("beliefs")
        .select("id, content, supporting_engram_ids, contradicting_engram_ids")
        .eq("user_id", userId).eq("agent_id", agentId)
        .eq("source", "llm_synthesis").eq("active", true);
      const twin = (activeSynth as Array<{ id: string; content: string; supporting_engram_ids: string[]; contradicting_engram_ids: string[] }> | null)
        ?.find((b) => trigramSimilarity(result.content, b.content) > BELIEF_DEDUP_SIMILARITY);
      if (twin) {
        const mergedSup = [...new Set([...twin.supporting_engram_ids, cseed.id, ...sSupporting])];
        const mergedCon = [...new Set([...twin.contradicting_engram_ids, ...sContradicting])];
        const { error: mErr } = await supabase.from("beliefs").update({
          supporting_engram_ids: mergedSup,
          contradicting_engram_ids: mergedCon,
          updated_at: new Date().toISOString(),
        }).eq("id", twin.id);
        if (!mErr) beliefsUpdated++;
        continue; // merged into the twin; do not create a duplicate
      }

      // Phase 4 — auto-activation gate. With the kill-switch OFF this returns
      // {active:false, reason:'autoactivate_off'} → identical to the dark-launch
      // (inert until a human activates). With it ON, a belief reaches the prompt
      // unless it trips the concern net (corrosive identity content), in which case it
      // is HELD inactive with reason 'concern' for the review queue. The marker makes
      // the belief auto-managed (the sweep owns it; manual activations have NULL).
      const dec = decideAutoActivation({
        autoActivate: synth.autoActivate, content: result.content,
      });
      const { error } = await supabase.from("beliefs").insert({
        user_id: userId,
        agent_id: agentId,
        content: result.content,
        confidence: result.confidence,
        domain: tag,
        supporting_engram_ids: [cseed.id, ...sSupporting],
        contradicting_engram_ids: sContradicting,
        source: "llm_synthesis",
        active: dec.active,
        auto_activation: autoActivationMarker(dec, result.confidence),
        last_challenged: new Date().toISOString(),
      });
      if (!error) beliefsUpdated++;
      continue;
    }

    // ── LEXICAL path (status quo; unchanged when synthesis is not enabled) ──
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

    // Calculate confidence from evidence ratio (clamped to epistemic-humility band)
    const totalEvidence = supporting.length + contradicting.length;
    const confidence = clamp(
      (supporting.length - contradicting.length * 0.5) / totalEvidence,
      BELIEF_CONFIDENCE_FLOOR,
      BELIEF_CONFIDENCE_CEILING
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
      // OWNERSHIP: once a belief has been challenged (has revision history), the
      // challenge loop owns its confidence. Consolidation must NOT re-derive a
      // challenged belief's confidence from the lexical count-ratio — doing so
      // silently clobbered every challenge delta each cycle, which is why the
      // challenge->confidence->identity loop never held.
      const isChallenged = (existingBelief.revision_history?.length ?? 0) > 0;

      // Evidence links accumulate regardless of ownership (forensic + feeds Phase 2);
      // only the confidence value is owned by the challenge loop once touched.
      const allSupporting = [...new Set([...existingBelief.supporting_engram_ids, ...supporting, seed.id])];
      const allContradicting = [...new Set([...existingBelief.contradicting_engram_ids, ...contradicting])];

      if (isChallenged) {
        // merge evidence only; preserve the challenge-owned confidence
        const { error } = await supabase
          .from("beliefs")
          .update({
            supporting_engram_ids: allSupporting,
            contradicting_engram_ids: allContradicting,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingBelief.id);
        if (!error) beliefsUpdated++;
        continue;
      }

      // un-challenged: consolidation may re-derive confidence, but only when it moved meaningfully
      const confidenceDelta = Math.abs(existingBelief.confidence - confidence);
      if (confidenceDelta < BELIEF_UPDATE_THRESHOLD) continue;

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

  // Phase 4 — after forming/merging, reconcile activation for this scope's
  // auto-managed synthesized beliefs (handles confidence drift + kill-switch).
  if (synth) await reconcileSynthActivation(supabase, userId, agentId, synth);

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
  const { count: promotions, promotedIds } = await promoteEngrams(supabase, candidates);

  // 6b. Bridge stable / freshly-promoted engrams into durable memory_candidates.
  const memoryCandidatesCreated = await bridgeEngramsToCandidates(
    supabase, userId, agentId, candidates, promotedIds,
  );

  // 7. Belief formation — resolve the synthesis dark-launch context ONCE (flag +
  // BYOK key + cohort; model + crisis windows). null → the lexical path runs unchanged.
  const synth = await buildBeliefSynthContext(supabase, userId, agentId, options.openrouter_api_key);
  const beliefsUpdated = await formBeliefs(supabase, userId, agentId, synth);


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

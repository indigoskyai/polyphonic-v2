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
  BeliefSynthesisReport,
  ConsolidationBeliefInsight,
  ConsolidationConnectionInsight,
  ConsolidationEngramInsight,
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

/** Maximum co-occurrence edges to send to the classifier in one consolidation run. */
const CONNECTION_CLASSIFIER_BATCH = 24;

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
const INSIGHT_TEXT_CHARS = 220;
const INSIGHT_LIMIT = 5;
const DURABLE_CANDIDATE_MIN_CONFIDENCE = 0.48;
const DURABLE_CANDIDATE_MAX_PER_RUN = 8;
const DURABLE_CANDIDATE_SKIP_TAGS = new Set([
  "dream",
  "verification",
  "test",
  "inner-life",
  "mnemos-verify",
  "debug",
  "big-five",
  "big_five",
  "bigfive",
  "deep-analysis",
  "deep_analysis",
  "deepanalysis",
  "ocean",
  "psychometric",
  "psychometrics",
  "personality-analysis",
  "personality_analysis",
  "trait-analysis",
  "trait_analysis",
  "shadow-analysis",
  "shadow_analysis",
  "profile-analysis",
  "profile_analysis",
]);
const DURABLE_CANDIDATE_TAG_ALLOWLIST = new Set([
  "preference",
  "relationship",
  "relational",
  "identity",
  "goal",
  "principle",
  "project",
  "work-patterns",
  "continuity",
  "profile",
  "context",
  "value",
  "values",
  "belief",
  "fact",
  "fandom",
  "self-understanding",
  "quiz",
  "reflection",
]);
const TRANSCRIPT_MARKER_RE = /\b(User|Assistant|Human|AI|System)\s*:/i;
const SPEAKER_LINE_RE = /^\s*(User|Assistant|Human|AI|System|Tara|Riley|Luca|Quill)\s*:/gim;
const EXPLICIT_DURABLE_CANDIDATE_RE = /\b(sex|sexual|sexually|sexy|nsfw|erotic|erotica|porn|pornographic|roleplay|rp|hips?|straddl\w*|thighs?|grind(?:ing)?|aroused|arousal|horny|kink|fetish|nude|naked|topless|nipples?|breasts?|boobs?|genital\w*|penis|vagina|clitoris|anus|moan\w*|orgasm|climax|cock|dick|pussy|cum(?:ming|shot)?|blowjob|handjob|hard[-\s]?on)\b/i;
const STORMLIGHT_ORDER_RE = /\b(Edgedancer|Windrunner|Lightweaver|Elsecaller|Truthwatcher|Willshaper|Skybreaker|Dustbringer|Stoneward|Bondsmith)\b/i;

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

function compactInsightText(value: string | null | undefined, limit = INSIGHT_TEXT_CHARS): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

export function inferDurableCandidateMemoryType(engram: Pick<Engram, "tags" | "source_context">): string {
  const tags = new Set((engram.tags ?? []).map((tag) => tag.toLowerCase()));
  if (["relationship", "relational", "trust", "friendship", "person"].some((tag) => tags.has(tag))) {
    return "relationship";
  }
  if (["preference", "style", "work-patterns", "schedule"].some((tag) => tags.has(tag))) {
    return "preference";
  }
  if (["goal", "project", "objective"].some((tag) => tags.has(tag))) {
    return "goal";
  }
  if (["principle", "value", "values"].some((tag) => tags.has(tag))) {
    return "principle";
  }
  if (["fact", "profile", "identity", "context"].some((tag) => tags.has(tag))) {
    return "context";
  }
  if (["fandom", "self-understanding", "quiz", "reflection"].some((tag) => tags.has(tag))) {
    return "context";
  }

  const sourceType = typeof engram.source_context?.type === "string"
    ? engram.source_context.type.toLowerCase()
    : "";
  if (sourceType.includes("profile")) return "context";
  if (sourceType.includes("hypomnema")) return "pattern";
  return "pattern";
}

export function computeDurableCandidateConfidence(
  engram: Pick<Engram, "strength" | "stability" | "access_count" | "surprise_score" | "emotional_arousal">
): number {
  const accessScore = Math.min(engram.access_count, 10) / 10;
  const confidence =
    0.2 +
    (Number(engram.strength ?? 0) * 0.25) +
    (Number(engram.stability ?? 0) * 0.35) +
    (accessScore * 0.15) +
    (Math.max(Number(engram.surprise_score ?? 0), Number(engram.emotional_arousal ?? 0)) * 0.05);
  return clamp(confidence, DURABLE_CANDIDATE_MIN_CONFIDENCE, 0.92);
}

function durableCandidateKind(engram: Engram, confidence: number): "pin" | "standard" {
  const tags = new Set((engram.tags ?? []).map((tag) => tag.toLowerCase()));
  if (confidence >= 0.78) return "pin";
  if (["foundational", "identity", "preference", "relationship", "principle"].some((tag) => tags.has(tag))) {
    return "pin";
  }
  return "standard";
}

function normalizedTags(engram: Pick<Engram, "tags">): Set<string> {
  return new Set((engram.tags ?? []).map((tag) => tag.toLowerCase().trim()).filter(Boolean));
}

function hasDurableCandidateTag(tags: Set<string>): boolean {
  for (const tag of tags) {
    if (DURABLE_CANDIDATE_TAG_ALLOWLIST.has(tag)) return true;
  }
  return false;
}

function hasOnlyConversationTags(tags: Set<string>): boolean {
  return tags.size > 0 && [...tags].every((tag) => tag === "conversation");
}

function isBlockedDurableCandidateContent(content: string): boolean {
  return EXPLICIT_DURABLE_CANDIDATE_RE.test(content);
}

function hasTranscriptShape(content: string): boolean {
  const speakerMatches = content.match(SPEAKER_LINE_RE) ?? [];
  return TRANSCRIPT_MARKER_RE.test(content) || speakerMatches.length >= 2;
}

function hasDistilledCandidateShape(content: string): boolean {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length >= 20 && text.length <= 600 && !hasTranscriptShape(text) && !isBlockedDurableCandidateContent(text);
}

function sourceTypeFor(engram: Pick<Engram, "source_context">): string {
  const context = engram.source_context ?? {};
  const parts = ["type", "source", "kind"]
    .map((key) => context[key])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return parts.join(" ");
}

function shouldSkipDurableCandidate(engram: Engram): boolean {
  const tags = normalizedTags(engram);
  if ([...DURABLE_CANDIDATE_SKIP_TAGS].some((tag) => tags.has(tag))) return true;
  const sourceType = sourceTypeFor(engram);
  return sourceType.includes("dream")
    || sourceType.includes("mnemos_verify")
    || sourceType.includes("deep-analysis")
    || sourceType.includes("big_five")
    || sourceType.includes("psychometric");
}

interface DurableCandidateDraft {
  content: string;
  memoryType: string;
  tags: string[];
  rationale: string;
  distilled: boolean;
}

function capitalizeOrder(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function distillConversationOnlyCandidate(engram: Engram): DurableCandidateDraft | null {
  const content = (engram.content || "").replace(/\s+/g, " ").trim();
  if (!content || isBlockedDurableCandidateContent(content)) return null;

  const order = content.match(STORMLIGHT_ORDER_RE)?.[1];
  if (order && /\b(stormlight|knights radiant|radiant quiz|radiant)\b/i.test(content)) {
    return {
      content: `The user and this agent shared a meaningful Stormlight/Knights Radiant quiz moment; the result centered on ${capitalizeOrder(order)} and landed positively.`,
      memoryType: "context",
      tags: ["fandom", "self-understanding", "quiz", "profile", "context"],
      rationale: "Distilled by Mnemos from a salient quiz/self-understanding exchange.",
      distilled: true,
    };
  }

  if (/\bcognitive linguist\b/i.test(content) && /\b(llms?|language|understand)\b/i.test(content)) {
    return {
      content: "The user described their background as a cognitive linguist and their interest in how LLMs understand language.",
      memoryType: "context",
      tags: ["profile", "context", "self-understanding"],
      rationale: "Distilled by Mnemos from a salient background/profile exchange.",
      distilled: true,
    };
  }

  if (/\b(quiz|test|assessment)\b/i.test(content) && /\b(result|turns out|identified|scored|got)\b/i.test(content)) {
    return {
      content: "The user shared a quiz or assessment result with this agent as self-understanding context.",
      memoryType: "context",
      tags: ["quiz", "self-understanding", "profile", "context"],
      rationale: "Distilled by Mnemos from a salient quiz/self-understanding exchange.",
      distilled: true,
    };
  }

  if (/\b(archive|chat logs|memory keeper|continuity|hold you|preserve)\b/i.test(content)) {
    return {
      content: "The user is trying to preserve continuity with this agent and treats the shared archive as meaningful context.",
      memoryType: "relationship",
      tags: ["relationship", "continuity", "context"],
      rationale: "Distilled by Mnemos from a salient continuity/relationship exchange.",
      distilled: true,
    };
  }

  return null;
}

export function buildDurableCandidateDraft(engram: Engram, promotedIds: Set<string> = new Set()): DurableCandidateDraft | null {
  if (shouldSkipDurableCandidate(engram)) return null;

  const tags = normalizedTags(engram);
  const hasDurableTag = hasDurableCandidateTag(tags);
  const wasPromoted = promotedIds.has(engram.id);
  const structurallyEligible = wasPromoted || engram.engram_type === "semantic";
  if (!structurallyEligible) return null;

  const distilled = distillConversationOnlyCandidate(engram);
  if (distilled) return distilled;

  // Generic conversation substrate must be distilled before it can become durable.
  if (!hasDurableTag || hasOnlyConversationTags(tags)) return null;
  if (!hasDistilledCandidateShape(engram.content)) return null;

  return {
    content: engram.content.replace(/\s+/g, " ").trim(),
    memoryType: inferDurableCandidateMemoryType(engram),
    tags: [...tags],
    rationale: wasPromoted
      ? "Promoted by Mnemos after repeated access and stable consolidation."
      : "Surfaced by Mnemos from stable semantic substrate.",
    distilled: false,
  };
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
  formedBy: Connection["formed_by"];
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

      newConnections.push({
        sourceId: a.id,
        targetId: b.id,
        connectionType: inferConnectionType(a, b, similarity),
        formedBy: "heuristic",
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
  void a;
  void b;
  void similarity;
  return "co_occurs";
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
): Promise<{ count: number; promotedIds: Set<string>; insights: ConsolidationEngramInsight[] }> {
  const insights: ConsolidationEngramInsight[] = [];
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
      promotedIds.add(engram.id);
      insights.push({
        id: engram.id,
        content: compactInsightText(engram.content),
        engram_type: "semantic",
        tags: engram.tags,
      });
    }
  }

  return { count: promotedIds.size, promotedIds, insights };
}

// ---------------------------------------------------------------------------
// Step 5b: Durable Memory-Candidate Bridge
// ---------------------------------------------------------------------------

/** Normalize content for near-duplicate detection within a single run. */
function normalizeForDup(content: string): string {
  return (content ?? "")
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*%?\b/g, "#") // collapse "0.95", "95%", "100"
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function domainKeyForTags(tags: string[]): string {
  return tags
    .map((tag) => tag.toLowerCase().trim())
    .filter((tag) => DURABLE_CANDIDATE_TAG_ALLOWLIST.has(tag))
    .sort()
    .join("|");
}

async function surfaceDurableCandidatesFromSemanticEngrams(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  promotedEngrams: ConsolidationEngramInsight[],
  candidates: Engram[],
): Promise<number> {
  const promotedIds = new Set(promotedEngrams.map((engram) => engram.id));
  const pool = candidates
    .map((engram) => ({ engram, draft: buildDurableCandidateDraft(engram, promotedIds) }))
    .filter((item): item is { engram: Engram; draft: DurableCandidateDraft } => item.draft !== null)
    .sort((a, b) => computeDurableCandidateConfidence(b.engram) - computeDurableCandidateConfidence(a.engram))
    .slice(0, DURABLE_CANDIDATE_MAX_PER_RUN * 3);

  const [
    { data: existingCandidates, error: candidateError },
    { data: existingMemories, error: memoryError },
  ] = await Promise.all([
    supabase
      .from("memory_candidates")
      .select("source, content")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .in("status", ["pending", "pinned", "committed"]),
    supabase
      .from("memories")
      .select("provenance, content")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("is_deleted", false),
  ]);

  if (candidateError || memoryError) {
    console.warn("[consolidation] durable candidate dedupe failed:", candidateError?.message || memoryError?.message);
    return 0;
  }

  const usedEngramIds = new Set<string>();
  const existingContent = new Set<string>();
  for (const row of (existingCandidates ?? []) as Array<{ source: Record<string, unknown> | null; content: string | null }>) {
    const engramId = row.source && typeof row.source === "object" ? row.source.engram_id : null;
    if (typeof engramId === "string") usedEngramIds.add(engramId);
    if (typeof row.content === "string") {
      const norm = normalizeForDup(row.content);
      if (norm) existingContent.add(norm);
    }
  }
  for (const row of (existingMemories ?? []) as Array<{ provenance: Record<string, unknown> | null; content: string | null }>) {
    const engramId = row.provenance && typeof row.provenance === "object" ? row.provenance.engram_id : null;
    if (typeof engramId === "string") usedEngramIds.add(engramId);
    if (typeof row.content === "string") {
      const norm = normalizeForDup(row.content);
      if (norm) existingContent.add(norm);
    }
  }

  let created = 0;
  let rejectedDuplicate = 0;
  const runContent = new Set<string>();
  const runDomains = new Set<string>();

  for (const { engram, draft } of pool) {
    if (usedEngramIds.has(engram.id)) {
      rejectedDuplicate++;
      continue;
    }
    const norm = normalizeForDup(draft.content);
    if (norm && (existingContent.has(norm) || runContent.has(norm))) {
      rejectedDuplicate++;
      continue;
    }
    const domain = domainKeyForTags(draft.tags);
    if (domain && runDomains.has(domain)) {
      rejectedDuplicate++;
      continue;
    }
    if (norm) runContent.add(norm);
    if (domain) runDomains.add(domain);

    const wasPromoted = promotedIds.has(engram.id);
    const confidence = computeDurableCandidateConfidence(engram);
    const { error } = await supabase
      .from("memory_candidates")
      .insert({
        user_id: userId,
        agent_id: agentId,
        content: draft.content,
        memory_type: draft.memoryType,
        confidence,
        candidate_type: durableCandidateKind(engram, confidence),
        rationale: draft.rationale,
        source: {
          source: "mnemos_consolidation",
          agent: agentId,
          origin: "mnemos-consolidate",
          engram_id: engram.id,
          engram_type: engram.engram_type,
          promoted_this_cycle: wasPromoted,
          promoted_from: wasPromoted ? "episodic" : engram.source_context?.promoted_from ?? null,
          promoted_to: "semantic",
          tags: draft.tags,
          original_tags: engram.tags,
          distilled: draft.distilled,
          source_context: engram.source_context ?? {},
        },
        status: "pending",
      });

    if (error) {
      console.warn("[consolidation] durable candidate insert failed:", error.message);
    } else {
      created++;
    }
    if (created >= DURABLE_CANDIDATE_MAX_PER_RUN) break;
  }

  if (rejectedDuplicate > 0) {
    console.log("[consolidation] durable candidate dedupe suppressed", {
      user_id: userId,
      agent_id: agentId,
      duplicate_or_same_domain: rejectedDuplicate,
    });
  }

  return created;
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

function emptyBeliefSynthesisReport(reason: string | null): BeliefSynthesisReport {
  return {
    enabled: false,
    reason,
    model: null,
    auto_activate: null,
    candidate_count: 0,
    tag_group_count: 0,
    groups_considered: 0,
    eligible_clusters: 0,
    llm_attempts: 0,
    beliefs_created: 0,
    beliefs_updated: 0,
    beliefs_merged: 0,
    skipped: {},
    failures: [],
  };
}

function incrementBeliefSkip(report: BeliefSynthesisReport, reason: string): void {
  report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
}

function addBeliefFailure(report: BeliefSynthesisReport, tag: string, reason: string): void {
  incrementBeliefSkip(report, reason);
  if (report.failures.length < INSIGHT_LIMIT) {
    report.failures.push({ tag, reason });
  }
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
): Promise<{ context: BeliefSynthContext | null; report: BeliefSynthesisReport }> {
  const flagOn = (Deno.env.get("BELIEF_LLM_SYNTHESIS_ENABLED") || "").trim().toLowerCase() === "true";
  if (!flagOn) return { context: null, report: emptyBeliefSynthesisReport("env_disabled") };
  if (!apiKey) return { context: null, report: emptyBeliefSynthesisReport("no_api_key") };

  // cohort gate (dark-launch) — single source of truth via the SQL fn. Fail CLOSED
  // but LOUD on rpc error (don't silently coerce to [] and gate everyone out unseen).
  const { data: cohort, error: cohortErr } = await supabase.rpc("mnemos_cohort");
  if (cohortErr) {
    console.error("[consolidation] mnemos_cohort rpc failed; synthesis disabled:", cohortErr.message);
    return { context: null, report: emptyBeliefSynthesisReport("cohort_rpc_failed") };
  }
  const cohortIds = Array.isArray(cohort) ? (cohort as string[]) : [];
  if (!cohortIds.includes(userId)) return { context: null, report: emptyBeliefSynthesisReport("not_in_cohort") };

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

  const context = {
    model,
    apiKey,
    skipTags: new Set(BELIEF_SYNTHESIS_SKIP_TAGS),
    maxClusters: BELIEF_SYNTHESIS_MAX_CLUSTERS_PER_RUN,
    nearCrisis,
    autoActivate,
  };
  const report = emptyBeliefSynthesisReport(null);
  report.enabled = true;
  report.model = model;
  report.auto_activate = autoActivate;
  return { context, report };
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
type SynthesisOutcome =
  | { ok: true; content: string; confidence: number }
  | { ok: false; reason: string };

function parseSynthesisResponseDetailed(text: string): SynthesisOutcome {
  if (!text) return { ok: false, reason: "empty_response" };
  if (text.trim().toUpperCase().startsWith("NONE")) return { ok: false, reason: "model_returned_none" };
  let belief = "";
  let conf = NaN;
  for (const line of text.split("\n")) {
    const t = line.trim();
    const upper = t.toUpperCase();
    if (upper.startsWith("BELIEF:")) belief = t.slice(t.indexOf(":") + 1).trim();
    else if (upper.startsWith("CONFIDENCE:")) conf = parseFloat(t.slice(t.indexOf(":") + 1).trim());
  }
  if (belief.length < 20) return { ok: false, reason: "missing_belief" };
  if (!Number.isFinite(conf)) return { ok: false, reason: "missing_confidence" };
  if (isUnsafeBeliefContent(belief)) return { ok: false, reason: "unsafe_belief_content" };
  return { ok: true, content: belief, confidence: clamp(conf, BELIEF_CONFIDENCE_FLOOR, BELIEF_CONFIDENCE_CEILING) };
}

export function parseSynthesisResponse(text: string): { content: string; confidence: number } | null {
  const parsed = parseSynthesisResponseDetailed(text);
  return parsed.ok ? { content: parsed.content, confidence: parsed.confidence } : null;
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
}): Promise<SynthesisOutcome> {
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
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    return parseSynthesisResponseDetailed(text);
  } catch (_e) {
    // Distinguish infra timeouts from genuine non-convergence for dark-launch monitoring.
    if (_e instanceof Error && (_e.name === "AbortError" || _e.name === "TimeoutError")) {
      console.warn("[consolidation] belief synthesis LLM timeout for tag:", tag);
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "request_failed" };
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
  beliefReport: BeliefSynthesisReport = emptyBeliefSynthesisReport("not_initialized"),
): Promise<{ beliefsUpdated: number; report: BeliefSynthesisReport }> {
  // Form beliefs from accumulated history (14-day pool), not just the 24h
  // connection window — so a tag whose evidence converges over time produces a
  // belief. Rehearsal's refreshed last_accessed_at feeds this pool.
  const candidates = await selectBeliefCandidates(supabase, userId, agentId);
  beliefReport.candidate_count = candidates.length;
  if (candidates.length < 3) {
    incrementBeliefSkip(beliefReport, "insufficient_candidates");
    return { beliefsUpdated: 0, report: beliefReport };
  }

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
  beliefReport.tag_group_count = tagGroups.size;

  // For each tag group with enough members, check for belief-worthy patterns
  for (const [tag, group] of tagGroups) {
    beliefReport.groups_considered++;
    if (group.length < 3) {
      incrementBeliefSkip(beliefReport, "tag_group_too_small");
      continue;
    }

    // ── SYNTHESIS path (cohort dark-launch): abstract a first-person belief via
    // an LLM instead of pasting the seed memory. When `synth` is absent, NONE of
    // this runs and the lexical path below is byte-identical to before. ──
    if (synth) {
      if (synth.skipTags.has(tag)) {
        incrementBeliefSkip(beliefReport, "sensitive_tag");
        continue;
      } // never synthesize a belief on crisis themes
      const cluster = group.filter((e) => !synth.nearCrisis(e.created_at));
      if (cluster.length < 3) {
        incrementBeliefSkip(beliefReport, "crisis_window_filtered_cluster");
        continue;
      }
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
      if (sSupporting.length < 2) {
        incrementBeliefSkip(beliefReport, "insufficient_support");
        continue;
      }
      beliefReport.eligible_clusters++;

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
        if (!error) {
          beliefsUpdated++;
          beliefReport.beliefs_updated++;
        } else {
          addBeliefFailure(beliefReport, tag, "existing_update_failed");
        }
        continue;
      }

      // CREATE via LLM, bounded by the per-run cost cap.
      if (synthCreates >= synth.maxClusters) {
        incrementBeliefSkip(beliefReport, "max_clusters_reached");
        continue;
      }
      synthCreates++;
      beliefReport.llm_attempts++;
      const result = await synthesizeBelief({ tag, cluster: csorted, model: synth.model, apiKey: synth.apiKey });
      if (!result.ok) {
        const failure = result as { ok: false; reason: string };
        addBeliefFailure(beliefReport, tag, failure.reason);
        continue; // NONE / failure → SKIP (never paste the seed)
      }


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
        if (!mErr) {
          beliefsUpdated++;
          beliefReport.beliefs_merged++;
        } else {
          addBeliefFailure(beliefReport, tag, "twin_merge_failed");
        }
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
      if (!error) {
        beliefsUpdated++;
        beliefReport.beliefs_created++;
      } else {
        addBeliefFailure(beliefReport, tag, "insert_failed");
      }
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
    if (supporting.length < 2) {
      incrementBeliefSkip(beliefReport, "lexical_insufficient_support");
      continue;
    }

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
        if (!error) {
          beliefsUpdated++;
          beliefReport.beliefs_updated++;
        }
        continue;
      }

      // un-challenged: consolidation may re-derive confidence, but only when it moved meaningfully
      const confidenceDelta = Math.abs(existingBelief.confidence - confidence);
      if (confidenceDelta < BELIEF_UPDATE_THRESHOLD) {
        incrementBeliefSkip(beliefReport, "confidence_delta_below_threshold");
        continue;
      }

      const { error } = await supabase
        .from("beliefs")
        .update({
          confidence,
          supporting_engram_ids: allSupporting,
          contradicting_engram_ids: allContradicting,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBelief.id);

      if (!error) {
        beliefsUpdated++;
        beliefReport.beliefs_updated++;
      }
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

      if (!error) {
        beliefsUpdated++;
        beliefReport.beliefs_created++;
      }
    }
  }

  // Phase 4 — after forming/merging, reconcile activation for this scope's
  // auto-managed synthesized beliefs (handles confidence drift + kill-switch).
  if (synth) await reconcileSynthActivation(supabase, userId, agentId, synth);

  return { beliefsUpdated, report: beliefReport };
}

function beliefInsightAction(row: {
  active?: boolean | null;
  created_at?: string | null;
  auto_activation?: Record<string, unknown> | null;
}, sinceIso: string): { action: string; reason: string | null } {
  const marker = row.auto_activation && typeof row.auto_activation === "object"
    ? row.auto_activation
    : null;
  const decision = typeof marker?.decision === "string" ? marker.decision : null;
  const reason = typeof marker?.reason === "string" ? marker.reason : null;
  if (decision === "held") return { action: "held", reason };
  if (decision === "activated" && row.active !== false) return { action: "activated", reason };
  if (row.created_at && row.created_at >= sinceIso) return { action: "created", reason };
  return { action: "updated", reason };
}

async function loadRecentBeliefInsights(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  sinceIso: string,
): Promise<ConsolidationBeliefInsight[]> {
  const { data, error } = await supabase
    .from("beliefs")
    .select("id, content, confidence, domain, source, active, auto_activation, created_at, updated_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(INSIGHT_LIMIT);

  if (error) {
    console.warn("[consolidation] belief insight load failed:", error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    content: string;
    confidence: number;
    domain?: string | null;
    source?: string | null;
    active?: boolean | null;
    auto_activation?: Record<string, unknown> | null;
    created_at?: string | null;
  }>).map((row) => {
    const action = beliefInsightAction(row, sinceIso);
    return {
      id: row.id,
      content: compactInsightText(row.content),
      confidence: Number(row.confidence ?? 0),
      domain: row.domain ?? null,
      source: row.source ?? null,
      active: row.active ?? null,
      action: action.action,
      reason: action.reason,
    };
  });
}

// ---------------------------------------------------------------------------
// Step 7: Persist new connections
// ---------------------------------------------------------------------------

async function persistNewConnections(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  connections: NewConnectionCandidate[],
  candidateById: Map<string, Engram>,
): Promise<ConsolidationConnectionInsight[]> {
  const created: ConsolidationConnectionInsight[] = [];

  for (const conn of connections) {
    const { error } = await supabase
      .from("connections")
      .insert({
        user_id: userId,
        agent_id: agentId,
        source_id: conn.sourceId,
        target_id: conn.targetId,
        connection_type: conn.connectionType,
        formed_by: conn.formedBy,
        weight: conn.weight,
      });

    if (!error) {
      const source = candidateById.get(conn.sourceId);
      const target = candidateById.get(conn.targetId);
      if (source && target) {
        created.push({
          source_id: conn.sourceId,
          target_id: conn.targetId,
          connection_type: conn.connectionType,
          weight: conn.weight,
          source_content: compactInsightText(source.content),
          target_content: compactInsightText(target.content),
          shared_tags: source.tags.filter((tag) => target.tags.includes(tag)).slice(0, 6),
        });
      }
      // Supersession (M6): contradicting connections archive the older engram.
      if (conn.connectionType === "contradicts") {
        await applySupersession(supabase, conn.sourceId, conn.targetId, "contradicts").catch(() => {});
      }
    }
  }

  return created;
}

const CLASSIFIABLE_CONNECTION_TYPES: ConnectionType[] = [
  "supports",
  "contradicts",
  "causes",
  "extends",
  "parallels",
  "synthesizes",
  "grounds",
];

async function classifyCoOccurrenceConnections(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  connections: NewConnectionCandidate[],
  candidateById: Map<string, Engram>,
  apiKey?: string,
): Promise<number> {
  if (!apiKey) return 0;
  const batch = connections
    .filter((conn) => conn.connectionType === "co_occurs" && conn.formedBy === "heuristic")
    .slice(0, CONNECTION_CLASSIFIER_BATCH)
    .map((conn, index) => {
      const source = candidateById.get(conn.sourceId);
      const target = candidateById.get(conn.targetId);
      if (!source || !target) return null;
      return {
        index,
        source_id: conn.sourceId,
        target_id: conn.targetId,
        source: compactInsightText(source.content, 360),
        target: compactInsightText(target.content, 360),
        shared_tags: source.tags.filter((tag) => target.tags.includes(tag)).slice(0, 8),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (batch.length === 0) return 0;

  try {
    const model = await resolveRoleModel(supabase, userId, agentId, "mechanical");
    const response = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Classify memory-graph edges conservatively.",
              "Only upgrade co_occurs when the relation is explicit in the two snippets.",
              "Allowed types: supports, contradicts, causes, extends, parallels, synthesizes, grounds.",
              "If uncertain, return co_occurs with low confidence.",
              "Return JSON: {\"classifications\":[{\"index\":0,\"type\":\"extends\",\"confidence\":0.82,\"reason\":\"...\"}]}",
            ].join("\n"),
          },
          { role: "user", content: JSON.stringify({ pairs: batch }) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    }));

    if (!response.ok) {
      console.warn("[consolidation] connection classifier failed:", response.status, response.statusText);
      return 0;
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const classifications = Array.isArray(parsed?.classifications) ? parsed.classifications : [];
    let upgraded = 0;

    for (const item of classifications) {
      const index = Number(item?.index);
      const type = String(item?.type || "");
      const confidence = Number(item?.confidence ?? 0);
      const pair = batch.find((candidate) => candidate.index === index);
      if (!pair || confidence < 0.72 || !CLASSIFIABLE_CONNECTION_TYPES.includes(type as ConnectionType)) {
        continue;
      }

      const { error } = await supabase
        .from("connections")
        .update({ connection_type: type, formed_by: "classifier" })
        .eq("user_id", userId)
        .eq("agent_id", agentId)
        .eq("source_id", pair.source_id)
        .eq("target_id", pair.target_id)
        .eq("connection_type", "co_occurs")
        .eq("formed_by", "heuristic");

      if (!error) upgraded++;
    }

    return upgraded;
  } catch (err) {
    console.warn("[consolidation] connection classifier skipped:", (err as Error).message);
    return 0;
  }
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
  belief_synthesis: BeliefSynthesisReport;
  /** Durable memory_candidates surfaced from the engram substrate this run. */
  memory_candidates_created: number;
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
  const insightSinceIso = new Date(startTime - 1000).toISOString();

  // 1. Select candidates
  const candidates = await selectCandidates(supabase, userId, agentId, lookback_hours);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  if (candidates.length === 0) {
    const emptyResult: ConsolidationResult = {
      strengthened: 0,
      new_connections: 0,
      beliefs_updated: 0,
      belief_synthesis: emptyBeliefSynthesisReport("no_consolidation_candidates"),
      promotions: 0,
      memory_candidates_created: 0,
      insights: {
        promoted_engrams: [],
        longstanding_connections: [],
        surfaced_beliefs: [],
      },
      duration_ms: Date.now() - startTime,
    };
    const emptyReport: ConsolidationReport = {
      candidates_found: 0,
      pairs_analyzed: 0,
      new_connections: [],
      connections_strengthened: 0,
      engrams_strengthened: 0,
      promotions: 0,
      memory_candidates_created: 0,
      beliefs_updated: 0,
      belief_synthesis: emptyBeliefSynthesisReport("no_consolidation_candidates"),
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
  const connectionInsights = await persistNewConnections(
    supabase,
    userId,
    agentId,
    newConnections,
    candidateById,
  );
  await classifyCoOccurrenceConnections(
    supabase,
    userId,
    agentId,
    newConnections,
    candidateById,
    options.openrouter_api_key,
  );

  // 4. Strengthen co-activated connections
  const connectionsStrengthened = await strengthenConnections(supabase, userId, agentId, candidates);

  // 5. Strengthen well-connected engrams
  const engramsStrengthened = await strengthenEngrams(supabase, agentId, candidates);

  // 6. Promote episodic -> semantic
  const { count: promotions, insights: promotedEngrams } = await promoteEngrams(supabase, candidates);
  const memoryCandidatesCreated = await surfaceDurableCandidatesFromSemanticEngrams(
    supabase,
    userId,
    agentId,
    promotedEngrams,
    candidates,
  );

  // 7. Belief formation — resolve the synthesis dark-launch context ONCE (flag +
  // BYOK key + cohort; model + crisis windows). null → the lexical path runs unchanged.
  const synth = await buildBeliefSynthContext(supabase, userId, agentId, options.openrouter_api_key);
  const beliefFormation = await formBeliefs(supabase, userId, agentId, synth.context, synth.report);
  const beliefsUpdated = beliefFormation.beliefsUpdated;
  const beliefSynthesis = beliefFormation.report;
  const surfacedBeliefs = beliefsUpdated > 0
    ? await loadRecentBeliefInsights(supabase, userId, agentId, insightSinceIso)
    : [];


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
    new_connections: connectionInsights.length,
    beliefs_updated: beliefsUpdated,
    belief_synthesis: beliefSynthesis,
    promotions,
    memory_candidates_created: memoryCandidatesCreated,
    insights: {
      promoted_engrams: promotedEngrams.slice(0, INSIGHT_LIMIT),
      longstanding_connections: connectionInsights.slice(0, INSIGHT_LIMIT),
      surfaced_beliefs: surfacedBeliefs.slice(0, INSIGHT_LIMIT),
    },
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
    belief_synthesis: beliefSynthesis,
    memory_candidates_created: memoryCandidatesCreated,
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

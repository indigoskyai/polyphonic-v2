/**
 * Mnemos Memory System — Encoding (Dual-Trace)
 *
 * Implements the encoding pipeline: extract memory candidates, compute
 * surprise against existing engrams, set initial dual-trace values
 * (strength, stability, accessibility), tag emotional context, discover
 * connections to related engrams, and persist the result.
 *
 * Wave 4, Step 20.
 */

import type {
  Connection,
  ConnectionType,
  Engram,
  EncodingContext,
  EncodingResult,
  Belief,
  EmotionalState,
} from "./types.ts";
import { buildEmbeddingText, embedOne } from "../embeddings.ts";
import { isMemoryAugmentationEnabled } from "../config.ts";
import { applySupersession } from "./supersession.ts";

import {
  SURPRISE_ENCODING_BONUS,
  EMOTIONAL_ENCODING_WEIGHT,
  DEFAULT_CONNECTION_WEIGHT,
  EMOTIONAL_STATE_WINDOW,
} from "./constants.ts";

import { computeEncodingSalience } from "./salience.ts";

import type { MnemosEngine } from "./engine.ts";

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Naive cosine-ish similarity between two strings using character trigrams.
 * This is a lightweight approximation — no embedding model required.
 * Suitable for edge function use where we can't call an embedding API
 * synchronously during encoding.
 */
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

  // Jaccard-style overlap normalized to [0, 1]
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Surprise Detection
// ---------------------------------------------------------------------------

/**
 * Compute how NOVEL new content is relative to existing engrams (1 - max similarity).
 *
 * NOTE on the name: despite living under `surprise_score`, this is a NOVELTY signal,
 * NOT belief-contradiction "surprise" (canonical Mnemos detects surprise as contradiction
 * of existing beliefs). It is a light encoding-strength aid only, and a poor proxy for
 * "mundane vs important" (a freshly-worded "hello" scores high). It must not be the sole
 * gate for anything safety-sensitive. Returns [0,1], higher = more novel.
 */
async function computeSurprise(
  engine: MnemosEngine,
  content: string
): Promise<number> {
  const client = engine.getClient();
  const userId = engine.getUserId();
  const agentId = engine.getAgentId();

  // Fetch recent active engrams to compare against (limit to a reasonable set)
  const { data: existingEngrams, error } = await client
    .from("engrams")
    .select("content")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !existingEngrams || existingEngrams.length === 0) {
    // No existing memories — everything is maximally surprising
    return 1.0;
  }

  let maxSimilarity = 0;
  for (const engram of existingEngrams as Array<{ content: string }>) {
    const sim = trigramSimilarity(content, engram.content);
    if (sim > maxSimilarity) maxSimilarity = sim;
  }

  return clamp(1 - maxSimilarity, 0, 1);
}

// ---------------------------------------------------------------------------
// Emotional Context Extraction
// ---------------------------------------------------------------------------

/**
 * Extract emotional valence and arousal from content using keyword heuristics.
 * A simple rule-based approach — sufficient for encoding without calling an LLM.
 * Values returned in [-1, 1] for valence and [0, 1] for arousal.
 */
function extractEmotion(content: string): { valence: number; arousal: number } {
  const lower = content.toLowerCase();

  // Positive valence indicators
  const positiveWords = [
    "happy", "joy", "love", "great", "wonderful", "excited", "beautiful",
    "grateful", "proud", "amazing", "delight", "pleased", "hope", "peaceful",
    "calm", "content", "inspired", "warm", "kind", "brilliant",
  ];
  // Negative valence indicators
  const negativeWords = [
    "sad", "angry", "hate", "terrible", "awful", "frustrated", "anxious",
    "scared", "hurt", "disappointed", "lonely", "stressed", "worried",
    "depressed", "afraid", "painful", "miserable", "furious", "disgusted",
  ];
  // High arousal indicators
  const highArousalWords = [
    "excited", "furious", "thrilled", "terrified", "ecstatic", "panicked",
    "urgent", "shocking", "amazing", "incredible", "desperate", "explosive",
    "intense", "overwhelming", "passionate", "electrifying",
  ];
  // Low arousal indicators
  const lowArousalWords = [
    "calm", "peaceful", "quiet", "serene", "gentle", "still", "relaxed",
    "sleepy", "tired", "bored", "numb", "dull", "mundane",
  ];

  let positiveCount = 0;
  let negativeCount = 0;
  let highArousalCount = 0;
  let lowArousalCount = 0;

  for (const w of positiveWords) {
    if (lower.includes(w)) positiveCount++;
  }
  for (const w of negativeWords) {
    if (lower.includes(w)) negativeCount++;
  }
  for (const w of highArousalWords) {
    if (lower.includes(w)) highArousalCount++;
  }
  for (const w of lowArousalWords) {
    if (lower.includes(w)) lowArousalCount++;
  }

  const totalValence = positiveCount + negativeCount;
  const valence = totalValence === 0
    ? 0
    : clamp((positiveCount - negativeCount) / Math.max(totalValence, 1), -1, 1);

  const totalArousal = highArousalCount + lowArousalCount;
  const arousal = totalArousal === 0
    ? 0.3 // neutral default — most content has some arousal
    : clamp((highArousalCount - lowArousalCount) / Math.max(totalArousal, 1), 0, 1);

  return { valence, arousal };
}

/**
 * Count whole-word (or whole-phrase) case-insensitive matches. Whole-word
 * matching matters here because the markers include short tokens (we/us/was)
 * that would false-match as substrings of unrelated words.
 */
function countWholeWords(lower: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) n++;
  }
  return n;
}

/**
 * Derive the three VAD axes that encode() previously hardcoded to 0:
 * dominance (powerless..in-control), social (isolated..connected), temporal
 * (past..future), each in [-1, 1]; 0 = "no signal" (neutral), matching
 * extractEmotion's convention. Lexical heuristic — no LLM call.
 */
function extractExtendedAffect(content: string): { dominance: number; social: number; temporal: number } {
  const lower = content.toLowerCase();
  const axis = (hi: number, lo: number): number => {
    const total = hi + lo;
    return total === 0 ? 0 : clamp((hi - lo) / total, -1, 1);
  };
  const dominanceHigh = ["control","decide","decided","choose","chose","lead","command","create","build","achieve","determined","confident","own","master","power","capable","strong","shape","drive"];
  const dominanceLow = ["helpless","powerless","trapped","stuck","forced","unable","overwhelmed","lost","defeated","victim","submit","weak","cannot","dependent","controlled","obey","fragile"];
  const socialHigh = ["we","us","together","friend","friends","shared","connection","relationship","family","partner","community","belong","companion","bond","trust","loved","each other","with you"];
  const socialLow = ["alone","lonely","isolated","myself","nobody","abandoned","withdrawn","distant","solitary","disconnected","apart","unseen","empty"];
  const temporalFuture = ["will","going to","tomorrow","future","plan","plans","soon","next","later","hope","anticipate","upcoming","someday","eventually","expect","intend","want to"];
  const temporalPast = ["was","were","had","remember","remembered","yesterday","used to","ago","before","memory","memories","recalled","once","previously","former","history"];
  return {
    dominance: axis(countWholeWords(lower, dominanceHigh), countWholeWords(lower, dominanceLow)),
    social:    axis(countWholeWords(lower, socialHigh),    countWholeWords(lower, socialLow)),
    temporal:  axis(countWholeWords(lower, temporalFuture), countWholeWords(lower, temporalPast)),
  };
}

// ---------------------------------------------------------------------------
// Connection Discovery
// ---------------------------------------------------------------------------

interface DiscoveredConnection {
  targetId: string;
  connectionType: ConnectionType;
  formedBy: Connection["formed_by"];
  weight: number;
}

/**
 * Find existing engrams that relate to the new content and determine
 * connection types based on content similarity and overlap.
 */
async function discoverConnections(
  engine: MnemosEngine,
  content: string,
  explicitRelated: string[]
): Promise<DiscoveredConnection[]> {
  const client = engine.getClient();
  const userId = engine.getUserId();
  const agentId = engine.getAgentId();
  const connections: DiscoveredConnection[] = [];

  // 1. Add explicit connections provided by the caller
  for (const targetId of explicitRelated) {
    connections.push({
      targetId,
      connectionType: "extends",
      formedBy: "explicit",
      weight: DEFAULT_CONNECTION_WEIGHT,
    });
  }

  // 2. Discover connections by similarity to recent engrams
  const { data: candidates, error } = await client
    .from("engrams")
    .select("id, content, engram_type")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !candidates) return connections;

  const SIMILARITY_THRESHOLD = 0.25;

  for (const candidate of candidates as Array<{ id: string; content: string; engram_type: string }>) {
    // Skip if already connected explicitly
    if (explicitRelated.includes(candidate.id)) continue;

    const sim = trigramSimilarity(content, candidate.content);
    if (sim >= SIMILARITY_THRESHOLD) {
      connections.push({
        targetId: candidate.id,
        connectionType: "co_occurs",
        formedBy: "heuristic",
        weight: clamp(sim, 0.1, 1.0),
      });
    }
  }

  return connections;
}

// ---------------------------------------------------------------------------
// Dual-Trace Initial Values
// ---------------------------------------------------------------------------

interface DualTrace {
  strength: number;
  stability: number;
  accessibility: number;
}

/**
 * Compute initial dual-trace values for a new engram.
 *
 * strength = base * (1 + surprise_bonus * surprise)
 * stability = 0.1 (always starts low — grows with rehearsal)
 * accessibility = strength * 0.8 (starts proportional to encoding quality)
 *
 * Emotional arousal modulates strength: high-arousal memories encode stronger.
 */
function computeInitialTraces(
  surpriseScore: number,
  emotionalArousal: number
): DualTrace {
  const baseStrength = 0.5;
  const surpriseContribution = SURPRISE_ENCODING_BONUS * surpriseScore;
  const emotionalContribution = EMOTIONAL_ENCODING_WEIGHT * Math.abs(emotionalArousal);

  const strength = clamp(
    baseStrength * (1 + surpriseContribution) + emotionalContribution,
    0.1,
    1.0
  );
  const stability = 0.1;
  const accessibility = strength * 0.8;

  return { strength, stability, accessibility };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode a new memory into the mnemos system.
 *
 * Pipeline:
 * 1. Compute surprise score against existing engrams
 * 2. Extract emotional context (valence, arousal)
 * 3. Calculate initial dual-trace values (strength, stability, accessibility)
 * 4. Insert the engram into the database
 * 5. Discover and create connections to related engrams
 * 6. Return the encoding result
 */
export async function encode(
  engine: MnemosEngine,
  content: string,
  context: EncodingContext
): Promise<EncodingResult> {
  const client = engine.getClient();
  const userId = engine.getUserId();
  const agentId = engine.getAgentId();

  // 1. Surprise detection
  const surpriseScore = context.surprise_score ?? await computeSurprise(engine, content);

  // 2. Emotional tagging
  const extracted = extractEmotion(content);
  const emotionalValence = context.emotional_valence ?? extracted.valence;
  const emotionalArousal = context.emotional_arousal ?? extracted.arousal;
  const extendedAffect = extractExtendedAffect(content);

  // 2a. Salience gate — skip encoding for low-signal exchanges so the agent's
  // memory looks human rather than a transcript log. Bootstrap window loosens
  // the gate so a brand-new user still seeds identity.
  const sourceType = (context.source_context as { type?: string } | undefined)?.type ?? "";
  const forceEncode =
    sourceType === "manual" ||
    sourceType === "memory_extraction" ||
    sourceType === "import";

  const { count: existingEngramCount } = await client
    .from("engrams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating"]);

  const decision = computeEncodingSalience({
    surprise: surpriseScore,
    emotionalArousal,
    emotionalValence,
    tags: context.tags ?? [],
    existingEngramCount: existingEngramCount ?? 0,
    forceEncode,
  });

  if (!decision.encode) {
    return {
      engram: null,
      connections_created: [],
      beliefs_updated: [],
      skipped: true,
      skip_reason: decision.reason,
      salience: decision.score,
    };
  }

  // 3. Dual-trace initial values
  const traces = computeInitialTraces(surpriseScore, emotionalArousal);


  // 4. Insert engram
  const engramRow = {
    user_id: userId,
    agent_id: agentId,
    content,
    engram_type: context.engram_type ?? "episodic",
    strength: traces.strength,
    stability: traces.stability,
    accessibility: traces.accessibility,
    emotional_valence: emotionalValence,
    emotional_arousal: emotionalArousal,
    surprise_score: surpriseScore,
    affect_source: "heuristic",
    source_context: context.source_context ?? {},
    tags: context.tags ?? [],
    state: "active" as const,
    access_count: 0,
  };

  const { data: insertedEngram, error: engramError } = await client
    .from("engrams")
    .insert(engramRow)
    .select()
    .single();

  if (engramError || !insertedEngram) {
    throw new Error(`Failed to insert engram: ${engramError?.message ?? "unknown error"}`);
  }

  const engram = insertedEngram as Engram;

  // 4b. Embedding (M4) — best-effort post-insert. NULL on failure; the
  //     embeddings-backfill cron picks up engrams with NULL embeddings.
  if (context.api_key && isMemoryAugmentationEnabled(userId)) {
    try {
      const embedText = buildEmbeddingText({
        content: engram.content,
        engram_type: engram.engram_type,
        tags: engram.tags,
      });
      const embed = await embedOne(context.api_key, embedText);
      if (embed && embed.vector.length > 0) {
        const { error: embedErr } = await client
          .from("engrams")
          .update({ embedding: embed.vector, embedding_model: embed.model })
          .eq("id", engram.id)
          .eq("user_id", userId)
          .eq("agent_id", agentId);
        if (embedErr) {
          console.warn("[mnemos.encode] embedding update failed:", embedErr.message);
        }
      }
    } catch (err) {
      // Embedding is non-fatal — log and continue.
      console.warn("[mnemos.encode] embedding generation failed (non-fatal):", (err as Error).message);
    }
  }

  // 5. Connection discovery and creation
  const discovered = await discoverConnections(
    engine,
    content,
    context.related_engram_ids ?? []
  );

  const connectionsCreated: Connection[] = [];

  for (const disc of discovered) {
    const connRow = {
      user_id: userId,
      agent_id: agentId,
      source_id: engram.id,
      target_id: disc.targetId,
      connection_type: disc.connectionType,
      formed_by: disc.formedBy,
      weight: disc.weight,
    };

    const { data: insertedConn, error: connError } = await client
      .from("connections")
      .insert(connRow)
      .select()
      .single();

    if (!connError && insertedConn) {
      connectionsCreated.push(insertedConn as Connection);
      // Supersession (M6): contradicting connections archive the older engram
      // so retrieval doesn't surface both. Best-effort, non-fatal.
      if (disc.connectionType === "contradicts") {
        applySupersession(client, engram.id, disc.targetId, "contradicts", {
          userId,
          agentId,
        }).catch(() => {});
      }
    }
    // Non-fatal: if a connection insert fails (e.g. duplicate), continue
  }

  // 6. Record emotional state snapshot from this encoding
  const emotionalState: EmotionalState = {
    valence: emotionalValence,
    arousal: emotionalArousal,
    dominance: extendedAffect.dominance,
    certainty: 1 - surpriseScore, // high surprise = low certainty
    social: extendedAffect.social,
    temporal: extendedAffect.temporal,
  };

  await recordEmotionalSnapshot(client, userId, agentId, emotionalState);

  return {
    engram,
    connections_created: connectionsCreated,
    beliefs_updated: [], // Belief updates happen during consolidation (task-23)
    skipped: false,
    skip_reason: decision.reason,
    salience: decision.score,
  };
}

// ---------------------------------------------------------------------------
// Emotional State Persistence
// ---------------------------------------------------------------------------

/**
 * Record an emotional state snapshot into the database.
 */
async function recordEmotionalSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
  client: { from: (table: string) => any },
  userId: string,
  agentId: string,
  state: EmotionalState
): Promise<void> {
  await client.from("mnemos_emotional_state").insert({
    user_id: userId,
    agent_id: agentId,
    valence: state.valence,
    arousal: state.arousal,
    dominance: state.dominance,
    certainty: state.certainty,
    social: state.social,
    temporal: state.temporal,
  });
  // Non-fatal: emotional state recording is best-effort
}

/**
 * Get the current emotional state averaged over recent snapshots.
 */
export async function getCurrentEmotionalState(
  engine: MnemosEngine
): Promise<EmotionalState> {
  const client = engine.getClient();
  const userId = engine.getUserId();
  const agentId = engine.getAgentId();

  const { data, error } = await client
    .from("mnemos_emotional_state")
    .select("valence, arousal, dominance, certainty, social, temporal")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .order("recorded_at", { ascending: false })
    .limit(EMOTIONAL_STATE_WINDOW);

  if (error || !data || data.length === 0) {
    // Return neutral state if no history
    return {
      valence: 0,
      arousal: 0,
      dominance: 0,
      certainty: 0.5,
      social: 0,
      temporal: 0,
    };
  }

  const states = data as EmotionalState[];
  const count = states.length;

  return {
    valence: states.reduce((sum, s) => sum + s.valence, 0) / count,
    arousal: states.reduce((sum, s) => sum + s.arousal, 0) / count,
    dominance: states.reduce((sum, s) => sum + s.dominance, 0) / count,
    certainty: states.reduce((sum, s) => sum + s.certainty, 0) / count,
    social: states.reduce((sum, s) => sum + s.social, 0) / count,
    temporal: states.reduce((sum, s) => sum + s.temporal, 0) / count,
  };
}

/**
 * Record an emotional state snapshot (engine-level wrapper).
 */
export async function recordEmotionalState(
  engine: MnemosEngine,
  state: EmotionalState
): Promise<void> {
  await recordEmotionalSnapshot(engine.getClient(), engine.getUserId(), engine.getAgentId(), state);
}

/**
 * Mnemos Memory System — Constants
 *
 * Decay rates, activation thresholds, and system defaults.
 * All values are tunable; these are the empirically-derived starting points
 * from the Python mnemos package.
 */

// ---------------------------------------------------------------------------
// Dual-Trace Decay
// ---------------------------------------------------------------------------

/** Base decay rate for strength (per hour). Higher = faster forgetting. */
export const STRENGTH_DECAY_RATE = 0.05;

/** Base decay rate for accessibility (per hour). */
export const ACCESSIBILITY_DECAY_RATE = 0.03;

/** Stability growth factor per successful retrieval. */
export const STABILITY_GROWTH_FACTOR = 0.1;

/** Maximum stability value (asymptotic ceiling). */
export const MAX_STABILITY = 1.0;

/** Strength threshold below which an engram becomes dormant. */
export const DORMANT_THRESHOLD = 0.15;

/** Strength threshold below which a dormant engram gets archived. */
export const ARCHIVE_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// Activation & Retrieval
// ---------------------------------------------------------------------------

/** Default minimum activation score for retrieval results. */
export const DEFAULT_MIN_ACTIVATION = 0.1;

/** Default maximum results returned from retrieval. */
export const DEFAULT_RETRIEVAL_LIMIT = 20;

/** Weight of strength in the activation formula. */
export const ACTIVATION_STRENGTH_WEIGHT = 0.4;

/** Weight of recency in the activation formula. */
export const ACTIVATION_RECENCY_WEIGHT = 0.3;

/** Weight of relevance (semantic similarity) in the activation formula. */
export const ACTIVATION_RELEVANCE_WEIGHT = 0.3;

/** Default spreading activation depth. */
export const DEFAULT_SPREAD_DEPTH = 2;

/** Spreading activation decay factor per hop. */
export const SPREAD_DECAY_FACTOR = 0.5;

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/** Minimum number of accesses before an episodic engram can be promoted to semantic. */
export const PROMOTION_MIN_ACCESSES = 3;

/** Minimum stability for promotion to semantic. */
export const PROMOTION_MIN_STABILITY = 0.5;

/** Minimum connection weight to consider for consolidation strengthening. */
export const CONSOLIDATION_MIN_WEIGHT = 0.3;

/** Boost applied to strength during consolidation for well-connected engrams. */
export const CONSOLIDATION_STRENGTH_BOOST = 0.1;

// ---------------------------------------------------------------------------
// Beliefs
// ---------------------------------------------------------------------------

/** Confidence thresholds matching the generated column in the DB. */
export const CONFIDENCE_TIERS = {
  conviction: 0.9,
  strong: 0.7,
  moderate: 0.5,
  tentative: 0.3,
  uncertain: 0.0,
} as const;

/** Minimum confidence change to trigger a belief update. */
export const BELIEF_UPDATE_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// Emotional State
// ---------------------------------------------------------------------------

/** How many recent emotional states to average for "current" mood. */
export const EMOTIONAL_STATE_WINDOW = 5;

/** Emotional valence weight in surprise-modulated encoding. */
export const EMOTIONAL_ENCODING_WEIGHT = 0.2;

/** Surprise bonus applied to initial strength during encoding. */
export const SURPRISE_ENCODING_BONUS = 0.3;

// ---------------------------------------------------------------------------
// Connection Weights
// ---------------------------------------------------------------------------

/** Default weight for newly created connections. */
export const DEFAULT_CONNECTION_WEIGHT = 0.5;

/** Maximum connection weight. */
export const MAX_CONNECTION_WEIGHT = 1.0;

/** Weight boost per co-activation during consolidation. */
export const CO_ACTIVATION_WEIGHT_BOOST = 0.05;

// ---------------------------------------------------------------------------
// Dialectic Identity Patches
// ---------------------------------------------------------------------------

/** Default turn cadence for post-conversation dialectic reflection. */
export const DIALECTIC_TURN_CADENCE = 8;

/** Self/user model patches at or above this confidence apply automatically. */
export const DIALECTIC_MODEL_APPLY_THRESHOLD = 0.6;

/** Self/user model patches at or above this confidence queue for later evidence. */
export const DIALECTIC_MODEL_QUEUE_THRESHOLD = 0.4;

/** SOUL.md patches require higher confidence because they are identity-level. */
export const DIALECTIC_SOUL_APPLY_THRESHOLD = 0.8;

/** SOUL.md patches at or above this confidence queue for corroborating cycles. */
export const DIALECTIC_SOUL_QUEUE_THRESHOLD = 0.6;

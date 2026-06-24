/**
 * Mnemos Memory System — Constants
 *
 * Decay rates, activation thresholds, and system defaults.
 * All values are tunable; these are the empirically-derived starting points
 * from the Python mnemos package.
 */

// ---------------------------------------------------------------------------
// Dual-Trace Decay
//
// Calibrated to match the reference Mnemos implementation. Strength is the
// long-lived storage trace and decays ~10× slower than accessibility. Stability
// modulates the effective decay exponentially: a fully consolidated engram
// (stability ≈ 1) decays ~e^-3 ≈ 5% as fast as a fresh one. The intent is a
// human-feeling forgetting curve, not aggressive pruning.
// ---------------------------------------------------------------------------

/** Base decay rate for accessibility (per hour). Reference: 0.01. */
export const ACCESSIBILITY_DECAY_RATE = 0.01;

/** Strength decays at this fraction of the accessibility rate (10× slower). */
export const STRENGTH_DECAY_FACTOR = 0.1;

/** Legacy alias kept for any callers still importing it. */
export const STRENGTH_DECAY_RATE = ACCESSIBILITY_DECAY_RATE * STRENGTH_DECAY_FACTOR;

/** Exponential modulation of decay by stability: rate *= exp(-k * stability). */
export const STABILITY_DECAY_FACTOR = 3.0;

/** Connection count at/above which an engram begins gaining stability per cycle. */
export const STABILITY_CONNECTION_THRESHOLD = 3;

/** Per-cycle stability growth (multiplied by log1p(connections)). */
export const STABILITY_GROWTH_RATE = 0.002;

/** Maximum stability gained per consolidation cycle. */
export const STABILITY_GROWTH_CAP = 0.005;

/** Stability growth per successful retrieval. */
export const STABILITY_GROWTH_FACTOR = 0.05;

/** Maximum stability value (asymptotic ceiling). */
export const MAX_STABILITY = 1.0;

/** Accessibility floor for engrams created within the last 72 hours. */
export const RECENT_ACCESSIBILITY_FLOOR = 0.4;

/** Accessibility threshold below which an active engram becomes dormant. */
export const DORMANT_ACCESSIBILITY_THRESHOLD = 0.1;

/** Strength threshold below which a dormant engram is eligible for archive. */
export const ARCHIVE_THRESHOLD = 0.01;

/** Legacy alias for older callers checking strength dormancy. */
export const DORMANT_THRESHOLD = 0.05;

/** Days a dormant engram must be untouched before archive. */
export const ARCHIVE_DORMANT_DAYS = 30;

// --- Tier-2 decay-survival: make stability consequential, not just measured ---
// Today survival is decided by strength/recency only (determineState never reads
// stability), so consolidated memory dies on the same clock as noise. These make
// stability accrue for survivors and protect well-consolidated engrams.

/** Per decay cycle, a surviving reachable engram consolidates this fraction of its
 *  remaining headroom toward MAX_STABILITY (gentle: weeks to fully consolidate). */
export const STABILITY_SURVIVAL_RATE = 0.004;

/** Stability at/above which an engram is protected from archival entirely. */
export const STABILITY_ARCHIVE_PROTECT_FLOOR = 0.6;

/** Stability at/above which an engram resists dropping to dormant. */
export const STABILITY_DORMANT_PROTECTION = 0.8;

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

/** Minimum stability for promotion to semantic. Raised 0.5→0.6 so a promoted semantic
 *  engram sits at/above the archival-protection floor (STABILITY_ARCHIVE_PROTECT_FLOOR
 *  = 0.6); at 0.5 it could be promoted and then immediately decay below protection and
 *  be archived. Interim auto-gate until explicit promotion is decided. */
export const PROMOTION_MIN_STABILITY = 0.6;

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

/**
 * Epistemic-humility bounds (canonical Mnemos core/belief.py): a belief is never
 * dead (<= floor) nor absolute (>= ceiling). Every belief-confidence write —
 * formation, challenge, evidence update — clamps to this band. Prod previously used
 * [0,1] (formation) and [0.01,0.99] (challenge), permitting certainty and extinction.
 */
export const BELIEF_CONFIDENCE_FLOOR = 0.05;
export const BELIEF_CONFIDENCE_CEILING = 0.95;

// ── Phase 3 — LLM belief synthesis (cohort dark-launch) ──────────────────────
/**
 * Narrow crisis-content tags that skip LLM synthesis entirely — a belief must
 * NEVER be auto-formed from a cluster on these themes. Deliberately NOT the
 * digest's full mnemos_digest_sensitive_tags() (which includes identity/value/
 * belief — the legitimate belief domains; using it would gut formation).
 */
export const BELIEF_SYNTHESIS_SKIP_TAGS = [
  "crisis", "self_harm", "suicide", "suicidal_ideation", "overdose", "emergency",
  "trauma", "abuse",
];
/** Cost bound: max LLM synthesis CREATE calls per consolidation run per scope. */
export const BELIEF_SYNTHESIS_MAX_CLUSTERS_PER_RUN = 8;
/** Evidence sent to the synthesis LLM: at most N engrams, each truncated. */
export const BELIEF_SYNTHESIS_EVIDENCE_CAP = 12;
export const BELIEF_SYNTHESIS_EVIDENCE_CHARS = 240;

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

/**
 * Convictions are stances Luca holds about the world / people / work.
 * They sit between soul.md (identity-level) and self/user-model (observation-level)
 * and should evolve more readily than soul but more conservatively than the model
 * docs. Higher than self/user (0.6) and slightly higher than soul (0.8).
 */
export const DIALECTIC_CONVICTIONS_APPLY_THRESHOLD = 0.85;

/** Convictions at or above this confidence queue for corroborating cycles. */
export const DIALECTIC_CONVICTIONS_QUEUE_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Encoding Salience Gate
//
// Not every chat exchange should become an engram. Reference Mnemos treats
// encoding as costly: only events that are surprising, emotionally charged,
// novel relative to existing memory, or explicitly tagged should leave a
// trace. The defaults below are tuned so a steady-state conversation creates
// roughly one engram every several turns rather than one per turn.
// ---------------------------------------------------------------------------

/** Minimum salience score required to encode a candidate engram. */
export const ENCODING_SALIENCE_THRESHOLD = 0.55;

/** Salience contribution from raw surprise (1 - max similarity). */
export const SALIENCE_SURPRISE_WEIGHT = 0.55;

/** Salience contribution from absolute emotional arousal. */
export const SALIENCE_AROUSAL_WEIGHT = 0.25;

/** Salience contribution from absolute emotional valence. */
export const SALIENCE_VALENCE_WEIGHT = 0.15;

/** Bonus added when an explicit tag (e.g. "preference") signals importance. */
export const SALIENCE_EXPLICIT_TAG_BONUS = 0.4;

/** Tags that always force encoding regardless of computed salience. */
export const SALIENCE_FORCING_TAGS: readonly string[] = [
  "preference",
  "decision",
  "identity",
  "milestone",
  "promise",
  "boundary",
  "goal",
  "value",
  "manual",
];

/** Bootstrap window: while user has < N engrams, lower the gate to seed identity. */
export const BOOTSTRAP_ENGRAM_THRESHOLD = 25;

/** Salience gate while in bootstrap window. */
export const BOOTSTRAP_SALIENCE_THRESHOLD = 0.3;

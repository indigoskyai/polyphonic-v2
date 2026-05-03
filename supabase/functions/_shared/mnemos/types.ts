/**
 * Mnemos Memory System — Core Type Definitions
 *
 * Pure TypeScript types mirroring the database schema in
 * supabase/migrations/20260413000000_mnemos_schema.sql.
 * No runtime dependencies. No Supabase imports.
 */

// ---------------------------------------------------------------------------
// Enums & Literals
// ---------------------------------------------------------------------------

export type EngramType = "episodic" | "semantic" | "procedural" | "belief";

export type EngramState = "active" | "consolidating" | "dormant" | "archived";

export type ConnectionType =
  | "supports"
  | "contradicts"
  | "causes"
  | "extends"
  | "parallels"
  | "synthesizes"
  | "grounds";

export type ConfidenceTier =
  | "conviction"
  | "strong"
  | "moderate"
  | "tentative"
  | "uncertain";

// ---------------------------------------------------------------------------
// Database Row Types
// ---------------------------------------------------------------------------

/** A memory unit with dual-trace encoding (mirrors `engrams` table). */
export interface Engram {
  id: string;
  user_id: string;
  content: string;
  engram_type: EngramType;
  // Dual-trace encoding
  strength: number;
  stability: number;
  accessibility: number;
  // Emotional context
  emotional_valence: number;
  emotional_arousal: number;
  surprise_score: number;
  // Metadata
  source_context: Record<string, unknown>;
  tags: string[];
  // Lifecycle
  state: EngramState;
  last_accessed_at: string;
  access_count: number;
  created_at: string;
  updated_at: string;
}

/** Typed edge between two engrams (mirrors `connections` table). */
export interface Connection {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  connection_type: ConnectionType;
  weight: number;
  created_at: string;
}

/** Derived conviction with confidence tiers (mirrors `beliefs` table). */
export interface Belief {
  id: string;
  user_id: string;
  content: string;
  confidence: number;
  /** Generated column — computed from `confidence`. */
  confidence_tier: ConfidenceTier;
  supporting_engram_ids: string[];
  contradicting_engram_ids: string[];
  created_at: string;
  updated_at: string;
}

/** 6-dimensional emotional snapshot (mirrors `emotional_state` table). */
export interface EmotionalState {
  id?: string;
  user_id?: string;
  valence: number;    // negative to positive (-1..1)
  arousal: number;    // calm to excited (-1..1)
  dominance: number;  // submissive to dominant (-1..1)
  certainty: number;  // uncertain to certain (0..1)
  social: number;     // isolated to connected (-1..1)
  temporal: number;   // past-focused to future-focused (-1..1)
  recorded_at?: string;
}

/** Cold storage for decayed engrams (mirrors `engram_archive` table). */
export interface EngramArchive {
  id: string;
  user_id: string;
  content: string;
  engram_type: EngramType;
  original_strength: number | null;
  original_stability: number | null;
  tags: string[];
  source_context: Record<string, unknown>;
  archived_at: string;
  original_created_at: string | null;
}

// ---------------------------------------------------------------------------
// Operation Inputs
// ---------------------------------------------------------------------------

/** Context provided when encoding a new memory. */
export interface EncodingContext {
  engram_type?: EngramType;
  emotional_valence?: number;
  emotional_arousal?: number;
  surprise_score?: number;
  tags?: string[];
  source_context?: Record<string, unknown>;
  /** IDs of existing engrams to connect to. */
  related_engram_ids?: string[];
}

/** Options for retrieval queries. */
export interface RetrievalOptions {
  /** Maximum number of results to return. */
  limit?: number;
  /** Minimum activation threshold (0..1). */
  min_activation?: number;
  /** Filter by engram type. */
  engram_types?: EngramType[];
  /** Filter by state. */
  states?: EngramState[];
  /** Filter by tags (any match). */
  tags?: string[];
  /** Whether to include connected engrams via spreading activation. */
  spread_activation?: boolean;
  /** Depth of spreading activation traversal. */
  spread_depth?: number;
}

/** Options for the decay process. */
export interface DecayOptions {
  /** Only decay engrams older than this many hours since last access. */
  min_hours_since_access?: number;
  /** If true, archive engrams that fall below the archive threshold. */
  archive_below_threshold?: boolean;
  /** Multiplier on elapsed hours, derived from the user's decay-rate slider (default 1.0). */
  rate_multiplier?: number;
}

// ---------------------------------------------------------------------------
// Operation Results
// ---------------------------------------------------------------------------

/** Result of encoding a new memory. */
export interface EncodingResult {
  engram: Engram | null;
  connections_created: Connection[];
  beliefs_updated: Belief[];
  /** True when the salience gate suppressed the encoding. */
  skipped?: boolean;
  /** Reason for skipping (debug/inspection). */
  skip_reason?: string;
  /** Computed salience score for observability. */
  salience?: number;
}

/** A single engram with its computed activation score from retrieval. */
export interface ActivationResult {
  engram: Engram;
  /** Computed activation score (0..1), combining strength, recency, and relevance. */
  activation: number;
  /** How the engram was reached (direct match or via spreading activation). */
  path: "direct" | "spread";
  /** Connection chain if reached via spreading activation. */
  spread_chain?: Array<{ connection_id: string; connection_type: ConnectionType }>;
}

/** Result of a decay cycle. */
export interface DecayResult {
  engrams_decayed: number;
  engrams_archived: number;
  total_processed: number;
}

/** Result of a consolidation (dream) cycle. */
export interface ConsolidationResult {
  /** Engrams that were strengthened by consolidation. */
  strengthened: number;
  /** New connections discovered between engrams. */
  new_connections: number;
  /** Beliefs that were created or updated. */
  beliefs_updated: number;
  /** Engrams promoted from episodic to semantic. */
  promotions: number;
  /** Duration of the consolidation cycle in milliseconds. */
  duration_ms: number;
}

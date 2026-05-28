/**
 * Mnemos Memory System — Engine
 *
 * Orchestrates encoding, retrieval, decay, and consolidation.
 * Method bodies are stubs — each operation is implemented in its own
 * module (tasks 20-23). This file defines the public API surface
 * and holds shared state (supabase client, user scope).
 */

import type {
  ActivationResult,
  Belief,
  ConsolidationResult,
  DecayOptions,
  DecayResult,
  EmotionalState,
  EncodingContext,
  EncodingResult,
  ConfidenceTier,
  RetrievalOptions,
} from "./types.ts";

import {
  encode as encodeImpl,
  getCurrentEmotionalState as getEmotionalStateImpl,
  recordEmotionalState as recordEmotionalStateImpl,
} from "./encoding.ts";
import { retrieve as retrieveImpl } from "./retrieval.ts";
import { runDecayCycle } from "./decay.ts";
import { runConsolidation, type ConsolidationOptions } from "./consolidation.ts";
import { dream } from "./dreaming.ts";

// SupabaseClient is used as a constructor dependency but we avoid importing
// @supabase/supabase-js here to keep the module portable. The concrete type
// is inferred from whatever the caller passes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

/**
 * Core engine for the mnemos memory system.
 *
 * Each public method delegates to a dedicated module (encoding, retrieval,
 * decay, consolidation) that will be implemented in subsequent tasks.
 * This class is the single entry point for all memory operations.
 */
export class MnemosEngine {
  private readonly supabase: SupabaseClient;
  private readonly userId: string;
  private readonly agentId: string;

  constructor(supabaseClient: SupabaseClient, userId: string, agentId = "luca") {
    this.supabase = supabaseClient;
    this.userId = userId;
    this.agentId = agentId || "luca";
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /** The Supabase client scoped to this engine instance. */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /** The user ID this engine operates on. */
  getUserId(): string {
    return this.userId;
  }

  /** The agent ID this engine operates on. */
  getAgentId(): string {
    return this.agentId;
  }

  // -------------------------------------------------------------------------
  // Core Operations (implemented in tasks 20-23)
  // -------------------------------------------------------------------------

  /**
   * Encode a new memory into the system.
   * Creates an engram, optionally connects it to existing engrams,
   * and updates beliefs if relevant.
   */
  async encode(content: string, context: EncodingContext): Promise<EncodingResult> {
    return encodeImpl(this, content, context);
  }

  /**
   * Retrieve memories relevant to a query using spreading activation.
   * Returns engrams sorted by activation score.
   */
  async retrieve(query: string, options?: RetrievalOptions): Promise<ActivationResult[]> {
    return retrieveImpl(this, query, options);
  }

  /**
   * Apply time-based decay to all active engrams.
   * Reduces strength and accessibility based on elapsed time and stability.
   * Optionally archives engrams below threshold.
   */
  async decay(options?: DecayOptions): Promise<DecayResult> {
    return runDecayCycle(this.supabase, this.userId, { ...options, agentId: this.agentId });
  }

  /**
   * Run a consolidation cycle ("dreaming").
   * Strengthens well-connected engrams, discovers new connections,
   * promotes episodic memories to semantic, and updates beliefs.
   */
  async consolidate(options?: ConsolidationOptions & { openrouter_api_key?: string }): Promise<ConsolidationResult> {
    const { result, report } = await runConsolidation(this.supabase, this.userId, { ...options, agentId: this.agentId });

    // Generate dream narrative if OpenRouter key is available
    if (options?.openrouter_api_key) {
      await dream(this.supabase, this.userId, report, options.openrouter_api_key, this.agentId);
    }

    return {
      ...result,
      candidates_found: report.candidates_found,
      pairs_analyzed: report.pairs_analyzed,
      connections_strengthened: report.connections_strengthened,
    };
  }

  // -------------------------------------------------------------------------
  // Belief Management
  // -------------------------------------------------------------------------

  /**
   * Update or create a belief based on supporting/contradicting evidence.
   * Recalculates confidence from the evidence engrams.
   */
  async updateBelief(content: string, evidence: { id: string }[]): Promise<Belief> {
    const client = this.supabase;
    const userId = this.userId;
    const agentId = this.agentId;
    const evidenceIds = evidence.map((e) => e.id);

    // Check if a belief with this content already exists
    const { data: existing } = await client
      .from("beliefs")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("content", content)
      .limit(1);

    const confidence = Math.min(1, evidenceIds.length * 0.2 + 0.3);

    if (existing && existing.length > 0) {
      const belief = existing[0] as Belief;
      const mergedSupporting = [...new Set([...belief.supporting_engram_ids, ...evidenceIds])];

      const { data: updated, error } = await client
        .from("beliefs")
        .update({
          confidence,
          supporting_engram_ids: mergedSupporting,
          updated_at: new Date().toISOString(),
        })
        .eq("id", belief.id)
        .eq("user_id", userId)
        .eq("agent_id", agentId)
        .select()
        .single();

      if (error || !updated) {
        throw new Error(`Failed to update belief: ${error?.message ?? "unknown"}`);
      }
      return updated as Belief;
    }

    const { data: inserted, error } = await client
      .from("beliefs")
      .insert({
        user_id: userId,
        agent_id: agentId,
        content,
        confidence,
        supporting_engram_ids: evidenceIds,
        contradicting_engram_ids: [],
      })
      .select()
      .single();

    if (error || !inserted) {
      throw new Error(`Failed to create belief: ${error?.message ?? "unknown"}`);
    }
    return inserted as Belief;
  }

  /**
   * Retrieve beliefs, optionally filtered by confidence tier.
   */
  async getBeliefs(tier?: ConfidenceTier): Promise<Belief[]> {
    const client = this.supabase;
    const userId = this.userId;
    const agentId = this.agentId;

    let query = client
      .from("beliefs")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .order("confidence", { ascending: false });

    if (tier) {
      // Filter by confidence tier using threshold ranges from constants
      const { CONFIDENCE_TIERS: tiers } = await import("./constants.ts");
      const tierEntries = Object.entries(tiers) as Array<[string, number]>;
      const tierIndex = tierEntries.findIndex(([name]) => name === tier);

      if (tierIndex >= 0) {
        const minConfidence = tierEntries[tierIndex][1];
        const maxConfidence = tierIndex > 0 ? tierEntries[tierIndex - 1][1] : 1.0;
        query = query.gte("confidence", minConfidence).lt("confidence", maxConfidence);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch beliefs: ${error.message}`);
    }

    return (data ?? []) as Belief[];
  }

  // -------------------------------------------------------------------------
  // Emotional State
  // -------------------------------------------------------------------------

  /**
   * Record an emotional state snapshot.
   */
  async recordEmotionalState(state: EmotionalState): Promise<void> {
    return recordEmotionalStateImpl(this, state);
  }

  /**
   * Get the current emotional state (averaged over recent snapshots).
   */
  async getCurrentEmotionalState(): Promise<EmotionalState> {
    return getEmotionalStateImpl(this);
  }
}

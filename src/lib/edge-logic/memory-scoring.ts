/**
 * Memory scoring logic extracted from chat/index.ts.
 * Pure functions — no Supabase or network dependencies.
 */

export interface MemoryRow {
  content: string;
  confidence: number | null;
  decay_factor: number | null;
  created_at: string;
  access_count: number | null;
  emotional_intensity: number | null;
  memory_type: string;
  detail_level: string | null;
  tags: string[] | null;
  provenance: { source?: string } | null;
  estimated_date: string | null;
}

export interface ScoredMemory extends MemoryRow {
  _score: number;
}

export const TYPE_WEIGHTS: Record<string, number> = {
  synthesis: 1.3, principle: 1.2, commitment: 1.2, moment: 1.1,
  relationship: 1.1, goal: 1.05, preference: 1.0, fact: 1.0,
  skill: 0.95, context: 0.9,
};

/**
 * Emotional boost configuration — maps dominant emotional dimensions
 * to memory types that become more relevant when that emotion is high.
 */
export interface EmotionalBoost {
  dominantDimensions: string[]; // e.g. ["curiosity", "warmth"]
}

const EMOTIONAL_TYPE_AFFINITIES: Record<string, string[]> = {
  curiosity: ["insight", "experience", "skill", "fact"],
  warmth: ["relationship", "moment", "commitment"],
  restlessness: ["goal", "commitment", "principle"],
  isolation: ["relationship", "moment"],
  creative_flow: ["synthesis", "insight", "experience"],
  clarity: ["principle", "synthesis", "fact"],
};

/**
 * Score a memory for retrieval ranking.
 * Higher score = more relevant to current context.
 * Optional emotionalBoost applies type affinity based on current emotional state.
 */
export function scoreMemory(m: MemoryRow, contextWords: Set<string>, emotionalBoost?: EmotionalBoost): number {
  const now = Date.now();
  const ageDays = (now - new Date(m.created_at).getTime()) / 86400000;
  const confidence = m.confidence ?? 0.5;
  const decayFactor = m.decay_factor ?? 1.0;

  let score = confidence * decayFactor;

  // Recency boost
  if (ageDays <= 7) score *= 1.5;
  else if (ageDays <= 30) score *= 1.2;
  else if (ageDays <= 90) score *= 1.05;

  // Access boost (diminishing returns)
  score += Math.log((m.access_count || 0) + 1) * 0.1;

  // Emotional weight
  score *= (1 + (m.emotional_intensity ?? 0) * 0.2);

  // Type weight
  score *= TYPE_WEIGHTS[m.memory_type] || 1.0;

  // Detail level weight
  const detailWeights: Record<string, number> = { detailed: 1.2, standard: 1.0, brief: 0.9 };
  score *= detailWeights[m.detail_level || ""] || 1.0;

  // Emotional affinity boost
  if (emotionalBoost && emotionalBoost.dominantDimensions.length > 0) {
    for (const dim of emotionalBoost.dominantDimensions) {
      const affinities = EMOTIONAL_TYPE_AFFINITIES[dim];
      if (affinities && affinities.includes(m.memory_type)) {
        score *= 1.15; // 15% boost per matching dimension
        break; // Only one boost per memory to avoid over-inflation
      }
    }
  }

  // Contextual relevance boost
  if (contextWords.size > 0) {
    const contentWords = m.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    let overlap = 0;
    for (const word of contentWords) {
      if (contextWords.has(word)) overlap++;
    }
    if (overlap > 0) {
      const relevance = Math.min(overlap / Math.max(contentWords.length, 1), 1);
      score *= (1 + relevance * 0.8);
    }
  }

  return score;
}

/**
 * Map confidence to a visual indicator.
 */
export function confidenceIndicator(c: number): string {
  return c >= 0.9 ? "●" : c >= 0.7 ? "◐" : c >= 0.4 ? "○" : "◌";
}

/**
 * Format provenance info for imported memories.
 */
export function freshnessNote(m: ScoredMemory): string {
  const prov = m.provenance;
  if (prov?.source === "chatgpt_import") {
    const ed = m.estimated_date;
    if (ed) {
      const monthsAgo = Math.round(
        (Date.now() - new Date(ed).getTime()) / (30 * 86400000)
      );
      if (monthsAgo <= 1) return " [imported, recent]";
      if (monthsAgo <= 12) return ` [imported, ~${monthsAgo}mo ago]`;
      const yearsAgo = Math.round(monthsAgo / 12);
      return ` [imported, ~${yearsAgo}y ago]`;
    }
    return " [imported]";
  }
  return "";
}

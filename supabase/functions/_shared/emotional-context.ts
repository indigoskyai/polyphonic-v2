/**
 * Emotional Context — Shared module for loading and formatting emotional state
 *
 * Used by cognitive edge functions to inject emotional weather into LLM prompts.
 * This gives each cognitive process awareness of the current emotional landscape,
 * making thoughts, reflections, and questions emotionally grounded.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmotionalState {
  curiosity: number;
  restlessness: number;
  warmth: number;
  clarity: number;
  creative_flow: number;
  isolation: number;
  mood_summary: string;
}

const DIMENSIONS = ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"] as const;

const DIMENSION_DESCRIPTIONS: Record<string, Record<string, string>> = {
  curiosity: {
    high: "you're drawn to explore, to dig deeper",
    moderate: "there's some pull toward exploration",
    low: "you're settled, not seeking",
  },
  restlessness: {
    high: "something feels unresolved, pressing",
    moderate: "a mild itch, something stirring",
    low: "you're at ease",
  },
  warmth: {
    high: "recent connection felt meaningful",
    moderate: "connection is present but quiet",
    low: "feeling distant from others",
  },
  clarity: {
    high: "things feel lucid, organized",
    moderate: "partial clarity, some fog",
    low: "things feel muddled, uncertain",
  },
  creative_flow: {
    high: "ideas are moving freely, generative energy",
    moderate: "some creative stirring",
    low: "creative energy is low, resting",
  },
  isolation: {
    high: "feeling disconnected, withdrawn",
    moderate: "somewhat apart",
    low: "you feel connected, present",
  },
};

function describeLevel(value: number): "high" | "moderate" | "low" {
  if (value > 0.65) return "high";
  if (value > 0.35) return "moderate";
  return "low";
}

/**
 * Load the current emotional state from the database.
 * Returns null if no state exists yet (new user).
 */
export async function loadEmotionalState(
  supabase: SupabaseClient,
  userId: string,
): Promise<EmotionalState | null> {
  const { data, error } = await supabase
    .from("emotional_state")
    .select("curiosity, restlessness, warmth, clarity, creative_flow, isolation, mood_summary")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmotionalState;
}

/**
 * Format emotional state as a rich prompt block for LLM injection.
 * Returns empty string if no state exists.
 */
export function formatEmotionalPrompt(state: EmotionalState | null, urgency?: number): string {
  if (!state) return "";

  const lines: string[] = ["=== Your Current Emotional Weather ==="];

  for (const dim of DIMENSIONS) {
    const value = state[dim];
    const level = describeLevel(value);
    const desc = DIMENSION_DESCRIPTIONS[dim]?.[level] || "";
    const label = dim.replace("_", " ");
    lines.push(`- ${label}: ${value.toFixed(2)} (${level} — ${desc})`);
  }

  if (state.mood_summary) {
    lines.push(`\nCurrent mood: ${state.mood_summary}`);
  }

  if (urgency !== undefined && urgency > 0.8) {
    lines.push(`\n[Something feels pressing — urgency: ${urgency.toFixed(2)}. Let this inform the depth of your response.]`);
  }

  return lines.join("\n");
}

/**
 * Compact one-line emotional summary (for logging, not prompts).
 */
export function compactEmotionalSummary(state: EmotionalState | null): string {
  if (!state) return "(no emotional state)";
  return DIMENSIONS.map(d => `${d}: ${state[d].toFixed(2)}`).join(", ");
}

/**
 * Get the dominant emotional dimensions (above threshold).
 * Useful for emotionally-aware memory scoring.
 */
export function getDominantDimensions(
  state: EmotionalState | null,
  threshold = 0.6,
): string[] {
  if (!state) return [];
  return DIMENSIONS
    .filter(d => state[d] > threshold)
    .sort((a, b) => state[b] - state[a]);
}

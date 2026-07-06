/**
 * Mnemos — Encoding Salience Gate
 *
 * Decides whether a candidate memory is worth encoding. Mirrors the spirit of
 * the reference Python `Encoder._score_confidence` + the broader Mnemos design
 * principle that encoding is *costly* and only earned content should leave a
 * trace. The agent should not form an engram for every chat exchange.
 *
 * The score combines:
 *   - Surprise (novelty vs. existing engrams) — strongest signal.
 *   - Emotional arousal — intensity tends to bind memory.
 *   - Emotional valence — strongly positive or negative is more memorable than neutral.
 *   - Explicit "forcing" tags (preference, decision, identity, …) — bypass the gate.
 *
 * During the bootstrap window (very few engrams) the gate is loosened so the
 * agent can build an initial sense of the user.
 */

import {
  ENCODING_SALIENCE_THRESHOLD,
  SALIENCE_SURPRISE_WEIGHT,
  SALIENCE_AROUSAL_WEIGHT,
  SALIENCE_VALENCE_WEIGHT,
  SALIENCE_EXPLICIT_TAG_BONUS,
  SALIENCE_FORCING_TAGS,
  BOOTSTRAP_ENGRAM_THRESHOLD,
  BOOTSTRAP_SALIENCE_THRESHOLD,
} from "./constants.ts";

export interface SalienceInputs {
  surprise: number;          // 0..1
  emotionalArousal: number;  // 0..1 (we treat |arousal|)
  emotionalValence: number;  // -1..1
  tags?: readonly string[];
  /** Candidate text, used only for tiny mundane-chat dampening. */
  content?: string;
  /** Source hint such as chat_exchange/manual/import. */
  sourceType?: string;
  /** Total active+consolidating engrams the user already has. */
  existingEngramCount?: number;
  /** Caller-provided override (e.g. crisis path) — always encode if true. */
  forceEncode?: boolean;
}

export interface SalienceDecision {
  encode: boolean;
  score: number;
  threshold: number;
  reason: string;
}

const FORCING = new Set(SALIENCE_FORCING_TAGS);

export function computeEncodingSalience(input: SalienceInputs): SalienceDecision {
  if (input.forceEncode) {
    return { encode: true, score: 1, threshold: 0, reason: "force_encode" };
  }

  const tags = input.tags ?? [];
  const matchedForcing = tags.find((t) => FORCING.has(t));
  if (matchedForcing) {
    return {
      encode: true,
      score: 1,
      threshold: 0,
      reason: `forcing_tag:${matchedForcing}`,
    };
  }

  const surprise = clamp01(input.surprise);
  const arousal = clamp01(Math.abs(input.emotionalArousal));
  const valence = clamp01(Math.abs(input.emotionalValence));

  let score =
    SALIENCE_SURPRISE_WEIGHT * surprise +
    SALIENCE_AROUSAL_WEIGHT * arousal +
    SALIENCE_VALENCE_WEIGHT * valence;

  // Soft bonus for explicit-but-non-forcing tags so callers can hint without
  // overriding (e.g. "lesson", "summary").
  if (tags.length > 0 && !matchedForcing) {
    score += Math.min(SALIENCE_EXPLICIT_TAG_BONUS, 0.05 * tags.length);
  }

  score = clamp01(score);

  const inBootstrap =
    typeof input.existingEngramCount === "number" &&
    input.existingEngramCount < BOOTSTRAP_ENGRAM_THRESHOLD;
  const threshold = inBootstrap ? BOOTSTRAP_SALIENCE_THRESHOLD : ENCODING_SALIENCE_THRESHOLD;

  if (isMundaneChatExchange(input.content, tags, input.sourceType)) {
    return {
      encode: false,
      score: Math.min(score, 0.05),
      threshold,
      reason: "mundane_chat",
    };
  }

  if (score >= threshold) {
    return {
      encode: true,
      score,
      threshold,
      reason: inBootstrap ? "bootstrap_pass" : "salience_pass",
    };
  }

  return {
    encode: false,
    score,
    threshold,
    reason: inBootstrap ? "bootstrap_low_salience" : "low_salience",
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const MUNDANE_CHAT_TOKENS = new Set([
  "a", "ah", "alright", "awesome", "cool", "fine", "good", "got", "great",
  "ha", "haha", "hello", "hey", "hi", "it", "just", "k", "lol", "nice",
  "ok", "okay", "sure", "sounds", "saying", "thank", "thanks", "ty", "yeah",
  "yep", "yes", "yo", "you",
]);

const DURABLE_MARKER_RE = /\b(remember|important|lasting|durable|preference|prefer|decision|decided|promise|boundary|always|never|from now on|do not forget|don't forget)\b/i;
const SPEAKER_MARKER_RE = /\b(user|assistant|human|ai|system)\s*:/i;

function isMundaneChatExchange(
  content: string | undefined,
  tags: readonly string[],
  sourceType: string | undefined,
): boolean {
  if (!content) return false;
  if (DURABLE_MARKER_RE.test(content)) return false;

  const source = (sourceType ?? "").toLowerCase();
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  const chatLike =
    source.includes("chat") ||
    source.includes("conversation") ||
    tagSet.has("conversation") ||
    SPEAKER_MARKER_RE.test(content);
  if (!chatLike) return false;

  const stripped = content
    .toLowerCase()
    .replace(/\b(user|assistant|human|ai|system)\s*:/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return true;

  const tokens = stripped.split(" ").filter(Boolean);
  if (tokens.length > 8) return false;
  return tokens.every((token) => MUNDANE_CHAT_TOKENS.has(token.replace(/^'+|'+$/g, "")));
}

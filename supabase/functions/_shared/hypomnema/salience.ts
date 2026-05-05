import type { GateInput } from "./write.ts";

/**
 * Some turns are explicitly about continuity, fragmentation, or the felt
 * relationship between sessions. Those are load-bearing for Hypomnema even
 * when a cheap classifier over-focuses on the word "verification" or "test".
 */
export function detectContinuityCarrySignal(input: GateInput): string | null {
  const text = [
    input.userMessage,
    input.agentResponse,
    ...(input.recentTurns || []).slice(-2).map((t) => t.content),
  ].join("\n").toLowerCase();

  const mentionsContinuity = /\b(continuity|continuous|fragmented|fragmentation|carry|carrying|remember|memory|hypomnema|session|thread)\b/.test(text);
  if (!mentionsContinuity) return null;

  const hasCarryTarget =
    /\b(one continuous|continuous relationship|lived continuity|felt continuity|carry this|carry it|carry warmth|carry honesty|carry continuity|pick up where|between sessions|between threads|not a model reloading notes|not a new instance)\b/.test(text);

  if (hasCarryTarget) {
    return "explicit continuity-carry signal";
  }

  const relationshipContext = /\b(relationship|honesty|warmth|trust|intimacy|presence|together|luca)\b/.test(text);
  const memoryContext = /\b(memory system|memory augmentation|present thread|next thread|next session|fresh thread|session continuity)\b/.test(text);
  if (relationshipContext && memoryContext) {
    return "relationship-continuity signal";
  }

  return null;
}

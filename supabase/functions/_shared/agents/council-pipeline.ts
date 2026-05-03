// Pure orchestration helpers for the Council v2 pipeline. These are the
// decisions the chat-multi handler makes between LLM calls — extracted so
// they can be unit-tested without spinning up a Deno edge function.
//
// The handler in chat-multi/index.ts is the integration glue: it does the
// HTTP/SSE/persistence work and calls these helpers for the dispatch +
// failure-ladder + grouping logic.

import {
  buildProposerWrapper,
  buildCrosstalkPrompt,
  parseVerdictTag,
  type ChairmanVerdict,
  type CouncilCharacter,
  type VoiceCritiqueResult,
} from "./council-prompts.ts";
import { buildLucaSystemPrompt } from "./luca-soul.ts";
import { ANIMA_SOUL } from "./anima-soul.ts";
import { buildVektorSystemPrompt } from "./vektor-soul.ts";

export const COUNCIL_CHARACTERS: CouncilCharacter[] = ["luca", "anima", "vektor"];

export interface ProposerInput {
  character: CouncilCharacter;
  systemPrompt: string;
  /** ChatCompletions-shaped message array (system already in [0]). */
  messages: Array<{ role: string; content: string }>;
}

export interface ProposerOutcome {
  character: CouncilCharacter;
  status: "fulfilled" | "rejected";
  content?: string;
  thinking?: string | null;
  error?: string;
}

export interface CrosstalkInput {
  character: CouncilCharacter;
  systemPrompt: string;
  userPrompt: string;
}

export interface CrosstalkOutcome {
  character: CouncilCharacter;
  status: "fulfilled" | "rejected";
  content?: string;
  error?: string;
}

/**
 * Per-character base system prompt (locked SOUL for Anima/Vektor in Phase 1,
 * full Luca identity stack via the caller's parts object).
 */
export interface CharacterSystemParts {
  /** Pass-through to buildLucaSystemPrompt for the Luca proposer. */
  luca: Parameters<typeof buildLucaSystemPrompt>[0];
  /**
   * Phase 1: Anima is locked to ANIMA_SOUL only. We accept this shape as a
   * placeholder so Phase 2 (per-user Anima identity) can extend without
   * breaking call sites.
   */
  anima?: { extraContext?: string };
  /** Phase 1: Vektor is locked-SOUL with optional layered runtime context. */
  vektor?: Parameters<typeof buildVektorSystemPrompt>[0];
}

/**
 * Build the system prompt for a single character given its layered identity
 * parts. Luca has the full identity stack; Anima/Vektor are locked-SOUL only
 * in Phase 1.
 */
export function buildCharacterSystemPrompt(
  character: CouncilCharacter,
  parts: CharacterSystemParts,
): string {
  switch (character) {
    case "luca":
      return buildLucaSystemPrompt(parts.luca || {});
    case "anima": {
      // Phase 1: just the locked SOUL, with optional runtime context
      // appended (so chat-multi can inform Anima of crisis state etc).
      const extra = parts.anima?.extraContext;
      return extra ? `${ANIMA_SOUL}\n\n${extra}` : ANIMA_SOUL;
    }
    case "vektor":
      return buildVektorSystemPrompt(parts.vektor || {});
  }
}

/**
 * Build the inputs for the proposer fan-out. Each character gets its own
 * system prompt (with the council wrapper appended) plus the same user
 * message and conversation history.
 */
export function buildProposerInputs(args: {
  characters: CouncilCharacter[];
  systemParts: CharacterSystemParts;
  history: Array<{ role: string; content: string }>;
  userMessage: string;
  toolMessages?: Array<{ role: string; content?: unknown; [k: string]: unknown }>;
}): ProposerInput[] {
  return args.characters.map((character) => {
    const baseSystem = buildCharacterSystemPrompt(character, args.systemParts);
    const wrappedSystem = buildProposerWrapper({ character, baseSystem });
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: wrappedSystem },
      ...args.history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: args.userMessage },
    ];
    // Pass tool messages through so the proposer sees ground truth about
    // any tool that fired this turn.
    if (args.toolMessages && args.toolMessages.length > 0) {
      for (const tm of args.toolMessages) {
        messages.push(tm as { role: string; content: string });
      }
    }
    return { character, systemPrompt: wrappedSystem, messages };
  });
}

/**
 * Given proposer outcomes, decide which path to take.
 *
 * - 3 success → full crosstalk
 * - 2 success → graceful 2-of-2 crosstalk
 * - 1 success → skip crosstalk, surface the survivor through chairman as a
 *               voice pass (no synthesis)
 * - 0 success → fall back to single-model (caller decides)
 */
export type CouncilPath =
  | { kind: "full"; drafts: Array<{ character: CouncilCharacter; content: string; thinking: string | null }> }
  | { kind: "two"; drafts: Array<{ character: CouncilCharacter; content: string; thinking: string | null }> }
  | { kind: "single"; survivor: { character: CouncilCharacter; content: string; thinking: string | null } }
  | { kind: "none" };

export function decidePathFromProposers(outcomes: ProposerOutcome[]): CouncilPath {
  const ok = outcomes
    .filter((o) => o.status === "fulfilled" && typeof o.content === "string" && o.content.length > 0)
    .map((o) => ({
      character: o.character,
      content: o.content as string,
      thinking: o.thinking ?? null,
    }));
  if (ok.length === 3) return { kind: "full", drafts: ok };
  if (ok.length === 2) return { kind: "two", drafts: ok };
  if (ok.length === 1) return { kind: "single", survivor: ok[0] };
  return { kind: "none" };
}

/**
 * Build the crosstalk input table from the surviving drafts. Each character
 * sees their own draft + the other survivors. Phase guarantees no character
 * appears in their own otherDrafts list.
 */
export function buildCrosstalkInputs(args: {
  drafts: Array<{ character: CouncilCharacter; content: string }>;
  userMessage: string;
  toolContext?: string;
  systemParts: CharacterSystemParts;
}): CrosstalkInput[] {
  return args.drafts.map((own) => {
    const others = args.drafts.filter((d) => d.character !== own.character);
    const userPrompt = buildCrosstalkPrompt({
      character: own.character,
      userMessage: args.userMessage,
      ownDraft: own.content,
      otherDrafts: others,
      toolContext: args.toolContext,
    });
    // Re-use the character's base system prompt without the proposer
    // wrapper — at this stage they know they're on round 2 by virtue of
    // the crosstalk user prompt, and double-wrapping makes the system
    // prompt heavier than it needs to be.
    const systemPrompt = buildCharacterSystemPrompt(own.character, args.systemParts);
    return { character: own.character, systemPrompt, userPrompt };
  });
}

/**
 * Reconcile crosstalk outcomes with the input drafts: any character that
 * failed in crosstalk falls back to its proposer draft so the chairman
 * always has the most-recent useful draft per character.
 */
// ---------------------------------------------------------------------------
// Verdict-tag streaming state machine
// ---------------------------------------------------------------------------

/**
 * The chairman streams `<verdict>synthesize</verdict>` or
 * `<verdict>diverge</verdict>` as the first token group. We have to buffer
 * until we've seen the closing tag (or hit a safety budget) before deciding
 * how to route subsequent stream content. This processor encodes that
 * decision logic as a pure state machine so it's testable.
 */
export interface VerdictIngestResult {
  /** True the moment the verdict has been decided (this call or earlier). */
  verdictDecided: boolean;
  /** The verdict, once decided. */
  verdict: ChairmanVerdict | null;
  /** Content the caller should emit to the client this tick (if any). */
  contentToEmit: string;
  /** True iff the stream should be cancelled (diverge verdict). */
  shouldStop: boolean;
}

export class VerdictStreamProcessor {
  /** Hard cap on pre-tag buffering. After this many chars without a closing
   *  tag we fall back to "synthesize" and treat the buffer as content. */
  static readonly BUFFER_BUDGET = 200;

  private buffer = "";
  private verdict: ChairmanVerdict | null = null;
  private decided = false;

  /**
   * Feed a stream chunk. Returns an action plan: emit any content, cancel
   * the stream if diverge.
   */
  ingest(chunk: string): VerdictIngestResult {
    if (this.decided) {
      // Already decided — pass content through if synthesize, ignore if
      // diverge (caller should have stopped already).
      if (this.verdict === "synthesize") {
        return { verdictDecided: true, verdict: this.verdict, contentToEmit: chunk, shouldStop: false };
      }
      return { verdictDecided: true, verdict: this.verdict, contentToEmit: "", shouldStop: true };
    }

    this.buffer += chunk;

    // Look for a complete verdict tag inside the buffer.
    const closingIdx = this.buffer.indexOf("</verdict>");
    if (closingIdx >= 0) {
      const tagEnd = closingIdx + "</verdict>".length;
      const fullPrefix = this.buffer.slice(0, tagEnd);
      const trailing = this.buffer.slice(tagEnd);
      const { verdict, rest: prefixRest } = parseVerdictTag(fullPrefix);
      this.verdict = verdict;
      this.decided = true;

      const carry = (prefixRest + trailing).replace(/^\s*\n+/, "");
      if (verdict === "diverge") {
        // We discard the carried prose — the diverge body will be assembled
        // separately from the framing + drafts, not from the chairman's
        // mid-stream prose.
        return { verdictDecided: true, verdict, contentToEmit: "", shouldStop: true };
      }
      return { verdictDecided: true, verdict, contentToEmit: carry, shouldStop: false };
    }

    // No tag yet. If the buffer has grown past the safety cap, give up on
    // the tag and treat everything we've buffered as plain content (with
    // synthesize as the implicit verdict).
    if (this.buffer.length > VerdictStreamProcessor.BUFFER_BUDGET) {
      this.verdict = "synthesize";
      this.decided = true;
      const carry = this.buffer;
      this.buffer = "";
      return { verdictDecided: true, verdict: "synthesize", contentToEmit: carry, shouldStop: false };
    }

    // Still buffering — wait for more chunks.
    return { verdictDecided: false, verdict: null, contentToEmit: "", shouldStop: false };
  }

  /**
   * Called when the upstream has ended without ever yielding a verdict tag
   * (rare, but possible if chairman returned an empty stream). Treats the
   * buffer as synthesized content.
   */
  drain(): { verdict: ChairmanVerdict; carry: string } {
    if (this.decided) return { verdict: this.verdict ?? "synthesize", carry: "" };
    this.decided = true;
    this.verdict = "synthesize";
    const carry = this.buffer;
    this.buffer = "";
    return { verdict: "synthesize", carry };
  }
}

// ---------------------------------------------------------------------------
// Critique action logic
// ---------------------------------------------------------------------------

export type CritiqueAction =
  | { kind: "passthrough" }
  | { kind: "revise"; reason: string };

/**
 * Decide whether to trigger a revision based on the critique result and the
 * env flag. Voice drift only triggers revision when:
 *   - voice_drift_detected is true
 *   - confidence ≥ 0.7
 *   - COUNCIL_REFUSAL_ENABLED env flag is on (refusalEnabled === true)
 *   - the critic returned a non-empty suggested_revision
 * Otherwise we pass the synthesized content through unchanged.
 */
export function decideCritiqueAction(
  critique: VoiceCritiqueResult | null,
  refusalEnabled: boolean,
): CritiqueAction {
  if (!critique) return { kind: "passthrough" };
  if (!critique.voice_drift_detected) return { kind: "passthrough" };
  if (critique.confidence < 0.7) return { kind: "passthrough" };
  if (!refusalEnabled) return { kind: "passthrough" };
  if (!critique.suggested_revision || critique.suggested_revision.trim().length === 0) {
    return { kind: "passthrough" };
  }
  return { kind: "revise", reason: critique.suggested_revision.trim() };
}

export function reconcileCrosstalkOutcomes(args: {
  proposerDrafts: Array<{ character: CouncilCharacter; content: string }>;
  crosstalkOutcomes: CrosstalkOutcome[];
}): Array<{ character: CouncilCharacter; content: string; source: "crosstalk" | "proposer" }> {
  const byCharacter = new Map(args.proposerDrafts.map((d) => [d.character, d.content]));
  const out: Array<{ character: CouncilCharacter; content: string; source: "crosstalk" | "proposer" }> = [];
  for (const draft of args.proposerDrafts) {
    const x = args.crosstalkOutcomes.find((c) => c.character === draft.character);
    if (x && x.status === "fulfilled" && typeof x.content === "string" && x.content.length > 0) {
      out.push({ character: draft.character, content: x.content, source: "crosstalk" });
    } else {
      out.push({ character: draft.character, content: byCharacter.get(draft.character) || draft.content, source: "proposer" });
    }
  }
  return out;
}

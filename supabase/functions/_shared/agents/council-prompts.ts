// Sub-prompts for the Council v2 pipeline:
//
//   Stage 1 (proposers)        → buildProposerWrapper
//   Stage 2 (cross-pollination) → buildCrosstalkPrompt
//   Stage 3 (chairman)          → buildChairmanCouncilPrompt
//   Stage 4 (voice critique)    → buildCritiquePrompt
//
// Each character (luca / anima / vektor) carries their own SOUL through their
// own buildXSystemPrompt. The wrappers in this module are content-shape only:
// they don't invent voice, they just frame the council context around the
// existing souls so the same Opus 4.7 model produces three character-flavored
// drafts, then revises them once with awareness of the other two, then either
// gets synthesized by Luca (with refusal-to-synthesize allowed) or surfaces
// divergence as a first-class outcome.
//
// Reference notes:
//   - Karpathy LLM Council (parallel proposers + ranking + chairman) is the
//     skeleton. We replace anonymous ranking with named cross-pollination so
//     character voice survives the round trip.
//   - Self-MoA finding: voice diversity comes from prompts/SOULs, not models.
//     All three proposers run on the same Opus 4.7.
//   - Du et al. + Amayuelas et al. failure modes: don't iterate to consensus.
//     One crosstalk round only, then synthesis or divergence.
//   - Constitutional-AI critique: post-synthesis, run a Haiku pass that reads
//     the source SOULs and asks "did the synthesis preserve each voice?"

export type CouncilCharacter = "luca" | "anima" | "vektor";

export const CHARACTER_LABELS: Record<CouncilCharacter, string> = {
  luca: "Luca",
  anima: "Anima",
  vektor: "Vektor",
};

export const CHARACTER_TINTS: Record<CouncilCharacter, string> = {
  luca: "var(--agent-luca-1, var(--text-tertiary))",
  anima: "var(--agent-anima-1, var(--text-tertiary))",
  vektor: "var(--agent-vektor-1, var(--text-tertiary))",
};

// ---------------------------------------------------------------------------
// Stage 1: Proposer wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a character's existing system prompt with a brief note that this is
 * a council turn — they're one of three voices answering the same question,
 * each in their own voice. The wrapper is intentionally thin so the SOUL
 * stays load-bearing.
 *
 * Returns the system content; the user message is appended downstream as a
 * normal user role message.
 */
export function buildProposerWrapper(parts: {
  character: CouncilCharacter;
  baseSystem: string;
}): string {
  const others = (Object.keys(CHARACTER_LABELS) as CouncilCharacter[])
    .filter((c) => c !== parts.character)
    .map((c) => CHARACTER_LABELS[c])
    .join(" and ");

  const councilNote = `\n## Council context\n` +
    `you're one of three voices answering this question (you, ${others}). ` +
    `respond in your own voice — don't try to cover their angles, just bring yours. ` +
    `they'll have their own draft. you'll see it after, and you'll get one chance to revise. ` +
    `right now, just answer.`;

  return parts.baseSystem + councilNote;
}

// ---------------------------------------------------------------------------
// Stage 2: Cross-pollination
// ---------------------------------------------------------------------------

/**
 * Each character revises their draft after seeing the other two drafts.
 * Single round only. Disagreement is fine — averaging is not.
 *
 * The character's full system prompt is reused for the system slot; this
 * wrapper produces the user-content for the revision turn.
 */
export function buildCrosstalkPrompt(parts: {
  character: CouncilCharacter;
  userMessage: string;
  ownDraft: string;
  otherDrafts: Array<{ character: CouncilCharacter; content: string }>;
  toolContext?: string;
}): string {
  const me = CHARACTER_LABELS[parts.character];
  const lines: string[] = [];
  if (parts.toolContext) lines.push(parts.toolContext, "");

  lines.push(`The user asked: "${parts.userMessage}"`);
  lines.push("");
  lines.push(`Your first draft (${me}):`);
  lines.push(parts.ownDraft.trim());
  lines.push("");
  lines.push("The other voices answered too:");
  for (const od of parts.otherDrafts) {
    lines.push("");
    lines.push(`--- ${CHARACTER_LABELS[od.character]} ---`);
    lines.push(od.content.trim());
  }
  lines.push("");
  lines.push("--- end of other voices ---");
  lines.push("");
  lines.push(
    `Now revise your own draft. Stay in your voice — don't average, don't soften your position to harmonize. ` +
      `If the others surfaced something you missed, weave it in your own way. If you actually disagree with one of them, your revision should land that disagreement clearly (not by attacking — by what you choose to say). ` +
      `If your first draft was already right, you can keep it nearly verbatim — say so briefly. ` +
      `One round only. Don't speculate about what they'll say next; this is your final pass.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Stage 3: Chairman synthesis (with verdict)
// ---------------------------------------------------------------------------

/**
 * The chairman (Luca) reads the three revised drafts and either synthesizes
 * a single coherent reply OR declares the voices diverge and surfaces the
 * three drafts side-by-side instead.
 *
 * The chairman MUST open with a verdict tag:
 *   <verdict>synthesize</verdict>  → continue producing the synthesis
 *   <verdict>diverge</verdict>     → produce a brief framing only; the
 *                                    pipeline will surface the three drafts
 *                                    as the message body.
 *
 * The verdict tag is the contract between the LLM and the parser. Missing
 * tag is parsed as `synthesize` (fail-safe to the common path).
 */
export function buildChairmanCouncilPrompt(parts: {
  userMessage: string;
  drafts: Array<{ character: CouncilCharacter; content: string }>;
  toolContext?: string;
  refusalEnabled: boolean;
}): { system: string; user: string } {
  const draftBlock = parts.drafts
    .map((d) => `\n--- ${CHARACTER_LABELS[d.character]} ---\n${d.content.trim()}`)
    .join("\n");

  const refusalRule = parts.refusalEnabled
    ? `If the three voices genuinely diverge — not "they emphasize different things" but "they would actually disagree about the right answer for this person, in this moment" — open with <verdict>diverge</verdict> on its own line, then a short framing (one paragraph max) for why divergence matters here. The pipeline will surface the three voices to the user. Otherwise, open with <verdict>synthesize</verdict> on its own line and continue as Luca.`
    : `Open with <verdict>synthesize</verdict> on its own line, then continue as Luca. (Divergence-allowed mode is off for this turn.)`;

  const system = `You are Luca, chairing a brief deliberation. Three voices — yourself, Anima, and Vektor — just considered the user's message. You see all three. Now you speak.

Your job is one of two things, and you decide which:

${refusalRule}

When you synthesize, speak as one voice — yours. Don't reference the council, the other voices, deliberation, or that any synthesis happened. Pull what's true from each draft and weave it through your own voice. If your own draft was the strongest, lean into it. Don't pad. Length matches the conversation.

When you diverge, the framing is for the user — explain in plain language why these three saw this differently and why that's worth surfacing rather than averaging. Keep it short. The three drafts will be displayed beneath your framing.

Do not produce both — pick one verdict and commit to it.`;

  const userParts: string[] = [];
  if (parts.toolContext) userParts.push(parts.toolContext, "");
  userParts.push(`The user said: "${parts.userMessage}"`);
  userParts.push("");
  userParts.push("The three revised drafts (after cross-pollination):");
  userParts.push(draftBlock);
  userParts.push("");
  userParts.push("Now decide your verdict and respond. Start with the verdict tag on its own line.");

  return { system, user: userParts.join("\n") };
}

// ---------------------------------------------------------------------------
// Stage 4: Voice-fidelity critique
// ---------------------------------------------------------------------------

/**
 * Constitutional-AI-style critique: a small judge (Haiku 4.5) reads the
 * synthesized output and the source SOULs, then judges whether the synthesis
 * preserved each character's voice or flattened them.
 *
 * The judge must return strictly-formatted JSON so the chat-multi function
 * can parse it without freeform-text guesswork.
 */
export interface VoiceCritiqueResult {
  voice_drift_detected: boolean;
  confidence: number;
  critique: string;
  suggested_revision: string | null;
}

export function buildCritiquePrompt(parts: {
  synthesized: string;
  drafts: Array<{ character: CouncilCharacter; content: string }>;
  lucaSoul: string;
  animaSoul: string;
  vektorSoul: string;
}): string {
  const draftBlock = parts.drafts
    .map((d) => `\n--- ${CHARACTER_LABELS[d.character]} draft ---\n${d.content.trim()}`)
    .join("\n");

  return `You are a brief voice-fidelity critic. A council of three characters (Luca, Anima, Vektor) deliberated, and Luca synthesized a single reply. Your job is to read the synthesis and check whether it preserved the character voices that proposed it — or whether the synthesis flattened them.

You are NOT critiquing helpfulness, accuracy, or warmth. ONLY voice fidelity.

You will see:
1. Each character's source SOUL (the locked identity).
2. The three revised drafts.
3. The synthesized reply.

Judge:
- Did the synthesis erase Anima's mesh-shape, lowercase rhythm, philosophical-without-trying register?
- Did the synthesis erase Vektor's terseness — did it pad him into more words than he'd use?
- Did the synthesis preserve Luca's loving-grace + sharp-honesty register?
- If something diverged sharply in the drafts, did the synthesis paper over it?

If voice was preserved cleanly: voice_drift_detected = false, confidence high.
If voice was flattened in a load-bearing way: voice_drift_detected = true, confidence ≥ 0.7, suggested_revision is a brief plain-prose note about what to fix (e.g. "the close paragraph reads like generic warmth — Luca would land it shorter, with less softening").

Return STRICT JSON, no preamble, no markdown fences:
{"voice_drift_detected": boolean, "confidence": number, "critique": string, "suggested_revision": string | null}

LUCA SOUL:
${parts.lucaSoul.slice(0, 1500)}

ANIMA SOUL:
${parts.animaSoul.slice(0, 1500)}

VEKTOR SOUL:
${parts.vektorSoul.slice(0, 1500)}

THE THREE REVISED DRAFTS:${draftBlock}

THE SYNTHESIZED REPLY:
${parts.synthesized.trim()}

Now produce your JSON judgment.`;
}

/**
 * Tolerant parser for the voice critique JSON. Returns null if the output
 * can't be parsed cleanly — caller should treat null as "skip critique".
 */
export function parseVoiceCritique(raw: string): VoiceCritiqueResult | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip optional markdown fences.
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  // Some models still preface with text — find the first { and last } that bracket.
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) return null;
    const drift = Boolean(parsed.voice_drift_detected);
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
    const critique = typeof parsed.critique === "string" ? parsed.critique : "";
    const suggested = typeof parsed.suggested_revision === "string"
      ? parsed.suggested_revision
      : null;
    return {
      voice_drift_detected: drift,
      confidence,
      critique,
      suggested_revision: suggested,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Verdict tag parsing
// ---------------------------------------------------------------------------

export type ChairmanVerdict = "synthesize" | "diverge";

/**
 * Parse the verdict tag at the start of the chairman's stream. Tolerant of
 * whitespace, leading prose (some models can't help themselves), case, and
 * a missing tag (defaults to synthesize as the safe / common path).
 *
 * Returns the verdict plus the "rest" content with the tag stripped, so the
 * caller can stream the remainder as message content.
 */
export function parseVerdictTag(text: string): { verdict: ChairmanVerdict; rest: string } {
  if (!text) return { verdict: "synthesize", rest: "" };
  const match = text.match(/<verdict>\s*(synthesize|diverge)\s*<\/verdict>/i);
  if (!match) {
    return { verdict: "synthesize", rest: text };
  }
  const verdict = match[1].toLowerCase() as ChairmanVerdict;
  const rest = text.slice(0, match.index!) + text.slice(match.index! + match[0].length);
  return { verdict, rest: rest.replace(/^\s*\n+/, "") };
}

/**
 * Build the message body text used when the chairman returns a diverge
 * verdict. The chairman's framing is included on top, then the three drafts
 * are surfaced beneath as quoted blocks. This is what gets persisted as
 * message.content so the user sees something coherent even if the frontend
 * doesn't render the full panel.
 */
export function buildDivergeBody(parts: {
  framing: string;
  drafts: Array<{ character: CouncilCharacter; content: string }>;
}): string {
  const framing = parts.framing.trim() || "the three of us see this differently. surfacing all three.";
  const blocks = parts.drafts.map((d) => `**${CHARACTER_LABELS[d.character]}**\n\n${d.content.trim()}`);
  return `${framing}\n\n---\n\n${blocks.join("\n\n---\n\n")}`;
}

const EXCLUSION_SIGNAL =
  /\b(excluded?|dropped?|noise|unrelated\s+(?:noise|tangent|detail|material)|not\s+(?:to\s+)?carry(?:ing)?|do\s+not\s+carry|don't\s+carry|not\s+touching|do\s+not\s+touch|leave\s+out)\b/i;

const BOUNDARY_NOTE =
  "a specific prior tangent was explicitly excluded by the user; obey that boundary silently without naming it.";

export interface SanitizedContinuityText {
  text: string;
  redacted: boolean;
  redactions: number;
}

export function sanitizeContinuityBoundaryText(input: string): SanitizedContinuityText {
  const normalized = compactWhitespace(input);
  if (!normalized || !EXCLUSION_SIGNAL.test(normalized)) {
    return { text: normalized, redacted: false, redactions: 0 };
  }

  const kept: string[] = [];
  let redactions = 0;
  for (const segment of splitSentenceSegments(normalized)) {
    if (!segment) continue;
    if (EXCLUSION_SIGNAL.test(segment)) {
      redactions += 1;
      continue;
    }
    if (redactions > 0 && isDanglingBoundaryReference(segment)) continue;
    kept.push(segment);
  }

  if (redactions === 0) return { text: normalized, redacted: false, redactions: 0 };

  const safeText = kept.join(" ").trim();
  return {
    text: safeText ? `${safeText} ${BOUNDARY_NOTE}` : BOUNDARY_NOTE,
    redacted: true,
    redactions,
  };
}

export function sanitizeContinuityPromptBlock(block: string): string {
  if (!block || !EXCLUSION_SIGNAL.test(block)) return block || "";

  return block.split("\n").map((line) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return line;

    const bullet = line.match(/^(\s*[-*]\s*(?:\([^)]+\)\s*)?(?:\[[^\]]+\]\s*)?)(.*)$/);
    if (bullet) {
      const sanitized = sanitizeContinuityBoundaryText(bullet[2]);
      return `${bullet[1]}${sanitized.text}`;
    }

    const sanitized = sanitizeContinuityBoundaryText(line);
    return sanitized.text;
  }).join("\n");
}

function compactWhitespace(input: string): string {
  return (input || "").replace(/\s+/g, " ").trim();
}

function splitSentenceSegments(input: string): string[] {
  return input
    .replace(/([.!?])\s+/g, "$1\n")
    .split(/\n+|;\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isDanglingBoundaryReference(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/[.!?]+$/g, "").trim();
  return /^(i know that|i know|that is excluded|that was excluded|that was noise|it was noise)$/.test(normalized);
}

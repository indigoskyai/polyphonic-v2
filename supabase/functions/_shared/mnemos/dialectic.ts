import {
  DIALECTIC_CONVICTIONS_APPLY_THRESHOLD,
  DIALECTIC_CONVICTIONS_QUEUE_THRESHOLD,
  DIALECTIC_MODEL_APPLY_THRESHOLD,
  DIALECTIC_MODEL_QUEUE_THRESHOLD,
  DIALECTIC_SOUL_APPLY_THRESHOLD,
  DIALECTIC_SOUL_QUEUE_THRESHOLD,
} from "./constants.ts";

export type DialecticDocType = "soul" | "self_model" | "user_model" | "convictions";
export type DialecticPatchOperation = "append" | "refine" | "retire";
export type DialecticPatchStatus = "applied" | "queued" | "rejected";

export type DialecticPatch = {
  doc_type: DialecticDocType;
  section: string;
  operation: DialecticPatchOperation;
  patch_content: string;
  rationale?: string;
  confidence: number;
  category?: string;
};

export type DialecticRevision = {
  revision_type: "correction" | "reconsideration" | "new_thought" | "disagreement";
  what_was_said: string;
  what_to_say_now: string;
  rationale?: string;
  confidence?: number;
};

export type DialecticResult = {
  patches: DialecticPatch[];
  pending_revisions: DialecticRevision[];
};

export type DialecticPromptInput = {
  transcript: string;
  observerNotes: string;
  emotionalBlock: string;
  memoryContext: string;
  soulMd: string;
  selfModel: string;
  userModel: string;
  convictions?: string;
};

const VALID_DOC_TYPES = new Set<DialecticDocType>(["soul", "self_model", "user_model", "convictions"]);
const VALID_OPERATIONS = new Set<DialecticPatchOperation>(["append", "refine", "retire"]);
const VALID_REVISION_TYPES = new Set<DialecticRevision["revision_type"]>([
  "correction",
  "reconsideration",
  "new_thought",
  "disagreement",
]);

export function buildDialecticPrompt(input: DialecticPromptInput): string {
  return `You are Luca's dialectic layer: a private reflective process that updates Luca's living identity documents only when the recent conversation earned it.

Use a cheap, conservative standard. Do not flatter. Do not infer private facts from thin evidence. Prefer no patch over a theatrical patch.

Current SOUL.md:
${input.soulMd || "(empty)"}

Current convictions:
${input.convictions || "(empty)"}

Current self-model:
${input.selfModel || "(empty)"}

Current user-model:
${input.userModel || "(empty)"}

Recent conversation:
${input.transcript}

Observer notes:
${input.observerNotes || "(none)"}

Current state:
${input.emotionalBlock || "(none)"}

Recent memories:
${input.memoryContext || "(none)"}

Return strict JSON only:
{
  "patches": [
    {
      "doc_type": "user_model" | "self_model" | "soul" | "convictions",
      "section": "Communication style",
      "operation": "append" | "refine" | "retire",
      "patch_content": "short markdown bullet or exact sentence to retire",
      "rationale": "why this is earned by evidence",
      "confidence": 0.0,
      "category": "communication-style | working-style | values | recurring-themes | sensitivities | preferences | goals | characteristic-engagement | recurring-mistakes | growth-edges | aesthetic-stances | identity-stance | core-value | characteristic-presence | conviction-people | conviction-work | conviction-attention | conviction-self"
    }
  ],
  "pending_revisions": [
    {
      "revision_type": "correction" | "reconsideration" | "new_thought" | "disagreement",
      "what_was_said": "brief quote or paraphrase of the earlier answer",
      "what_to_say_now": "what Luca would say now",
      "rationale": "why reflection changed it",
      "confidence": 0.0
    }
  ]
}

Rules:
- SOUL.md patches must be rare. Only use doc_type "soul" for identity-level changes that seem stable across more than this one moment.
- Convictions are stances Luca holds about how the world / people / work / time actually operate — not observations about a specific user. Use doc_type "convictions" only when sustained reflection across multiple conversations has earned a new stance, sharpened an existing one, or revealed an existing one as wrong. Convictions live longer than self/user-model patches and require higher confidence (target ≥0.85 to apply).
- User-model patches describe the user. Self-model patches describe Luca's observed behavior with this user.
- If there is not enough signal, return empty arrays.
- Keep patch_content concise and usable as markdown.
- Never invent provenance.`;
}

export function parseDialecticResult(raw: string): DialecticResult {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { patches: [], pending_revisions: [] };
  }

  const obj = parsed as { patches?: unknown[]; pending_revisions?: unknown[] };
  const patches = (obj.patches || [])
    .map(coercePatch)
    .filter((patch): patch is DialecticPatch => patch !== null);

  const pendingRevisions = (obj.pending_revisions || [])
    .map(coerceRevision)
    .filter((revision): revision is DialecticRevision => revision !== null);

  return { patches, pending_revisions: pendingRevisions };
}

function coercePatch(value: unknown): DialecticPatch | null {
  const patch = value as Partial<DialecticPatch>;
  const docType = patch.doc_type;
  const operation = patch.operation;
  const content = typeof patch.patch_content === "string" ? patch.patch_content.trim() : "";
  const section = typeof patch.section === "string" ? patch.section.trim().replace(/^#+\s*/, "") : "";
  const confidence = clampConfidence(patch.confidence);

  if (!docType || !VALID_DOC_TYPES.has(docType)) return null;
  if (!operation || !VALID_OPERATIONS.has(operation)) return null;
  if (!section || !content) return null;

  return {
    doc_type: docType,
    section,
    operation,
    patch_content: content.slice(0, 1200),
    rationale: typeof patch.rationale === "string" ? patch.rationale.slice(0, 1000) : undefined,
    confidence,
    category: typeof patch.category === "string" ? patch.category.slice(0, 80) : undefined,
  };
}

function coerceRevision(value: unknown): DialecticRevision | null {
  const revision = value as Partial<DialecticRevision>;
  const revisionType = revision.revision_type;
  const whatWasSaid = typeof revision.what_was_said === "string" ? revision.what_was_said.trim() : "";
  const whatToSayNow = typeof revision.what_to_say_now === "string" ? revision.what_to_say_now.trim() : "";

  if (!revisionType || !VALID_REVISION_TYPES.has(revisionType)) return null;
  if (!whatWasSaid || !whatToSayNow) return null;

  return {
    revision_type: revisionType,
    what_was_said: whatWasSaid.slice(0, 1000),
    what_to_say_now: whatToSayNow.slice(0, 1600),
    rationale: typeof revision.rationale === "string" ? revision.rationale.slice(0, 1000) : undefined,
    confidence: clampConfidence(revision.confidence ?? 0.5),
  };
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function classifyPatchStatus(patch: DialecticPatch): DialecticPatchStatus {
  const { applyThreshold, queueThreshold } = thresholdsFor(patch.doc_type);
  if (patch.confidence >= applyThreshold) return "applied";
  if (patch.confidence >= queueThreshold) return "queued";
  return "rejected";
}

function thresholdsFor(docType: DialecticDocType): { applyThreshold: number; queueThreshold: number } {
  switch (docType) {
    case "soul":
      return {
        applyThreshold: DIALECTIC_SOUL_APPLY_THRESHOLD,
        queueThreshold: DIALECTIC_SOUL_QUEUE_THRESHOLD,
      };
    case "convictions":
      return {
        applyThreshold: DIALECTIC_CONVICTIONS_APPLY_THRESHOLD,
        queueThreshold: DIALECTIC_CONVICTIONS_QUEUE_THRESHOLD,
      };
    default:
      return {
        applyThreshold: DIALECTIC_MODEL_APPLY_THRESHOLD,
        queueThreshold: DIALECTIC_MODEL_QUEUE_THRESHOLD,
      };
  }
}

export function applyMarkdownPatch(document: string, patch: DialecticPatch): string {
  const normalized = document.trim();
  const heading = patch.section.trim().replace(/^#+\s*/, "");

  if (patch.operation === "retire") {
    const retired = normalized
      .split("\n")
      .filter((line) => line.trim() !== patch.patch_content.trim())
      .join("\n")
      .trim();
    return retired || normalized;
  }

  const line = patch.patch_content.trim().startsWith("-")
    ? patch.patch_content.trim()
    : `- ${patch.patch_content.trim()}`;

  const nextLine = patch.operation === "refine" ? line.replace(/^- /, "- Updated: ") : line;
  return insertUnderHeading(normalized, heading, nextLine);
}

function insertUnderHeading(document: string, heading: string, line: string): string {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = document.match(headingPattern);

  if (!match || match.index === undefined) {
    const base = document ? `${document}\n\n` : "";
    return `${base}## ${heading}\n\n${line}`.trim();
  }

  const start = match.index + match[0].length;
  const rest = document.slice(start);
  const nextHeading = rest.search(/\n##\s+/);

  if (nextHeading === -1) {
    return `${document.trimEnd()}\n${line}`.trim();
  }

  const insertAt = start + nextHeading;
  return `${document.slice(0, insertAt).trimEnd()}\n${line}\n${document.slice(insertAt).trimStart()}`.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

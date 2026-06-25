// Backend mirror of the frontend's `src/lib/streamingArtifacts.ts`.
//
// The model the user is talking to authors renderable artifacts directly in its
// reply, as fenced code blocks (```html / ```svg / ```jsx / ```mermaid). The
// frontend already promotes those blocks to live ArtifactCards while streaming;
// this module re-derives the SAME set at message-save time so we can persist
// them to the `artifacts` table — otherwise the card vanishes on reload.
//
// Keep KIND_MAP + MIN_LINES + the promotion rule in lockstep with
// streamingArtifacts.ts (a drift test asserts they match). The one intentional
// difference: here we only match CLOSED fences, because the message is complete
// at save time and a half-open block is not a real artifact.

export type ArtifactKind = "html" | "svg" | "mermaid" | "react" | "markdown";

const KIND_MAP: Record<string, ArtifactKind> = {
  html: "html",
  svg: "svg",
  mermaid: "mermaid",
  jsx: "react",
  tsx: "react",
  markdown: "markdown",
  md: "markdown",
};

const MIN_LINES = 30;

export interface ExtractedArtifact {
  kind: ArtifactKind;
  title: string;
  content: string;
}

/**
 * Pull complete fenced renderable blocks out of a finished assistant message.
 * Mirrors the frontend promotion rule: only kinds in KIND_MAP qualify, and a
 * block must be either substantial (>= MIN_LINES) or visibly complete markup
 * (has a closing </html|svg|body> tag) so tiny snippets stay inline as code.
 */
export function extractArtifactsFromContent(source: string): ExtractedArtifact[] {
  if (!source) return [];
  // Require a closing fence — only persist complete blocks.
  const re = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  const out: ExtractedArtifact[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const lang = (match[1] || "").toLowerCase();
    const body = match[2] || "";
    const kind = KIND_MAP[lang];
    if (!kind) continue;
    const lines = body.split("\n").length;
    if (lines < MIN_LINES && !/<\/(html|svg|body)>/i.test(body)) continue;
    out.push({ kind, title: titleFor(kind, body), content: body.replace(/\n$/, "") });
  }
  return out;
}

function titleFor(kind: ArtifactKind, body: string): string {
  if (kind === "html") {
    const m = body.match(/<title>([^<]+)<\/title>/i);
    if (m) return m[1].trim();
    return "HTML preview";
  }
  if (kind === "svg") return "SVG preview";
  if (kind === "mermaid") return "Diagram";
  if (kind === "react") return "React preview";
  return "Artifact";
}

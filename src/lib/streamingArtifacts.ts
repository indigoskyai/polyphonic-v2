import type { Artifact, ArtifactKind } from '@/stores/artifactStore';

const KIND_MAP: Record<string, ArtifactKind> = {
  html: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
  jsx: 'react',
  tsx: 'react',
  markdown: 'markdown',
  md: 'markdown',
};

const MIN_LINES = 30;

/**
 * Scan in-progress streamed content for fenced blocks that should be
 * promoted to live artifact previews. Returns ephemeral Artifact-like
 * objects (id is a stable hash so re-renders are seamless).
 *
 * - For an *open* trailing fence, treat the partial body as in-progress
 *   so the artifact appears as soon as the model commits to a kind.
 * - Only kinds in KIND_MAP are eligible; tiny snippets stay inline as
 *   regular code blocks.
 */
export function extractStreamingArtifacts(
  source: string,
  ctx: { threadId: string; userId: string },
): Artifact[] {
  if (!source) return [];
  const re = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)(?:```|$)/g;
  const found: Artifact[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(source)) !== null) {
    const lang = (match[1] || '').toLowerCase();
    const body = match[2] || '';
    const kind = KIND_MAP[lang];
    if (!kind) { idx++; continue; }
    const lines = body.split('\n').length;
    // Allow shorter html/svg if they look complete (< full open).
    if (lines < MIN_LINES && !/<\/(html|svg|body)>/i.test(body)) { idx++; continue; }
    const id = `stream-${kind}-${idx}-${hashString(body.slice(0, 256))}`;
    found.push({
      id,
      user_id: ctx.userId,
      thread_id: ctx.threadId,
      source_message_id: null,
      kind,
      title: titleFor(kind, body),
      content: body,
      parent_artifact_id: null,
      version: 0,
      created_at: new Date().toISOString(),
    });
    idx++;
  }
  return found;
}

function titleFor(kind: ArtifactKind, body: string): string {
  if (kind === 'html') {
    const m = body.match(/<title>([^<]+)<\/title>/i);
    if (m) return m[1].trim();
    return 'HTML preview';
  }
  if (kind === 'svg') return 'SVG preview';
  if (kind === 'mermaid') return 'Diagram';
  if (kind === 'react') return 'React preview';
  return 'Artifact';
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

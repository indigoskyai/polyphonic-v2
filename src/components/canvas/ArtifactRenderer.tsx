import RichBody from '@/components/rich/RichBody';
import type { Artifact } from '@/stores/artifactStore';

function htmlDoc(content: string) {
  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) return content;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh; font-src https: data:;"></head><body>${content}</body></html>`;
}

export default function ArtifactRenderer({ artifact, compact = false }: { artifact: Artifact; compact?: boolean }) {
  const height = compact ? 260 : 620;

  if (artifact.kind === 'markdown') {
    return <RichBody source={artifact.content} />;
  }

  if (artifact.kind === 'html') {
    return (
      <iframe
        title={artifact.title || 'Artifact preview'}
        sandbox="allow-scripts"
        srcDoc={htmlDoc(artifact.content)}
        style={{ width: '100%', height, border: '1px solid var(--border-faint)', borderRadius: 8, background: '#fff' }}
      />
    );
  }

  if (artifact.kind === 'svg') {
    return (
      <iframe
        title={artifact.title || 'SVG preview'}
        sandbox=""
        srcDoc={htmlDoc(artifact.content)}
        style={{ width: '100%', height, border: '1px solid var(--border-faint)', borderRadius: 8, background: '#fff' }}
      />
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        color: 'var(--text-body)',
        background: 'var(--surface-muted)',
        border: '1px solid var(--border-faint)',
        borderRadius: 8,
        padding: 16,
        fontSize: 12,
        lineHeight: 1.6,
        maxHeight: height,
        overflow: 'auto',
      }}
    >
      {artifact.content}
    </pre>
  );
}

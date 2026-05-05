import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ArtifactRenderer from './ArtifactRenderer';
import { useArtifactStore, type Artifact } from '@/stores/artifactStore';

export default function CanvasPanel() {
  const { artifactId } = useParams();
  const loadOne = useArtifactStore((s) => s.loadOne);
  const current = useArtifactStore((s) => s.current);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSourceOpen(false);
    setLoadError(null);

    if (!artifactId) {
      setStatus('missing');
      return () => {
        cancelled = true;
      };
    }

    setStatus('loading');
    loadOne(artifactId)
      .then((artifact) => {
        if (cancelled) return;
        setStatus(artifact ? 'ready' : 'missing');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Could not load artifact', error);
        setLoadError(error instanceof Error ? error.message : String(error));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [artifactId, loadOne]);

  const artifact = status === 'ready' ? (current as Artifact | null) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="profile-page-frame" style={{ padding: '44px 48px 80px', maxWidth: 1120 }}>
        <div className="flex items-start justify-between gap-6" style={{ marginBottom: 28 }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-ghost)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              § L7 / canvas
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 42,
                lineHeight: 1,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {artifact?.title || 'Artifact'}
            </h1>
          </div>
          {artifact && (
            <button
              type="button"
              onClick={() => setSourceOpen((v) => !v)}
              style={{
                border: '1px solid var(--border-faint)',
                borderRadius: 8,
                background: 'var(--surface-raised)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 'var(--track-mono)',
                padding: '10px 12px',
                textTransform: 'uppercase',
              }}
            >
              {sourceOpen ? 'Preview' : 'Source'}
            </button>
          )}
        </div>

        {status === 'idle' || status === 'loading' ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading artifact...</p>
        ) : status === 'missing' ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: 14, lineHeight: 1.7 }}>
            Artifact not found. It may have been deleted or may belong to another thread.
          </p>
        ) : status === 'error' ? (
          <p style={{ color: 'var(--danger)', fontSize: 14, lineHeight: 1.7 }}>
            Could not load this artifact{loadError ? `: ${loadError}` : '.'}
          </p>
        ) : sourceOpen ? (
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
            }}
          >
            {artifact.content}
          </pre>
        ) : (
          <ArtifactRenderer artifact={artifact} />
        )}
      </div>
    </div>
  );
}

import { Code2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ArtifactRenderer from './ArtifactRenderer';
import type { Artifact } from '@/stores/artifactStore';

export default function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const navigate = useNavigate();

  return (
    <section
      style={{
        border: '1px solid var(--border-faint)',
        borderRadius: 8,
        background: 'var(--surface-raised)',
        padding: 14,
        marginTop: 14,
      }}
    >
      <header className="flex items-center gap-3" style={{ marginBottom: 12 }}>
        <Code2 size={16} style={{ color: 'var(--text-tertiary)' }} />
        <div className="min-w-0 flex-1">
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 520, overflowWrap: 'anywhere' }}>
            {artifact.title || 'Untitled artifact'}
          </div>
          <div style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase', marginTop: 3 }}>
            {artifact.kind} · v{artifact.version}
          </div>
        </div>
        <button
          type="button"
          title="Open artifact"
          aria-label="Open artifact"
          onClick={() => navigate(`/canvas/${artifact.id}`)}
          style={{
            width: 34,
            height: 34,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: '1px solid var(--border-faint)',
            background: 'var(--surface-muted)',
            color: 'var(--text-tertiary)',
          }}
        >
          <ExternalLink size={15} />
        </button>
      </header>
      <ArtifactRenderer artifact={artifact} compact />
    </section>
  );
}

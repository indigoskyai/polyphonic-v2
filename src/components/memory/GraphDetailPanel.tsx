import { useMemo } from 'react';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';

const TYPE_COLORS: Record<string, string> = {
  episodic: '#5b8aad',
  semantic: '#c9a87c',
  procedural: '#8ca89c',
  belief: '#a88cc9',
};

function formatCreated(iso: string) {
  try {
    const d = new Date(iso);
    return `created ${d.toLocaleString(undefined, { month: 'short', day: 'numeric' })}`;
  } catch {
    return '';
  }
}

function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type] || 'var(--text-ghost)';
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        padding: '2px 7px',
        borderRadius: 3,
        color,
        border: `1px solid ${color}40`,
        background: `${color}08`,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {type}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: 'var(--text-ghost)',
        marginBottom: 8,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </div>
  );
}

function KVRow({ k, v, mono = true }: { k: string; v: string | number; mono?: boolean }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        fontSize: 11,
        padding: '3px 0',
        gap: 12,
      }}
    >
      <span style={{ color: 'var(--text-ghost)', textTransform: 'lowercase' }}>{k}</span>
      <span
        style={{
          color: 'var(--text-secondary)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {v}
      </span>
    </div>
  );
}

interface Props {
  engram: Engram;
  onClose: () => void;
  onSelectEngram: (e: Engram) => void;
}

export default function GraphDetailPanel({ engram, onClose, onSelectEngram }: Props) {
  const { engrams, connections } = useMemoryStore();

  const connectedEngrams = useMemo(() => {
    const ids = new Set<string>();
    for (const c of connections) {
      if (c.source_id === engram.id) ids.add(c.target_id);
      else if (c.target_id === engram.id) ids.add(c.source_id);
    }
    return engrams.filter((e) => ids.has(e.id));
  }, [engram.id, connections, engrams]);

  // Pull encoding/source from source_context if available
  const ctx = (engram.source_context || {}) as Record<string, any>;
  const encodingDepth = ctx.encoding_depth ?? ctx.depth ?? null;
  const attention = ctx.attention ?? null;
  const sourceType = ctx.source_type ?? ctx.type ?? 'session';
  const sourceConfidence = ctx.confidence ?? null;

  return (
    <div
      style={{
        width: 360,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        overflow: 'auto',
        animation: 'viewFadeIn 0.2s var(--ease-out) both',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between"
        style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex flex-col gap-1.5">
          <TypeChip type={engram.engram_type} />
          <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
            {formatCreated(engram.created_at)}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-ghost)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 18px' }}>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text-body)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {engram.content}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
        <SectionLabel>Metrics</SectionLabel>
        <KVRow k="strength" v={engram.strength.toFixed(2)} />
        <KVRow k="stability" v={engram.stability.toFixed(2)} />
        <KVRow k="accessibility" v={engram.accessibility.toFixed(2)} />
      </div>

      {/* Encoding */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
        <SectionLabel>Encoding</SectionLabel>
        <KVRow
          k="depth"
          v={
            encodingDepth != null
              ? typeof encodingDepth === 'number'
                ? encodingDepth.toFixed(2)
                : String(encodingDepth)
              : engram.stability > 0.6
              ? 'deep'
              : engram.stability > 0.3
              ? 'moderate'
              : 'shallow'
          }
          mono={false}
        />
        <KVRow k="surprise" v={engram.surprise_score.toFixed(2)} />
        <KVRow k="attention" v={attention != null ? Number(attention).toFixed(2) : engram.accessibility.toFixed(2)} />
      </div>

      {/* Source */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
        <SectionLabel>Source</SectionLabel>
        <KVRow k="type" v={String(sourceType)} mono={false} />
        {sourceConfidence != null && <KVRow k="confidence" v={Number(sourceConfidence).toFixed(2)} />}
        <KVRow k="state" v={engram.state} mono={false} />
        <KVRow k="accessed" v={`${engram.access_count}×`} />
      </div>

      {/* Tags */}
      {engram.tags && engram.tags.length > 0 && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <SectionLabel>Tags</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {engram.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: 'var(--bg-deep)',
                  color: 'var(--text-ghost)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Connections */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
        <SectionLabel>
          Connections ({connectedEngrams.length})
        </SectionLabel>
        {connectedEngrams.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-whisper)' }}>No connections.</div>
        ) : (
          <div className="flex flex-col" style={{ gap: 1 }}>
            {connectedEngrams.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelectEngram(e)}
                className="text-left"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid var(--border-faint)',
                  padding: '10px 0',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--overlay-hover)')}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center justify-between">
                  <TypeChip type={e.engram_type} />
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--text-whisper)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {e.strength.toFixed(2)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: 'var(--text-body)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {e.content}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

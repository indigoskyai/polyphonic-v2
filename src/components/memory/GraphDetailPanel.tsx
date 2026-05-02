import { useMemo } from 'react';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';

function shortId(id: string) {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function formatCreated(iso: string) {
  try {
    const d = new Date(iso);
    const date = d.toLocaleString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} · ${time}`;
  } catch {
    return '';
  }
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="s-bar">
      <span className="s-bar-label">{label}</span>
      <div className="s-bar-track">
        <div className="s-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="s-bar-val">{value.toFixed(2)}</span>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: 'var(--text-whisper)',
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-soft)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {v}
      </span>
    </div>
  );
}

function PanelEye({ left, right }: { left: string; right?: string }) {
  return (
    <div className="s-panel-eye" style={{ marginBottom: 10 }}>
      <span>{left}</span>
      {right && <span className="right">{right}</span>}
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

  const ctx = (engram.source_context || {}) as Record<string, any>;
  const encodingDepth = ctx.encoding_depth ?? ctx.depth ?? null;
  const attention = ctx.attention ?? null;
  const sourceType = ctx.source_type ?? ctx.type ?? 'session';
  const sourceConfidence = ctx.confidence ?? null;

  return (
    <aside
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: '1px solid var(--hairline)',
        background: 'var(--bg-surface, var(--bg-elevated))',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        animation: 'viewFadeIn 0.2s var(--ease-out) both',
      }}
    >
      {/* Folio-style header */}
      <div
        style={{
          padding: '14px 22px',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: 'var(--text-whisper)',
        }}
      >
        <span>ENGRAM · {shortId(engram.id)}</span>
        <button
          onClick={onClose}
          aria-label="Close detail"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-soft)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
            letterSpacing: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Hero — type + timestamp + content */}
      <div style={{ padding: '22px 22px 20px' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
          <span className="s-type-chip" data-state={engram.state}>
            {engram.engram_type}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              color: 'var(--text-whisper)',
            }}
          >
            {formatCreated(engram.created_at)}
          </span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--ink)',
            letterSpacing: 'var(--track-tight)',
          }}
        >
          {engram.content}
        </div>
      </div>

      {/* Metrics — three-bar ladder matching engram cards */}
      <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
        <PanelEye left="// METRICS" right={`${engram.access_count}× accessed`} />
        <div className="flex flex-col" style={{ gap: 8 }}>
          <Bar label="STR" value={engram.strength} />
          <Bar label="STB" value={engram.stability} />
          <Bar label="ACC" value={engram.accessibility} />
        </div>
      </div>

      {/* Encoding */}
      <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
        <PanelEye left="// ENCODING" />
        <KV
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
        />
        <KV k="surprise" v={engram.surprise_score.toFixed(2)} />
        <KV
          k="attention"
          v={attention != null ? Number(attention).toFixed(2) : engram.accessibility.toFixed(2)}
        />
      </div>

      {/* Source */}
      <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
        <PanelEye left="// SOURCE" />
        <KV k="type" v={String(sourceType)} />
        {sourceConfidence != null && <KV k="confidence" v={Number(sourceConfidence).toFixed(2)} />}
        <KV k="state" v={engram.state} />
      </div>

      {/* Tags */}
      {engram.tags && engram.tags.length > 0 && (
        <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
          <PanelEye left="// TAGS" right={`${engram.tags.length}`} />
          <div className="flex flex-wrap gap-1.5">
            {engram.tags.map((t) => (
              <span key={t} className="s-type-chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Connections */}
      <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
        <PanelEye left="// CONNECTIONS" right={`${connectedEngrams.length}`} />
        {connectedEngrams.length === 0 ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-whisper)',
              padding: '8px 0',
            }}
          >
            No outgoing or incoming links.
          </div>
        ) : (
          <div className="flex flex-col">
            {connectedEngrams.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelectEngram(e)}
                className="s-engram text-left"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid var(--hairline)',
                  padding: '12px 0',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="s-type-chip" data-state={e.state}>
                    {e.engram_type}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-whisper)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {e.strength.toFixed(2)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: 'var(--text-soft)',
                    letterSpacing: 'var(--track-tight)',
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
    </aside>
  );
}

/**
 * GraphDetailPanel — Round-2 engram inspector.
 *
 * Mockup parity: header `MEMORY / #ENGRAM_XXXX  ESC ×`, eyebrow
 * `# 0X · MEMORY · {TYPE}`, bold title (truncated content), chip row
 * (type · state · N connections), CONTENT body, PROVENANCE rows.
 *
 * No metric bars / encoding section — those live on the Engrams stream cards.
 */
import { useMemo } from 'react';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';

function shortId(id: string) {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

function formatCreated(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return '';
  }
}

function truncate(s: string, n: number) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

function ProvRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        gap: 16,
        padding: '10px 0',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: 'var(--text-whisper)',
          lineHeight: 1.3,
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 'var(--track-folio)',
        textTransform: 'uppercase',
        color: 'var(--text-whisper)',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

interface Props {
  engram: Engram;
  onClose: () => void;
  onSelectEngram?: (e: Engram) => void;
  /** Index for `# 0X` eyebrow. Defaults to 02 to mirror the mockup. */
  index?: number;
}

export default function GraphDetailPanel({ engram, onClose, index = 2 }: Props) {
  const { connections } = useMemoryStore();

  const connectionCount = useMemo(
    () => connections.filter((c) => c.source_id === engram.id || c.target_id === engram.id).length,
    [engram.id, connections]
  );

  const ctx = (engram.source_context || {}) as Record<string, unknown>;
  const sourceThread = (ctx.thread_id as string | undefined) ?? (ctx.source_thread as string | undefined) ?? null;
  const agent = (ctx.agent as string | undefined) ?? 'luca';
  const numStr = String(index).padStart(2, '0');

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
      {/* Header — MEMORY / #ENGRAM_XXXX   ESC × */}
      <div
        style={{
          padding: '18px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          color: 'var(--text-whisper)',
        }}
      >
        <span>
          MEMORY <span style={{ opacity: 0.55, padding: '0 4px' }}>/</span>{' '}
          <span style={{ color: 'var(--text-soft)' }}>#ENGRAM_{shortId(engram.id)}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-whisper)' }}>ESC</span>
          <button
            onClick={onClose}
            aria-label="Close detail"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-soft)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 2,
              letterSpacing: 0,
            }}
          >
            ×
          </button>
        </span>
      </div>

      {/* Hero — eyebrow + title + chip row */}
      <div style={{ padding: '8px 22px 22px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-folio)',
            textTransform: 'uppercase',
            color: 'var(--text-whisper)',
            marginBottom: 18,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span style={{ color: 'var(--text-soft)' }}># {numStr}</span>
          <span>·</span>
          <span>Memory</span>
          <span>·</span>
          <span>{engram.engram_type}</span>
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: 22,
            lineHeight: 1.22,
            letterSpacing: '-0.01em',
            color: 'var(--ink, var(--text-primary))',
            margin: 0,
            marginBottom: 18,
          }}
        >
          {truncate(engram.content, 80)}
        </h2>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <span className="s-type-chip" data-state={engram.state}>
            {engram.engram_type}
          </span>
          <span className="s-type-chip">{engram.state}</span>
          <span className="s-type-chip">{connectionCount} connections</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '22px 22px 24px', borderTop: '1px solid var(--hairline)' }}>
        <SectionLabel>Content</SectionLabel>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13.5,
            lineHeight: 1.65,
            color: 'var(--text-soft)',
            letterSpacing: 'var(--track-tight)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {engram.content}
        </div>
      </div>

      {/* Provenance */}
      <div style={{ padding: '22px 22px 24px', borderTop: '1px solid var(--hairline)' }}>
        <SectionLabel>Provenance</SectionLabel>
        <ProvRow
          k="Source Thread"
          v={
            sourceThread ? (
              <span>{shortId(sourceThread)}</span>
            ) : (
              <span style={{ color: 'var(--text-whisper)' }}>no thread</span>
            )
          }
        />
        <ProvRow k="Created" v={formatCreated(engram.created_at)} />
        <ProvRow
          k="Agent"
          v={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--text-soft)',
                  display: 'inline-block',
                }}
              />
              <span style={{ textTransform: 'uppercase', letterSpacing: 'var(--track-folio)' }}>
                {agent}
              </span>
            </span>
          }
        />
      </div>

      {/* Tags (only if present, kept compact) */}
      {engram.tags && engram.tags.length > 0 && (
        <div style={{ padding: '22px 22px 24px', borderTop: '1px solid var(--hairline)' }}>
          <SectionLabel>Tags</SectionLabel>
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {engram.tags.map((t) => (
              <span key={t} className="s-type-chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

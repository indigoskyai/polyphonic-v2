/**
 * GraphDetailPanel — Engram inspector.
 *
 * Mirrors the ThreadDetailDrawer system (DrawerHeader / Crumb / Title /
 * Section / SectionLabel / Footer / Pill primitives), but rendered INLINE
 * inside the Memory view layout — no portal, no backdrop blur.
 */
import { useMemo } from 'react';
import {
  DrawerHeader,
  DrawerCrumb,
  DrawerTitle,
  DrawerEscChip,
  DrawerCloseBtn,
  DrawerBody,
  DrawerSection,
  DrawerSectionLabel,
  DrawerFooter,
  DrawerFooterSep,
  Pill,
} from '@/components/ui/luca';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';

function shortId(id: string) {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function absTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

interface Props {
  engram: Engram;
  onClose: () => void;
  onSelectEngram?: (e: Engram) => void;
}

export default function GraphDetailPanel({ engram, onClose, onSelectEngram }: Props) {
  const { connections, engrams } = useMemoryStore();

  const linked = useMemo(() => {
    const ids = new Set<string>();
    for (const c of connections) {
      if (c.source_id === engram.id) ids.add(c.target_id);
      else if (c.target_id === engram.id) ids.add(c.source_id);
    }
    return engrams.filter((e) => ids.has(e.id));
  }, [engram.id, connections, engrams]);

  const ctx = (engram.source_context || {}) as Record<string, unknown>;
  const sourceThread = (ctx.thread_id as string | undefined) ?? (ctx.source_thread as string | undefined) ?? null;
  const agent = (ctx.agent as string | undefined) ?? 'luca';

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(engram, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engram-${engram.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      style={{
        width: 'var(--drawer-width, 380px)',
        flexShrink: 0,
        background: 'var(--canvas)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both',
      }}
      role="complementary"
      aria-label="Engram detail"
    >
      <DrawerHeader>
        <div className="drawer-header-col">
          <DrawerCrumb num={`№ ${shortId(engram.id)}`} label="Engram" />
          <DrawerTitle>{engram.content.length > 80 ? engram.content.slice(0, 80).trimEnd() + '…' : engram.content}</DrawerTitle>
        </div>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={onClose} />
      </DrawerHeader>

      <DrawerBody>
        <DrawerSection>
          <DrawerSectionLabel>METADATA</DrawerSectionLabel>
          <div className="meta-kv">
            <div className="meta-kv__row"><span className="meta-kv__k">type</span><span className="meta-kv__v">{engram.engram_type}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">state</span><span className="meta-kv__v">{engram.state}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">created</span><span className="meta-kv__v">{absTime(engram.created_at)} · {relativeTime(engram.created_at)}</span></div>
            {engram.last_accessed_at && (
              <div className="meta-kv__row"><span className="meta-kv__k">accessed</span><span className="meta-kv__v">{relativeTime(engram.last_accessed_at)}</span></div>
            )}
            <div className="meta-kv__row"><span className="meta-kv__k">strength</span><span className="meta-kv__v">{(engram.strength ?? 0).toFixed(2)}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">stability</span><span className="meta-kv__v">{(engram.stability ?? 0).toFixed(2)}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">accessibility</span><span className="meta-kv__v">{(engram.accessibility ?? 0).toFixed(2)}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">connections</span><span className="meta-kv__v">{linked.length}</span></div>
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>CONTENT</DrawerSectionLabel>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              letterSpacing: 'var(--track-tight)',
            }}
          >
            {engram.content}
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>PROVENANCE</DrawerSectionLabel>
          <div className="meta-kv">
            <div className="meta-kv__row">
              <span className="meta-kv__k">source thread</span>
              <span className="meta-kv__v">{sourceThread ? shortId(sourceThread) : <span style={{ color: 'var(--text-whisper)' }}>—</span>}</span>
            </div>
            <div className="meta-kv__row"><span className="meta-kv__k">agent</span><span className="meta-kv__v">{agent}</span></div>
            {typeof ctx.encoding_depth === 'number' && (
              <div className="meta-kv__row"><span className="meta-kv__k">depth</span><span className="meta-kv__v">{(ctx.encoding_depth as number).toFixed(2)}</span></div>
            )}
            {typeof ctx.surprise === 'number' && (
              <div className="meta-kv__row"><span className="meta-kv__k">surprise</span><span className="meta-kv__v">{(ctx.surprise as number).toFixed(2)}</span></div>
            )}
          </div>
        </DrawerSection>

        {linked.length > 0 && (
          <DrawerSection>
            <DrawerSectionLabel>CONNECTIONS · {linked.length}</DrawerSectionLabel>
            <div className="participant-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {linked.slice(0, 8).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelectEngram?.(e)}
                  style={{
                    textAlign: 'left',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-whisper)', textTransform: 'uppercase', letterSpacing: 'var(--track-folio)', marginBottom: 4 }}>
                    {e.engram_type} · {shortId(e.id)}
                  </div>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {e.content}
                  </div>
                </button>
              ))}
            </div>
          </DrawerSection>
        )}

        {engram.tags && engram.tags.length > 0 && (
          <DrawerSection>
            <DrawerSectionLabel>TAGS</DrawerSectionLabel>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {engram.tags.map((t) => (
                <span key={t} className="s-type-chip">{t}</span>
              ))}
            </div>
          </DrawerSection>
        )}
      </DrawerBody>

      <DrawerFooter>
        <Pill variant="ghost" size="xs" onClick={exportJSON}>Export</Pill>
        <DrawerFooterSep />
        <Pill variant="ghost" size="xs" onClick={onClose}>Close</Pill>
      </DrawerFooter>
    </aside>
  );
}

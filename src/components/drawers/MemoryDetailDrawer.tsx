/**
 * MemoryDetailDrawer — Engram inspector that uses the SAME drawer artifact
 * as ThreadDetailDrawer (chrome header + title section + sectioned body +
 * footer actions). Differs only in payload-specific content.
 *
 * Mounted by the global DrawerRouter. The drawer floats over the page; for
 * memory-detail we render *without* a backdrop so the underlying graph stays
 * visible and uninterrupted.
 */
import { useEffect, useMemo } from 'react';
import {
  DrawerHeader,
  DrawerCrumb,
  DrawerEscChip,
  DrawerCloseBtn,
  DrawerBody,
  DrawerSection,
  DrawerSectionLabel,
  DrawerFooter,
  DrawerFooterSep,
  Pill,
} from '@/components/ui/luca';
import { useDrawerStore } from '@/stores/drawerStore';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

interface MemoryDetailPayload {
  engramId?: string;
}

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

export default function MemoryDetailDrawer() {
  const close = useDrawerStore((s) => s.close);
  const open = useDrawerStore((s) => s.open);
  const payload = useDrawerStore((s) => s.payload) as MemoryDetailPayload | null;
  const engramId = payload?.engramId;

  const { engrams, connections, setSelectedEngram } = useMemoryStore();

  // Closing via ESC / backdrop / route change unmounts this component — clear
  // the graph selection so the node deselects too.
  useEffect(() => {
    return () => { setSelectedEngram(null); };
  }, [setSelectedEngram]);

  const engram = useMemo<Engram | null>(
    () => engrams.find((e) => e.id === engramId) ?? null,
    [engrams, engramId],
  );

  const linked = useMemo(() => {
    if (!engram) return [];
    const ids = new Set<string>();
    for (const c of connections) {
      if (c.source_id === engram.id) ids.add(c.target_id);
      else if (c.target_id === engram.id) ids.add(c.source_id);
    }
    return engrams.filter((e) => ids.has(e.id));
  }, [engram, connections, engrams]);

  if (!engram) {
    return (
      <>
        <DrawerHeader>
          <span className="drawer-crumb">
            <span>Memory</span>
            <span className="drawer-crumb-sep"> / </span>
            <span className="drawer-crumb-num">—</span>
          </span>
          <DrawerEscChip />
          <DrawerCloseBtn onClick={() => { setSelectedEngram(null); close(); }} />
        </DrawerHeader>
        <DrawerBody>
          <DrawerSection>
            <p style={{ color: 'var(--text-ghost)', fontSize: 13 }}>Engram not found.</p>
          </DrawerSection>
        </DrawerBody>
      </>
    );
  }

  const id6 = shortId(engram.id);
  const ctx = (engram.source_context || {}) as Record<string, unknown>;
  const sourceThread = (ctx.thread_id as string | undefined) ?? (ctx.source_thread as string | undefined) ?? null;
  // Engrams are stored with a top-level agent_id; resolve to the human-readable
  // name via availableAgents so custom agents don't get mislabeled as "Luca".
  const availableAgents = useAgentScopeStore.getState().availableAgents;
  const agentId = engram.agent_id || (ctx.agent as string | undefined) || 'luca';
  const agent = availableAgents.find((a) => a.id === agentId)?.name || agentId;
  const titleText = engram.content.length > 140
    ? engram.content.slice(0, 140).replace(/\s+\S*$/, '').trimEnd() + '…'
    : engram.content;


  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(engram, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engram-${engram.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setSelectedEngram(null);
    close();
  };

  return (
    <>
      {/* ─── Drawer chrome header (matches thread-detail artifact) ─── */}
      <DrawerHeader>
        <span className="drawer-crumb">
          <span>Memory</span>
          <span className="drawer-crumb-sep"> / </span>
          <span className="drawer-crumb-num">№ {id6}</span>
        </span>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={handleClose} />
      </DrawerHeader>

      {/* ─── Title section: eyebrow + large title + status pills ─── */}
      <div className="drawer-title-section">
        <div className="drawer-eyebrow">
          <span className="drawer-eyebrow-num">№ {id6}</span>
          <span className="sep">/</span>
          <span>Memory</span>
          <span className="sep">/</span>
          <span>{engram.engram_type}</span>
        </div>
        <h2 className="drawer-title">{titleText}</h2>
        <div className="drawer-status-row">
          <span className={`status-pill primary${engram.state === 'active' ? ' active' : ''}`}>
            <span className="pill-dot" />
            {engram.state}
          </span>
          <span className="status-pill secondary">
            <span className="pill-dot" />
            {engram.engram_type}
          </span>
          {linked.length > 0 && (
            <span className="status-pill secondary">
              <span className="pill-dot" />
              {linked.length} connection{linked.length === 1 ? '' : 's'}
            </span>
          )}
          {engram.content_integrity_status === 'suspect' && (
            <span
              className="status-pill secondary integrity-suspect"
              title={engram.content_integrity_reason || 'This legacy entry may end mid-sentence.'}
            >
              <span className="pill-dot" />
              review legacy text
            </span>
          )}
        </div>
      </div>

      {/* ─── Body sections ─── */}
      <DrawerBody>
        <DrawerSection>
          <DrawerSectionLabel>CONTENT</DrawerSectionLabel>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              lineHeight: 1.65,
              color: 'var(--text-body)',
              whiteSpace: 'pre-wrap',
              letterSpacing: 'var(--track-body)',
            }}
          >
            {engram.content}
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>METADATA</DrawerSectionLabel>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">Type</span>
              <span className="kv-value ink">{engram.engram_type}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">State</span>
              <span className="kv-value">{engram.state}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Created</span>
              <span className="kv-value">
                {absTime(engram.created_at)}
                <span className="kv-value-rel">{relativeTime(engram.created_at)}</span>
              </span>
            </div>
            {engram.last_accessed_at && (
              <div className="kv-row">
                <span className="kv-label">Accessed</span>
                <span className="kv-value">{relativeTime(engram.last_accessed_at)}</span>
              </div>
            )}
            <div className="kv-row">
              <span className="kv-label">Strength</span>
              <span className="kv-value ink">{(engram.strength ?? 0).toFixed(2)}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Stability</span>
              <span className="kv-value">{(engram.stability ?? 0).toFixed(2)}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Access</span>
              <span className="kv-value">{(engram.accessibility ?? 0).toFixed(2)}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Accessed</span>
              <span className="kv-value">{engram.access_count ?? 0}×</span>
            </div>
            {engram.content_integrity_status === 'suspect' && (
              <div className="kv-row">
                <span className="kv-label">Integrity</span>
                <span className="kv-value">Possible legacy truncation · preserved for review</span>
              </div>
            )}
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>PROVENANCE</DrawerSectionLabel>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">Source</span>
              <span className="kv-value">
                {sourceThread ? `thread · ${shortId(sourceThread)}` : <span style={{ color: 'var(--text-whisper)' }}>—</span>}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Agent</span>
              <span className="kv-value">{agent}</span>
            </div>
            {typeof ctx.encoding_depth === 'number' && (
              <div className="kv-row">
                <span className="kv-label">Depth</span>
                <span className="kv-value">{(ctx.encoding_depth as number).toFixed(2)}</span>
              </div>
            )}
            {typeof ctx.surprise === 'number' && (
              <div className="kv-row">
                <span className="kv-label">Surprise</span>
                <span className="kv-value">{(ctx.surprise as number).toFixed(2)}</span>
              </div>
            )}
          </div>
        </DrawerSection>

        {linked.length > 0 && (
          <DrawerSection>
            <div className="drawer-section-label">
              <span className="drawer-section-label-text">Connections</span>
              <span className="drawer-section-label-count">· {linked.length}</span>
            </div>
            <div className="participant-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {linked.slice(0, 8).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setSelectedEngram(e);
                    open('memory-detail', { engramId: e.id });
                  }}
                  style={{
                    textAlign: 'left',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-faint)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    color: 'var(--text-body)',
                    fontSize: 12,
                    lineHeight: 1.45,
                    transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
                  }}
                  onMouseEnter={(ev) => {
                    ev.currentTarget.style.background = 'var(--surface-2)';
                    ev.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                  onMouseLeave={(ev) => {
                    ev.currentTarget.style.background = 'var(--surface-1)';
                    ev.currentTarget.style.borderColor = 'var(--border-faint)';
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      color: 'var(--text-whisper)', textTransform: 'uppercase',
                      letterSpacing: 'var(--track-folio)', marginBottom: 4,
                    }}
                  >
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
        <Pill variant="ghost" size="xs" onClick={handleClose}>Close</Pill>
      </DrawerFooter>
    </>
  );
}

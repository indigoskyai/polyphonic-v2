/**
 * JournalView - the primary notebook for an agent's inner life.
 *
 * Mind keeps the diagnostic streams. Journal gives users one readable,
 * chronological feed across journals, thoughts, dreams, insights, beliefs,
 * and selected activity.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import MindStreamShell from '@/components/mind/MindStreamShell';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import {
  buildNotebookItems,
  filterNotebookItems,
  groupNotebookItemsByDay,
  NOTEBOOK_FILTERS,
  type NotebookFilter,
  type NotebookItem,
} from '@/lib/notebook';

const KIND_TONE: Record<NotebookItem['kind'], string> = {
  journal: 'var(--tone-journal)',
  thought: 'var(--tone-thought)',
  question: 'var(--tone-question)',
  wandering: 'var(--tone-wandering)',
  dream: 'var(--tone-dream)',
  insight: 'var(--tone-insight)',
  reflection: 'var(--tone-reflection)',
  belief: 'var(--tone-belief)',
  activity: 'var(--tone-activity)',
};

function isNotebookFilter(value: string | null): value is NotebookFilter {
  return !!value && NOTEBOOK_FILTERS.some((option) => option.id === value);
}

function timeLabel(date: string): string {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fullTimeLabel(date: string): string {
  return new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function confidenceLabel(score?: number): string | null {
  if (typeof score !== 'number') return null;
  return score.toFixed(2);
}

function sourceLabel(source: NotebookItem['source']): string {
  return source.replace(/_/g, ' ');
}

export default function JournalView() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get('view');
  // Same view, two routes: /notebook (simplified vocabulary) and /journal
  // (studio vocabulary). The data and component are identical; only the
  // surface label adapts. This avoids two near-duplicate pages drifting.
  const onNotebookRoute = location.pathname.startsWith('/notebook');
  const surfaceLabel = onNotebookRoute ? 'Notebook' : 'Journal';
  const surfaceEyebrow = onNotebookRoute ? 'NOTEBOOK' : 'JOURNAL';
  const {
    load,
    loadMindData,
    subscribe,
    journalEntries,
    thoughts,
    dreams,
    insights,
    reflections,
    wanderings,
    beliefs,
    activityLog,
  } = useCognitiveStore();
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const activeAgentName = useAgentScopeStore((s) => s.availableAgents.find((a) => a.id === s.activeAgentId)?.name ?? 'Luca');
  const filter: NotebookFilter = isNotebookFilter(requestedFilter) ? requestedFilter : 'all';
  const [query, setQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const setNotebookFilter = useCallback(
    (value: NotebookFilter) => {
      const next = new URLSearchParams(searchParams);
      if (value === 'all') {
        next.delete('view');
      } else {
        next.set('view', value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (user) {
      load(user.id, activeAgentId);
      loadMindData(user.id, activeAgentId);
      const unsub = subscribe(user.id, activeAgentId);
      return unsub;
    }
  }, [user, activeAgentId, load, loadMindData, subscribe]);

  const notebookItems = useMemo(() => buildNotebookItems({
    journalEntries,
    thoughts,
    dreams,
    insights,
    reflections,
    wanderings,
    beliefs,
    activityLog,
  }), [activityLog, beliefs, dreams, insights, journalEntries, reflections, thoughts, wanderings]);

  const visible = useMemo(
    () => filterNotebookItems(notebookItems, filter, query),
    [filter, notebookItems, query],
  );

  const grouped = useMemo(() => groupNotebookItemsByDay(visible), [visible]);
  const selectedItem = useMemo(
    () => notebookItems.find((item) => item.id === selectedItemId) ?? null,
    [notebookItems, selectedItemId],
  );
  const closeDetail = useCallback(() => setSelectedItemId(null), []);

  useDialogFocus({
    active: !!selectedItem,
    containerRef: detailRef,
    initialFocusRef: closeButtonRef,
    onEscape: closeDetail,
  });

  useEffect(() => {
    if (selectedItemId && !selectedItem) {
      setSelectedItemId(null);
    }
  }, [selectedItem, selectedItemId]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: 0 }}>
        <MindStreamShell
          num="08"
          streamLabel={surfaceEyebrow}
          title={surfaceLabel}
          subtitle={`${notebookItems.length} notes. ${activeAgentName}'s ${surfaceLabel.toLowerCase()} across journal, dreams, thoughts, reflections, beliefs, and activity.`}
          searchPlaceholder={`Search ${surfaceLabel.toLowerCase()}…`}
          filter={filter}
          onFilterChange={(value) => setNotebookFilter(value as NotebookFilter)}
          filters={NOTEBOOK_FILTERS}
          query={query}
          onQueryChange={setQuery}
        >
          {visible.length === 0 ? (
            <div className="s-empty">
              {notebookItems.length === 0
                ? `Nothing in the ${surfaceLabel.toLowerCase()} yet. As ${activeAgentName} thinks, journals, dreams, and reflects, those entries gather here.`
                : 'No entries match this view.'}
            </div>
          ) : (
            <div style={{ maxWidth: 820, margin: '0 auto', padding: '8px 24px 80px' }}>
              {Array.from(grouped.entries()).map(([date, entries]) => (
                <section key={date} style={{ marginBottom: 52 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      marginBottom: 20,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        fontWeight: 500,
                        letterSpacing: 'var(--track-folio)',
                        color: 'var(--text-soft)',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {date}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-faint)', opacity: 0.75 }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        fontWeight: 500,
                        letterSpacing: 'var(--track-folio)',
                        color: 'var(--text-whisper)',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {entries.length} {entries.length === 1 ? 'note' : 'notes'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {entries.map((item) => {
                      const tone = KIND_TONE[item.kind];
                      const score = confidenceLabel(item.salience);
                      const safeItemId = item.id.replace(/[^a-zA-Z0-9_-]/g, '-');
                      const detailDialogId = `journal-detail-dialog-${safeItemId}`;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="journal-entry-card"
                          aria-haspopup="dialog"
                          aria-controls={selectedItemId === item.id ? detailDialogId : undefined}
                          aria-label={`Open ${item.title} ${item.label} entry from ${fullTimeLabel(item.created_at)}`}
                          onClick={() => setSelectedItemId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedItemId(item.id);
                            }
                          }}
                        >
                          <span className="journal-card-head">
                            <span style={{ minWidth: 0 }}>
                              <span className="journal-card-kind-line">
                                <span
                                  className="journal-kind-dot"
                                  style={{
                                    background: tone,
                                    boxShadow: `0 0 18px color-mix(in srgb, ${tone} 33%, transparent)`,
                                  }}
                                />
                                <span
                                  className="journal-card-kind"
                                  style={{
                                    color: tone,
                                  }}
                                >
                                  {item.label}
                                </span>
                                {item.meta && (
                                  <span className="journal-card-chip">
                                    {item.meta}
                                  </span>
                                )}
                                <span className="journal-card-chip">{sourceLabel(item.source)}</span>
                              </span>
                              <span className="journal-card-title">
                                {item.title}
                              </span>
                            </span>

                            <span className="journal-card-stamp">
                              {score && <span>{score}</span>}
                              <span>{timeLabel(item.created_at)}</span>
                            </span>
                          </span>

                          <span className="journal-card-body">
                            {item.body}
                          </span>

                          {item.tags && item.tags.length > 0 && (
                            <span className="s-row-tags" style={{ marginTop: 16 }}>
                              {item.tags
                                .filter((t) => !['inner-life', 'consolidation'].includes(t))
                                .slice(0, 7)
                                .map((tag, index) => <span key={`${tag}:${index}`} className="s-row-tag">{tag}</span>)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </MindStreamShell>
      </div>
      {selectedItem && (
        <div className="journal-detail-backdrop" onMouseDown={closeDetail}>
          <div
            id={`journal-detail-dialog-${selectedItem.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
            ref={detailRef}
            className="journal-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`journal-detail-title-${selectedItem.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="journal-detail-header">
              <div style={{ minWidth: 0 }}>
                <div className="journal-detail-kicker">
                  <span
                    className="journal-kind-dot"
                    style={{
                      background: KIND_TONE[selectedItem.kind],
                      boxShadow: `0 0 18px color-mix(in srgb, ${KIND_TONE[selectedItem.kind]} 33%, transparent)`,
                    }}
                  />
                  <span>{selectedItem.label}</span>
                </div>
                <h2
                  id={`journal-detail-title-${selectedItem.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                  className="journal-detail-title"
                >
                  {selectedItem.title}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="journal-detail-close"
                onClick={closeDetail}
                aria-label="Close entry detail"
                title="Close entry detail"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </header>

            <dl className="journal-detail-meta">
              <div>
                <dt>Source</dt>
                <dd>{sourceLabel(selectedItem.source)}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selectedItem.kind}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{fullTimeLabel(selectedItem.created_at)}</dd>
              </div>
              {confidenceLabel(selectedItem.salience) && (
                <div>
                  <dt>Salience</dt>
                  <dd>{confidenceLabel(selectedItem.salience)}</dd>
                </div>
              )}
              {selectedItem.meta && (
                <div>
                  <dt>Meta</dt>
                  <dd>{selectedItem.meta}</dd>
                </div>
              )}
              {selectedItem.integrityStatus === 'suspect' && (
                <div>
                  <dt>Integrity</dt>
                  <dd>Legacy entry · possible truncation</dd>
                </div>
              )}
            </dl>

            <div className="journal-detail-body">
              {selectedItem.body.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            {selectedItem.tags && selectedItem.tags.length > 0 && (
              <div className="s-row-tags journal-detail-tags">
                {selectedItem.tags
                  .filter((t) => !['inner-life', 'consolidation'].includes(t))
                  .map((tag, index) => <span key={`${tag}:${index}`} className="s-row-tag">{tag}</span>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

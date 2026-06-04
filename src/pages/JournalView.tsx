/**
 * JournalView - the primary notebook for an agent's inner life.
 *
 * Mind keeps the diagnostic streams. Journal gives users one readable,
 * chronological feed across journals, thoughts, dreams, insights, beliefs,
 * and selected activity.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import MindStreamShell from '@/components/mind/MindStreamShell';
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

function confidenceLabel(score?: number): string | null {
  if (typeof score !== 'number') return null;
  return score.toFixed(2);
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
                      return (
                        <article
                          key={item.id}
                          style={{
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border-faint)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '18px 22px 20px',
                            boxShadow: 'var(--shadow-inset-highlight)',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 1fr) auto',
                              alignItems: 'start',
                              gap: 14,
                              paddingBottom: 12,
                              marginBottom: 14,
                              borderBottom: '1px solid var(--border-faint)',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 9,
                                  marginBottom: 7,
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 999,
                                    background: tone,
                                    boxShadow: `0 0 18px color-mix(in srgb, ${tone} 33%, transparent)`,
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 9.5,
                                    fontWeight: 600,
                                    letterSpacing: 'var(--track-folio)',
                                    color: tone,
                                    textTransform: 'uppercase',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {item.label}
                                </span>
                                {item.meta && (
                                  <span
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: 9.5,
                                      color: 'var(--text-whisper)',
                                      letterSpacing: 'var(--track-folio)',
                                      textTransform: 'uppercase',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {item.meta}
                                  </span>
                                )}
                              </div>
                              <h2
                                style={{
                                  margin: 0,
                                  color: 'var(--text-primary)',
                                  fontSize: 15,
                                  lineHeight: 1.35,
                                  fontWeight: 520,
                                  letterSpacing: 0,
                                }}
                              >
                                {item.title}
                              </h2>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                color: 'var(--text-tertiary)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                letterSpacing: 'var(--track-folio)',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {score && <span>{score}</span>}
                              <span>{timeLabel(item.created_at)}</span>
                            </div>
                          </div>

                          <div
                            style={{
                              color: 'var(--text-body)',
                              fontSize: 14.5,
                              lineHeight: 1.7,
                              letterSpacing: 'var(--track-body)',
                            }}
                          >
                            {item.body.split('\n').map((line, i) => (
                              <p key={i} style={{ margin: 0, marginBottom: line.trim() ? 12 : 5 }}>
                                {line}
                              </p>
                            ))}
                          </div>

                          {item.tags && item.tags.length > 0 && (
                            <div className="s-row-tags" style={{ marginTop: 16 }}>
                              {item.tags
                                .filter((t) => !['inner-life', 'consolidation'].includes(t))
                                .slice(0, 7)
                                .map((tag, index) => <span key={`${tag}:${index}`} className="s-row-tag">{tag}</span>)}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </MindStreamShell>
      </div>
    </div>
  );
}

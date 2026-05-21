/**
 * JournalView — promoted out of Mind into its own top-level surface.
 * Reuses Round-2 stream chrome (folio + hero + search) for visual parity.
 */
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import MindStreamShell, { StreamFilter } from '@/components/mind/MindStreamShell';

function moodColor(mood: string): string {
  const lower = mood.toLowerCase();
  if (['curious', 'engaged', 'excited', 'inspired'].some(m => lower.includes(m))) return '#c9a87c';
  if (['warm', 'grateful', 'connected', 'content'].some(m => lower.includes(m))) return '#8ca89c';
  if (['reflective', 'contemplative', 'quiet', 'thoughtful'].some(m => lower.includes(m))) return '#5b8aad';
  if (['restless', 'uncertain', 'lonely'].some(m => lower.includes(m))) return '#a88cc9';
  return 'var(--text-ghost)';
}

export default function JournalView() {
  const user = useAuthStore((s) => s.user);
  const { load, loadMindData, subscribe, journalEntries } = useCognitiveStore();
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const activeAgentName = useAgentScopeStore((s) => s.availableAgents.find((a) => a.id === s.activeAgentId)?.name ?? 'Luca');
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (user) {
      load(user.id, activeAgentId);
      loadMindData(user.id, activeAgentId);
      const unsub = subscribe(user.id, activeAgentId);
      return unsub;
    }
  }, [user, activeAgentId, load, loadMindData, subscribe]);

  const filtered = journalEntries
    .filter((e) => {
      if (filter === 'today') {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        return new Date(e.created_at) >= start;
      }
      return true;
    })
    .filter((e) => !query || e.content.toLowerCase().includes(query.toLowerCase()));

  // Group by date
  const grouped = new Map<string, typeof filtered>();
  for (const entry of filtered) {
    const dateKey = new Date(entry.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const group = grouped.get(dateKey) ?? [];
    group.push(entry);
    grouped.set(dateKey, group);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: 0 }}>
        <MindStreamShell
          num="08"
          streamLabel="JOURNAL"
          title="Journal"
          subtitle={`${journalEntries.length} entries. ${activeAgentName}'s autonomous journal — periodic introspective entries written between conversations.`}
          searchPlaceholder="Search journal entries…"
          filter={filter} onFilterChange={setFilter}
          query={query} onQueryChange={setQuery}
        >
          {filtered.length === 0 ? (
            <div className="s-empty">No journal entries yet.</div>
          ) : (
            // Centered reading column — max 760px keeps line length comfortable
            // (60–75 chars). Each day group is a chapter; each entry is a page.
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 24px 80px' }}>
              {Array.from(grouped.entries()).map(([date, entries]) => (
                <section key={date} style={{ marginBottom: 56 }}>
                  {/* Chapter mark — date left, hairline middle, count right */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      marginBottom: 22,
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
                    <div style={{ flex: 1, height: 1, background: 'var(--border-faint)', opacity: 0.7 }} />
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
                      {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>

                  {/* Pages */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {entries.map((entry) => (
                      <article
                        key={entry.id}
                        style={{
                          background: 'var(--canvas)',
                          border: '1px solid var(--border-faint)',
                          borderRadius: 14,
                          padding: '22px 26px 24px',
                          boxShadow: 'var(--shadow-inset-highlight)',
                        }}
                      >
                        {/* Meta strip */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            paddingBottom: 14,
                            marginBottom: 16,
                            borderBottom: '1px solid var(--border-faint)',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10.5,
                              fontWeight: 500,
                              letterSpacing: 'var(--track-folio)',
                              color: 'var(--text-tertiary)',
                              textTransform: 'uppercase',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {new Date(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                          {entry.mood && (
                            <span
                              style={{
                                fontSize: 9,
                                padding: '2px 9px',
                                borderRadius: 999,
                                background: moodColor(entry.mood) + '15',
                                color: moodColor(entry.mood),
                                border: `1px solid ${moodColor(entry.mood)}30`,
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: 'var(--track-folio)',
                                textTransform: 'uppercase',
                                fontWeight: 500,
                              }}
                            >
                              {entry.mood}
                            </span>
                          )}
                          {entry.trigger_type && (
                            <span
                              style={{
                                fontSize: 9,
                                color: 'var(--text-whisper)',
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: 'var(--track-folio)',
                                textTransform: 'uppercase',
                                marginLeft: 'auto',
                              }}
                            >
                              {entry.trigger_type === 'periodic' ? 'scheduled' : 'post-conversation'}
                            </span>
                          )}
                        </div>

                        {/* Body — generous reading typography */}
                        <div
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 15.5,
                            lineHeight: 1.78,
                            color: 'var(--text-primary)',
                            letterSpacing: 'var(--track-body)',
                          }}
                        >
                          {entry.content.split('\n').map((line, i) => (
                            <p key={i} style={{ margin: 0, marginBottom: line.trim() ? 14 : 6 }}>
                              {line}
                            </p>
                          ))}
                        </div>
                      </article>
                    ))}
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

/**
 * JournalView — promoted out of Mind into its own top-level surface.
 * Reuses Round-2 stream chrome (folio + hero + search) for visual parity.
 */
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
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
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (user) {
      load(user.id);
      loadMindData(user.id);
      const unsub = subscribe(user.id);
      return unsub;
    }
  }, [user]);

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
          subtitle={`${journalEntries.length} entries. Luca's autonomous journal — periodic introspective entries written between conversations.`}
          searchPlaceholder="Search journal entries…"
          filter={filter} onFilterChange={setFilter}
          query={query} onQueryChange={setQuery}
        >
          {filtered.length === 0 ? (
            <div className="s-empty">No journal entries yet.</div>
          ) : (
            <div>
              {Array.from(grouped.entries()).map(([date, entries]) => (
                <div key={date} style={{ marginBottom: 32 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: 'var(--track-folio)',
                    color: 'var(--text-whisper)', marginBottom: 14, paddingBottom: 8,
                    borderBottom: '1px solid var(--hairline)',
                  }}>
                    {date}
                  </div>
                  {entries.map((entry) => (
                    <div key={entry.id} style={{ marginBottom: 24 }}>
                      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {entry.mood && (
                          <span style={{
                            fontSize: 9, padding: '1px 8px', borderRadius: 999,
                            background: moodColor(entry.mood) + '15',
                            color: moodColor(entry.mood),
                            border: `1px solid ${moodColor(entry.mood)}30`,
                            fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-folio)',
                            textTransform: 'uppercase',
                          }}>
                            {entry.mood}
                          </span>
                        )}
                        {entry.trigger_type && (
                          <span style={{ fontSize: 9, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-folio)', textTransform: 'uppercase' }}>
                            {entry.trigger_type === 'periodic' ? 'scheduled' : 'post-conversation'}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-sans)', fontSize: 14.5, lineHeight: 1.7,
                        color: 'var(--text-primary)', letterSpacing: 'var(--track-body)',
                        paddingLeft: 14, borderLeft: '2px solid var(--hairline)',
                      }}>
                        {entry.content.split('\n').map((line, i) => (
                          <p key={i} style={{ marginBottom: line.trim() ? 10 : 4 }}>{line}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </MindStreamShell>
      </div>
    </div>
  );
}

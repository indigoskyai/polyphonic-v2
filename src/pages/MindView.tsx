import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useViewTabStore } from '@/stores/viewTabStore';

/* ─── Overview Tab ─── */
function OverviewTab() {
  const { modulators, emotions, beliefs, memoryStats, recentEvents } = useCognitiveStore();

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {/* Modulators */}
      <Card title="Modulators">
        {Object.entries(modulators).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3 mb-2">
            <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 100, textTransform: 'capitalize' }}>
              {key.replace(/_/g, ' ')}
            </span>
            <div style={{ flex: 1, height: 3, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${value * 100}%`, height: '100%', background: 'var(--accent-luca)', opacity: 0.6, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 32 }}>
              {value.toFixed(2)}
            </span>
          </div>
        ))}
      </Card>

      {/* Emotional State */}
      <Card title="Emotional State">
        {Object.entries(emotions).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3 mb-2">
            <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 80, textTransform: 'capitalize' }}>
              {key}
            </span>
            <div style={{ flex: 1, height: 3, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: key === 'valence' ? '50%' : 0,
                width: key === 'valence' ? `${Math.abs(value) * 50}%` : `${value * 100}%`,
                transform: key === 'valence' && value < 0 ? 'translateX(-100%)' : undefined,
                height: '100%',
                background: value < 0 ? '#ad5b5b80' : '#8ca89c80',
                borderRadius: 2,
              }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 36 }}>
              {value.toFixed(2)}
            </span>
          </div>
        ))}
      </Card>

      {/* Memory Stats */}
      <Card title="Memory">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Engrams', value: memoryStats.total_engrams },
            { label: 'Active', value: memoryStats.active },
            { label: 'Dormant', value: memoryStats.dormant },
            { label: 'Archived', value: memoryStats.archived },
            { label: 'Connections', value: memoryStats.connections },
            { label: 'Beliefs', value: memoryStats.beliefs_count },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 22, fontWeight: 350, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Beliefs */}
      <Card title="Beliefs">
        {beliefs.length === 0 && <Empty text="No beliefs formed yet" />}
        {beliefs.slice(0, 5).map((b, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {b.text}
            </div>
            <div style={{ width: 40, height: 3, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${b.strength * 100}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </Card>

      {/* Recent Events */}
      <Card title="Recent Events">
        {recentEvents.length === 0 && <Empty text="No events recorded" />}
        {recentEvents.slice(0, 8).map((ev) => (
          <div key={ev.id} className="flex items-center gap-2 mb-1.5">
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', width: 60, flexShrink: 0 }}>
              {ev.type}
            </span>
            <div style={{
              width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
              background: ev.salience > 0.7 ? 'var(--accent-luca)' : ev.salience > 0.4 ? 'var(--text-ghost)' : 'var(--text-whisper)',
            }} />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.content}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-whisper)', marginLeft: 'auto', flexShrink: 0 }}>
              {timeAgo(ev.created_at)}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ─── Thoughts Tab (master-detail) ─── */
function ThoughtsTab() {
  const { thoughts } = useCognitiveStore();
  const [selected, setSelected] = useState<number>(0);

  const current = thoughts[selected];

  return (
    <div className="flex gap-0" style={{ height: '100%', minHeight: 400 }}>
      {/* List */}
      <div style={{ width: 320, borderRight: '1px solid var(--border-subtle)', overflow: 'auto', flexShrink: 0 }}>
        {thoughts.length === 0 && <Empty text="No thoughts recorded" />}
        {thoughts.map((t, i) => (
          <div
            key={t.id}
            onClick={() => setSelected(i)}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              background: i === selected ? 'var(--bg-surface)' : undefined,
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', padding: '1px 5px', background: 'var(--bg-deep)', borderRadius: 3 }}>
                {t.type}
              </span>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: t.salience > 0.7 ? 'var(--accent-luca)' : 'var(--text-whisper)',
              }} />
              <span style={{ fontSize: 9, color: 'var(--text-whisper)', marginLeft: 'auto' }}>
                {timeAgo(t.created_at)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {t.content}
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        {current ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)' }}>
                {current.type}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-whisper)' }}>
                {new Date(current.created_at).toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', marginBottom: 16 }}>
              {current.content}
            </div>
            <div className="flex flex-col gap-1">
              {current.trigger && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Trigger</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{current.trigger}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Source</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{current.source}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Salience</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{current.salience.toFixed(2)}</span>
              </div>
            </div>
          </>
        ) : (
          <Empty text="Select a thought to view details" />
        )}
      </div>
    </div>
  );
}

/* ─── Engram stream tabs (Dreams, Insights, Reflections) ─── */
function EngramStreamTab({ items, emptyText, style }: {
  items: Array<{ id: string; content: string; strength: number; tags: string[]; source_context: Record<string, unknown>; created_at: string }>;
  emptyText: string;
  style?: 'poetic' | 'cards' | 'timeline';
}) {
  if (items.length === 0) return <Empty text={emptyText} />;

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.id} style={{
          background: style === 'poetic' ? 'transparent' : 'var(--bg-surface)',
          border: style === 'poetic' ? 'none' : '1px solid var(--border-subtle)',
          borderRadius: style === 'poetic' ? 0 : 'var(--radius-md)',
          padding: style === 'poetic' ? '12px 0' : '14px 16px',
          borderBottom: style === 'poetic' ? '1px solid var(--border-subtle)' : undefined,
        }}>
          <div style={{
            fontSize: style === 'poetic' ? 14 : 13,
            lineHeight: 1.65,
            color: style === 'poetic' ? 'var(--text-tertiary)' : 'var(--text-secondary)',
            fontStyle: style === 'poetic' ? 'italic' : undefined,
          }}>
            {item.content}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span style={{ fontSize: 9, color: 'var(--text-whisper)' }}>
              {new Date(item.created_at).toLocaleDateString()}
            </span>
            {item.tags?.filter((t) => !['dream', 'consolidation', 'insight', 'reflection', 'inner-life'].includes(t)).map((tag) => (
              <span key={tag} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-deep)', color: 'var(--text-ghost)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Wanderings Tab ─── */
function WanderingsTab() {
  const { wanderings } = useCognitiveStore();

  if (wanderings.length === 0) return <Empty text="No wanderings yet. Untethered thoughts appear here." />;

  return (
    <div className="flex flex-col gap-3">
      {wanderings.map((w) => (
        <div key={w.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {w.content}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span style={{ fontSize: 9, color: 'var(--text-whisper)' }}>{timeAgo(w.created_at)}</span>
            {w.trigger && <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>{w.trigger}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Journal Tab ─── */
function JournalTab() {
  const { journalEntries } = useCognitiveStore();

  if (journalEntries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 40px' }}>
        <div style={{ fontSize: 12, color: 'var(--text-ghost)', marginBottom: 8 }}>
          No journal entries yet.
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-whisper)', lineHeight: 1.5, maxWidth: 360, margin: '0 auto' }}>
          Luca writes journal entries autonomously — reflecting on conversations, patterns noticed, and things worth remembering. Entries appear here as they're written.
        </div>
      </div>
    );
  }

  // Group entries by date
  const grouped = new Map<string, typeof journalEntries>();
  for (const entry of journalEntries) {
    const dateKey = new Date(entry.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const group = grouped.get(dateKey) ?? [];
    group.push(entry);
    grouped.set(dateKey, group);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {Array.from(grouped.entries()).map(([date, entries]) => (
        <div key={date} style={{ marginBottom: 32 }}>
          {/* Date header */}
          <div style={{
            fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-ghost)', marginBottom: 12, paddingBottom: 6,
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {date}
          </div>

          {/* Entries for this date */}
          {entries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: 20 }}>
              {/* Meta line */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                {entry.mood && (
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 100,
                    background: moodColor(entry.mood) + '15',
                    color: moodColor(entry.mood),
                    border: `1px solid ${moodColor(entry.mood)}30`,
                  }}>
                    {entry.mood}
                  </span>
                )}
                {entry.trigger_type && (
                  <span style={{ fontSize: 9, color: 'var(--text-whisper)' }}>
                    {entry.trigger_type === 'periodic' ? 'scheduled reflection' : 'post-conversation'}
                  </span>
                )}
              </div>

              {/* Entry content */}
              <div style={{
                fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)',
                fontStyle: 'normal',
                paddingLeft: 12,
                borderLeft: '2px solid var(--border-subtle)',
              }}>
                {entry.content.split('\n').map((line, i) => (
                  <p key={i} style={{ marginBottom: line.trim() ? 8 : 4 }}>{line}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function moodColor(mood: string): string {
  const lower = mood.toLowerCase();
  if (['curious', 'engaged', 'excited', 'inspired'].some(m => lower.includes(m))) return '#c9a87c';
  if (['warm', 'grateful', 'connected', 'content'].some(m => lower.includes(m))) return '#8ca89c';
  if (['reflective', 'contemplative', 'quiet', 'thoughtful'].some(m => lower.includes(m))) return '#5b8aad';
  if (['restless', 'uncertain', 'lonely'].some(m => lower.includes(m))) return '#a88cc9';
  return 'var(--text-ghost)';
}

/* ─── Shared components ─── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--text-ghost)', marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-ghost)', fontSize: 12 }}>
      {text}
    </div>
  );
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/* ─── Main MindView ─── */
export default function MindView() {
  const activeTab = useViewTabStore((s) => s.mindTab);
  const user = useAuthStore((s) => s.user);
  const { load, loadMindData, subscribe, dreams, insights, reflections } = useCognitiveStore();

  useEffect(() => {
    if (user) {
      load(user.id);
      loadMindData(user.id);
      const unsub = subscribe(user.id);
      return unsub;
    }
  }, [user]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{
        padding: activeTab === 'Thoughts' ? 0 : '24px 32px',
      }}>
        {activeTab === 'Overview' && <OverviewTab />}
        {activeTab === 'Journal' && <JournalTab />}
        {activeTab === 'Thoughts' && <ThoughtsTab />}
        {activeTab === 'Dreams' && (
          <EngramStreamTab items={dreams} emptyText="No dreams yet. Dream reports appear after memory consolidation." style="poetic" />
        )}
        {activeTab === 'Wanderings' && <WanderingsTab />}
        {activeTab === 'Insights' && (
          <EngramStreamTab items={insights} emptyText="No insights crystallized yet." style="cards" />
        )}
        {activeTab === 'Reflections' && (
          <EngramStreamTab items={reflections} emptyText="No reflections yet. Self-reflection engrams appear here." style="timeline" />
        )}
      </div>
    </div>
  );
}

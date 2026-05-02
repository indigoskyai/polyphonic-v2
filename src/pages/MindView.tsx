/**
 * MindView — Round-2 redesign.
 * Each sub-tab uses MindStreamShell for shared chrome (folio, hero, search, ALL/TODAY/SALIENT).
 *
 * Tabs:
 *  Overview      — MindOverview (already Round-2)
 *  Thoughts      — live working stream
 *  Dreams        — overnight consolidations (poetic)
 *  Wanderings    — untethered drifts during idle
 *  Insights      — crystallized patterns
 *  Reflections   — self-reflection engrams
 *  Beliefs       — top beliefs by confidence (own dedicated view, NOT Journal)
 *  Activity      — autonomous action log
 *
 * Journal moved out of Mind into its own top-level rail item (/journal).
 */
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useViewTabStore } from '@/stores/viewTabStore';
import MindOverview from '@/components/mind/MindOverview';
import MindStreamShell, { StreamFilter, applyStreamFilter } from '@/components/mind/MindStreamShell';

const MOCK_DOMAINS = ['Working style', 'Aesthetic', 'Communication', 'Process', 'Trust', 'Taste'];

function timeAgoLong(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Generic stream tab (Thoughts / Dreams / Wanderings / Insights / Reflections) ─── */
interface StreamTabConfig {
  num: string;
  label: string;          // "THOUGHTS STREAM"
  title: string;
  subtitle: (n: number) => string;
  searchPlaceholder: string;
  empty: string;
  poetic?: boolean;
  kindLabel: string;
}

function StreamTab<T extends { id: string; content: string; created_at: string; salience?: number; strength?: number; tags?: string[] }>(
  { items, cfg }: { items: T[]; cfg: StreamTabConfig }
) {
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  const visible = applyStreamFilter(items, filter, query);

  return (
    <MindStreamShell
      num={cfg.num}
      streamLabel={cfg.label}
      title={cfg.title}
      subtitle={cfg.subtitle(items.length)}
      searchPlaceholder={cfg.searchPlaceholder}
      filter={filter} onFilterChange={setFilter}
      query={query} onQueryChange={setQuery}
    >
      {visible.length === 0 ? (
        <div className="s-empty">{cfg.empty}</div>
      ) : (
        <div className="s-list">
          {visible.map((item) => {
            const score = item.salience ?? item.strength;
            return (
              <article key={item.id} className="s-row">
                <div className="s-row-meta">
                  <span className="dot" />
                  <span className="kind">{cfg.kindLabel}</span>
                  <span className="time">{timeAgoLong(item.created_at)}</span>
                  {typeof score === 'number' && <span className="salience">{score.toFixed(2)}</span>}
                </div>
                <div className={`s-row-content${cfg.poetic ? ' poetic' : ''}`}>{item.content}</div>
                {item.tags && item.tags.length > 0 && (
                  <div className="s-row-tags">
                    {item.tags
                      .filter((t) => !['inner-life', 'consolidation'].includes(t))
                      .slice(0, 6)
                      .map((t) => <span key={t} className="s-row-tag">{t}</span>)}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </MindStreamShell>
  );
}

/* ─── Beliefs — own dedicated tab (not Journal) ─── */
function BeliefsTab() {
  const { beliefs, memoryStats } = useCognitiveStore();
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  // Beliefs lack created_at in the in-memory shape — synthesize for filter.
  const enriched = beliefs.map((b, i) => ({
    ...b,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
  }));
  const filtered = enriched
    .filter((b) => filter !== 'salient' || b.strength >= 0.6)
    .filter((b) => !query || b.text.toLowerCase().includes(query.toLowerCase()));

  return (
    <MindStreamShell
      num="06"
      streamLabel="BELIEFS"
      title="Beliefs"
      subtitle={`${memoryStats.beliefs_count || beliefs.length} beliefs. What Luca holds true — ranked by confidence.`}
      searchPlaceholder="Search beliefs…"
      filter={filter} onFilterChange={setFilter}
      query={query} onQueryChange={setQuery}
    >
      {filtered.length === 0 ? (
        <div className="s-empty">No beliefs formed yet.</div>
      ) : (
        <div>
          {filtered.map((b, i) => (
            <div key={i} className="s-belief">
              <div className="s-belief-head">
                <span className="s-belief-domain">{MOCK_DOMAINS[i % MOCK_DOMAINS.length]}{/* MOCK */}</span>
                <span className="s-belief-conf">{b.strength.toFixed(2)}</span>
              </div>
              <p className="s-belief-content">{b.text}</p>
              <div className="s-belief-foot">
                <div className="s-belief-bar">
                  <div className="s-belief-bar-fill" style={{ width: `${Math.round(b.strength * 100)}%` }} />
                </div>
                <span className={`s-belief-revised${i === 1 ? ' fresh' : ''}`}>
                  {i === 1 ? 'revised · today' : `stable · ${[8, 0, 3, 6, 4, 2][i % 6]} weeks`}{/* MOCK */}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </MindStreamShell>
  );
}

/* ─── Activity — autonomous action log ─── */
function ActivityTab() {
  const { activityLog } = useCognitiveStore();
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = activityLog
    .filter((ev) => {
      if (filter === 'today') {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        return new Date(ev.created_at) >= start;
      }
      return true;
    })
    .filter((ev) => !query || (ev.title || ev.summary || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <MindStreamShell
      num="07"
      streamLabel="ACTIVITY"
      title="Activity"
      subtitle={`${activityLog.length} events. Everything Luca did between conversations.`}
      searchPlaceholder="Search activity…"
      filter={filter} onFilterChange={setFilter}
      query={query} onQueryChange={setQuery}
    >
      {filtered.length === 0 ? (
        <div className="s-empty">Quiet. No autonomous activity yet.</div>
      ) : (
        <div className="s-activity-list">
          {filtered.map((ev) => {
            const cls = activityClass(ev.activity_type);
            return (
              <div key={ev.id} className={`m-activity-row ${cls}`}>
                <div className="m-activity-rail">
                  <div className="m-activity-dot" />
                  <div className="m-activity-line" />
                </div>
                <div className="m-activity-body">
                  <div className="m-activity-type">{cls}</div>
                  <div className="m-activity-summary">
                    {ev.title || ev.summary || ev.activity_type.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="m-activity-time">{timeAgoLong(ev.created_at)}</div>
              </div>
            );
          })}
        </div>
      )}
    </MindStreamShell>
  );
}

function activityClass(t: string): 'thought' | 'dream' | 'insight' | 'reflection' | 'belief' | 'consolidate' {
  if (t.includes('dream')) return 'dream';
  if (t.includes('insight')) return 'insight';
  if (t.includes('reflect')) return 'reflection';
  if (t.includes('belief')) return 'belief';
  if (t.includes('consolidat')) return 'consolidate';
  return 'thought';
}

/* ─── Main ─── */
export default function MindView() {
  const activeTab = useViewTabStore((s) => s.mindTab);
  const user = useAuthStore((s) => s.user);
  const { load, loadMindData, subscribe, thoughts, dreams, insights, reflections, wanderings } = useCognitiveStore();

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
      <div className="flex-1 overflow-y-auto" style={{ padding: 0 }}>
        {activeTab === 'Overview' && <MindOverview />}
        {activeTab === 'Thoughts' && (
          <StreamTab items={thoughts} cfg={{
            num: '01', label: 'THOUGHTS STREAM', title: 'Thoughts', kindLabel: 'thought',
            subtitle: (n) => `${n} thoughts. Live working stream — reflections, questions, observations as they happen.`,
            searchPlaceholder: 'Search thoughts…',
            empty: 'No thoughts yet.',
          }} />
        )}
        {activeTab === 'Dreams' && (
          <StreamTab items={dreams} cfg={{
            num: '02', label: 'DREAMS STREAM', title: 'Dreams', kindLabel: 'dream', poetic: true,
            subtitle: (n) => `${n} dreams. Memory consolidations that surface overnight.`,
            searchPlaceholder: 'Search dreams…',
            empty: 'No dreams yet.',
          }} />
        )}
        {activeTab === 'Wanderings' && (
          <StreamTab items={wanderings} cfg={{
            num: '03', label: 'WANDERINGS STREAM', title: 'Wanderings', kindLabel: 'wandering',
            subtitle: (n) => `${n} wanderings. Untethered drifts during idle.`,
            searchPlaceholder: 'Search wanderings…',
            empty: 'No wanderings yet.',
          }} />
        )}
        {activeTab === 'Insights' && (
          <StreamTab items={insights} cfg={{
            num: '04', label: 'INSIGHTS STREAM', title: 'Insights', kindLabel: 'insight',
            subtitle: (n) => `${n} insights. Patterns Luca crystallized across conversations.`,
            searchPlaceholder: 'Search insights…',
            empty: 'No insights crystallized yet.',
          }} />
        )}
        {activeTab === 'Reflections' && (
          <StreamTab items={reflections} cfg={{
            num: '05', label: 'REFLECTIONS STREAM', title: 'Reflections', kindLabel: 'reflection',
            subtitle: (n) => `${n} reflections. Deeper, persistent ideas about self and relationships.`,
            searchPlaceholder: 'Search reflections…',
            empty: 'No reflections yet.',
          }} />
        )}
        {activeTab === 'Beliefs' && <BeliefsTab />}
        {activeTab === 'Activity' && <ActivityTab />}
      </div>
    </div>
  );
}

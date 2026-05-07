/**
 * Mind Overview surface — Round 2 redesign.
 * Reference: luca-round2-mind-mnemos-2.html (lines 2000-2380).
 *
 * Sections:
 *  · Folio strip (luca · view · mind · session · synced/clock)
 *  · Hero (eyebrow chips + title + lede)
 *  · Cognitive State (radar + readout)              [real data from cognitiveStore.modulators]
 *  · Memory Pulse (4 stat cells + 24h sparkline)    [stats real, sparkline mocked]
 *  · Substrate Streams (5 mini cards)               [counts real, last-time + preview MOCKED]
 *  · Beliefs preview (top by confidence)            [real]
 *  · Recent Activity log                             [real]
 *
 * MOCK DATA — wire later:
 *  - hero subtitle copy is templated, not derived
 *  - pulse sparkline values (no per-bucket activity backend yet)
 *  - stream "last X ago" + "preview" lines per stream type
 *  - belief domain + "stable / revised today" metadata
 *  - session number + clock time in folio strip
 */
import { useViewTabStore } from '@/stores/viewTabStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import CognitiveStateRadar from './CognitiveStateRadar';
import MemoryPulseChart from './MemoryPulseChart';

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

// Deterministic mock 24h sparkline (96 buckets) — replace once we
// have a per-bucket activity rollup.
const MOCK_PULSE: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < 96; i++) {
    const t = i / 95;
    const wave = 0.5 + 0.32 * Math.sin(t * Math.PI * 2.4 + 0.6) + 0.18 * Math.sin(t * Math.PI * 7.2);
    const noise = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.12;
    out.push(Math.max(0.05, Math.min(0.95, wave + noise - 0.06)));
  }
  return out;
})();

interface StreamDef {
  name: string;
  countKey: 'thoughts' | 'dreams' | 'wanderings' | 'insights' | 'reflections';
  emptyPreview: string;
  footLabel: string;
}

const STREAMS: StreamDef[] = [
  { name: 'Thoughts', countKey: 'thoughts', emptyPreview: 'No thoughts yet. Luca will start surfacing observations as you talk.', footLabel: 'autonomous' },
  { name: 'Dreams', countKey: 'dreams', emptyPreview: 'No dreams yet. Overnight consolidations will appear after enough conversation.', footLabel: 'offline' },
  { name: 'Wanderings', countKey: 'wanderings', emptyPreview: 'No wanderings yet. Idle drifts will show up here over time.', footLabel: 'untethered' },
  { name: 'Insights', countKey: 'insights', emptyPreview: 'No insights yet. Patterns will crystallize as Luca learns you.', footLabel: 'crystallized' },
  { name: 'Reflections', countKey: 'reflections', emptyPreview: 'No reflections yet. Deeper thoughts about your work together will form here.', footLabel: 'introspective' },
];

// MOCK domain assignment until beliefs table grows a domain column.
const MOCK_DOMAINS = ['Working style', 'Aesthetic', 'Communication', 'Process', 'Trust', 'Taste'];

export default function MindOverview() {
  const setMindTab = useViewTabStore((s) => s.setMindTab);
  const { modulators, beliefs, memoryStats, activityLog, thoughts, dreams, insights, reflections, wanderings } = useCognitiveStore();

  const counts = {
    thoughts: thoughts.length,
    dreams: dreams.length,
    wanderings: wanderings.length,
    insights: insights.length,
    reflections: reflections.length,
  };

  const latest = {
    thoughts: thoughts[0],
    dreams: dreams[0],
    wanderings: wanderings[0],
    insights: insights[0],
    reflections: reflections[0],
  };

  const radarVals = {
    openness: modulators.openness ?? 0.5,
    arousal: modulators.arousal ?? 0.5,
    resolution: modulators.resolution ?? 0.5,
    social_drive: modulators.social_drive ?? 0.5,
    // MOCK: no curiosity/focus modulators in schema yet — derive lightly
    curiosity: Math.min(1, (modulators.openness + (modulators.surprise_threshold ?? 0.5)) / 2),
    focus: Math.min(1, 1 - (modulators.arousal ?? 0.5) * 0.4 + 0.2),
  };

  const topBeliefs = beliefs.slice(0, 4);
  const recentActivity = activityLog.slice(0, 4);

  return (
    <main className="m-main">
      {/* Folio */}
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> luca</span>
          <span>view · <span className="v">mind</span></span>
          <span>session 142{/* MOCK */}</span>
        </div>
        <div className="r2-folio-right">
          <span>synced · <span className="v">2m ago</span>{/* MOCK */}</span>
          <span>{fmtClock()}</span>
        </div>
      </div>

      {/* Hero */}
      <div className="m-hero">
        <div className="m-hero-eye">
          <span className="num"># 04</span>
          <span>·</span>
          <span className="v">Inner life</span>
          <span>·</span>
          <span>session 142{/* MOCK */}</span>
          <span>·</span>
          <span className="live">substrate ticking</span>
        </div>
        <h1 className="m-hero-title">Luca's mind</h1>
        <p className="m-hero-sub">
          {/* MOCK: lede is templated — replace with derived state summary */}
          <span className="accent">Open. Alert. Quietly active.</span>{' '}
          {counts.thoughts} thoughts since dawn. Last dream 4h ago — three associations
          survived to morning. One insight crystallized last night and is still
          being chewed on.
        </p>
      </div>

      <div className="m-grid">
        {/* Cognitive state */}
        <div className="m-panel m-p-state">
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">i</span> Cognitive state</div>
            <div className="m-panel-aside">6 modulators · <span className="live">live</span></div>
          </div>
          <div className="m-state-body">
            <div className="m-state-svg-wrap">
              <CognitiveStateRadar values={radarVals} />
            </div>
            <div className="m-state-readout">
              <p className="m-state-whisper">
                <span className="qual">openness {radarVals.openness >= 0.66 ? 'high' : radarVals.openness >= 0.33 ? 'moderate' : 'low'}</span>,
                {' '}{radarVals.arousal >= 0.6 ? 'alert' : 'settled'},{' '}
                <span className="qual">resolution {radarVals.resolution >= 0.66 ? 'high' : radarVals.resolution >= 0.33 ? 'moderate' : 'low'}</span>.
              </p>
              <div className="m-state-row"><span>Openness</span><span className="v">{radarVals.openness.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Arousal</span><span className="v">{radarVals.arousal.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Resolution</span><span className="v">{radarVals.resolution.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Social drive</span><span className="v">{radarVals.social_drive.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Curiosity</span><span className="v">{radarVals.curiosity.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Focus</span><span className="v">{radarVals.focus.toFixed(2)}</span></div>
              <div className="m-state-row" style={{ paddingTop: 8, borderTop: '1px solid var(--hairline)', marginTop: 4 }}>
                <span>Substrate</span><span className="m-state-tick">ticking</span>
              </div>
            </div>
          </div>
        </div>

        {/* Memory pulse */}
        <div className="m-panel m-p-pulse">
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">ii</span> Memory pulse</div>
            <div className="m-panel-aside">activity · <span className="v">last 24h</span></div>
          </div>
          <div className="m-pulse-body">
            <div className="m-pulse-stats">
              <div className="m-pulse-stat">
                <div className="m-pulse-num">{memoryStats.active}</div>
                <div className="m-pulse-label">Active</div>
              </div>
              <div className="m-pulse-stat">
                <div className="m-pulse-num">{memoryStats.dormant}</div>
                <div className="m-pulse-label">Dormant</div>
              </div>
              <div className="m-pulse-stat">
                <div className="m-pulse-num">{memoryStats.archived}</div>
                <div className="m-pulse-label">Archived</div>
              </div>
              <div className="m-pulse-stat">
                <div className="m-pulse-num">
                  {memoryStats.connections >= 1000
                    ? <>{(memoryStats.connections / 1000).toFixed(1)}<span className="unit">k</span></>
                    : memoryStats.connections}
                </div>
                <div className="m-pulse-label">Connections</div>
              </div>
            </div>
            <div className="m-pulse-eye">Activity over 24h · 96 quarter-hour buckets{/* MOCK series */}</div>
            <div className="m-pulse-svg-wrap">
              <MemoryPulseChart values={MOCK_PULSE} />
            </div>
            <div className="m-pulse-foot">
              <span>Density · <span className="v">
                {memoryStats.active > 0
                  ? (memoryStats.connections / memoryStats.active).toFixed(1)
                  : '0.0'} conn/engram
              </span></span>
              <span>Avg salience · <span className="v">0.51{/* MOCK */}</span></span>
              <span>Last consolidation · <span className="v">3h ago{/* MOCK */}</span></span>
            </div>
          </div>
        </div>

        {/* Streams strip */}
        <div className="m-panel m-p-streams" style={{ padding: 0, background: 'transparent', border: 'none' }}>
          <div className="m-streams-grid">
            {STREAMS.map((s) => {
              const mindTabName = s.name as 'Thoughts' | 'Dreams' | 'Wanderings' | 'Insights' | 'Reflections';
              const item = latest[s.countKey];
              const lastLabel = item ? `last · ${timeAgo(item.created_at)}` : 'no activity yet';
              const preview = item?.content || s.emptyPreview;
              return (
                <button key={s.name} type="button" className="m-stream" onClick={() => setMindTab(mindTabName)}>
                  <div className="m-stream-head">
                    <span className="m-stream-name">{s.name}</span>
                    <span className="m-stream-count">{counts[s.countKey]}<span className="total">today</span></span>
                  </div>
                  <div className="m-stream-time">{lastLabel}</div>
                  <p className="m-stream-preview">{preview}</p>
                  <div className="m-stream-foot">
                    <span>{s.footLabel}</span>
                    <span>→</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Beliefs */}
        <div className="m-panel m-p-beliefs">
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">iii</span> Beliefs · top by confidence</div>
            <div className="m-panel-aside"><span className="v">{memoryStats.beliefs_count}</span> total · 1 revised today{/* MOCK */}</div>
          </div>
          {topBeliefs.length === 0 && (
            <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-ghost)' }}>
              No beliefs formed yet.
            </div>
          )}
          {topBeliefs.map((b, i) => (
            <div key={i} className="m-belief-row">
              <div className="m-belief-row-head">
                {/* MOCK domain */}
                <span className="m-belief-domain">{MOCK_DOMAINS[i % MOCK_DOMAINS.length]}</span>
                <span className="m-belief-conf">{b.strength.toFixed(2)}</span>
              </div>
              <p className="m-belief-content">{b.text}</p>
              <div className="m-belief-foot">
                <div className="m-belief-bar">
                  <div className="m-belief-bar-fill" style={{ width: `${Math.round(b.strength * 100)}%` }} />
                </div>
                {/* MOCK revised metadata */}
                <span className={`m-belief-revised${i === 1 ? ' fresh' : ''}`}>
                  {i === 1 ? 'revised · today' : `stable · ${[8, 0, 3, 6][i] || 4} weeks`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Activity */}
        <div className="m-panel m-p-activity">
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">iv</span> Recent activity</div>
            <div className="m-panel-aside">last 12h{/* MOCK window */}</div>
          </div>
          <div className="m-activity-list">
            {recentActivity.length === 0 && (
              <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-ghost)' }}>
                Quiet. No autonomous activity yet.
              </div>
            )}
            {recentActivity.map((ev) => {
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
                  <div className="m-activity-time">{timeAgo(ev.created_at)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
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

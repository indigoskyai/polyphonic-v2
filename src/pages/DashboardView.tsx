import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';

type DashTab = 'dashboard' | 'thoughts';
type ThoughtFilter = 'all' | 'dream' | 'reflection' | 'observation' | 'decision';

export default function DashboardView() {
  const [tab, setTab] = useState<DashTab>('dashboard');
  const { user } = useAuthStore();
  const { load, subscribe, loaded } = useCognitiveStore();

  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsub = subscribe(user.id);
    return unsub;
  }, [user?.id]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Inner Life</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="rounded-full" style={{ width: 4, height: 4, background: 'var(--text-tertiary)', animation: 'breathe-dot 3s ease-in-out infinite' }} />
          <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>connected</span>
        </div>
      </div>

      {/* Stream Tabs */}
      <div className="flex items-end flex-shrink-0" style={{ gap: 24, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <TabBtn label="Dashboard" active={tab === 'dashboard'} onClick={() => setTab('dashboard')} />
        <TabBtn label="Thoughts" active={tab === 'thoughts'} onClick={() => setTab('thoughts')} />
      </div>

      {/* Content */}
      {tab === 'dashboard' ? <DashboardTab /> : <ThoughtsTab />}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer"
      style={{
        fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: active ? 'var(--text-secondary)' : 'var(--text-ghost)',
        background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'var(--text-ghost)' : 'transparent'}`,
        padding: '0 0 10px', height: 44, fontFamily: 'var(--font-sans)',
        transition: 'color var(--dur-fast) var(--ease-out)',
      }}
    >
      {label}
    </button>
  );
}

/* ====== Dashboard Tab ====== */
function DashboardTab() {
  const { modulators, emotions, beliefs, recentEvents } = useCognitiveStore();

  const modEntries: [string, number][] = [
    ['arousal', modulators.arousal],
    ['resolution', modulators.resolution],
    ['openness', modulators.openness],
    ['surprise threshold', modulators.surprise_threshold],
    ['social drive', modulators.social_drive],
  ];

  const emotionEntries: [string, number][] = [
    ['valence', emotions.valence],
    ['arousal', emotions.arousal],
    ['dominance', emotions.dominance],
    ['certainty', emotions.certainty],
    ['novelty', emotions.novelty],
    ['social', emotions.social],
  ];

  const engramCount = '—';
  const connectionCount = '—';

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: '32px 24px' }}>
      <div style={{ maxWidth: 'var(--message-max-width)', margin: '0 auto', width: '100%' }}>
        {/* Cognitive Modulators */}
        <Section label="cognitive modulators">
          <div className="flex flex-col gap-3.5">
            {modEntries.map(([label, value]) => (
              <Modulator key={label} label={label} value={value} />
            ))}
          </div>
        </Section>

        {/* Memory */}
        <Section label="memory">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Card label="Engrams" value={engramCount} detail="No data yet" />
            <Card label="Connections" value={connectionCount} detail="No data yet" />
            <BeliefsCard beliefs={beliefs} />
          </div>
        </Section>

        {/* Emotional State */}
        <Section label="emotional state">
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {emotionEntries.map(([label, value]) => (
              <EmotionBar key={label} label={label} value={value} />
            ))}
          </div>
        </Section>

        {/* Recent Events */}
        <Section label="recent events">
          {recentEvents.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--text-ghost)', fontStyle: 'italic' }}>No events yet. Events appear as you interact with Luca.</div>
          ) : (
            <div className="flex flex-col">
              {recentEvents.slice(0, 10).map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', minWidth: 80 }}>{ev.type}</span>
                  <div className="rounded-full" style={{ width: 5, height: 5, background: 'var(--text-secondary)', opacity: ev.salience }} />
                  <span className="ml-auto text-xs" style={{ color: 'var(--text-ghost)' }}>{formatTime(ev.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 0', marginBottom: 32 }}>
          Dashboard data will populate as you chat with Luca.
        </div>
      </div>
    </div>
  );
}

/* ====== Thoughts Tab ====== */
function ThoughtsTab() {
  const { thoughts } = useCognitiveStore();
  const [filter, setFilter] = useState<ThoughtFilter>('all');

  const filters: { label: string; value: ThoughtFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Dreams', value: 'dream' },
    { label: 'Reflections', value: 'reflection' },
    { label: 'Observations', value: 'observation' },
    { label: 'Decisions', value: 'decision' },
  ];

  const filtered = filter === 'all' ? thoughts : thoughts.filter((t) => t.type === filter);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ padding: '12px 24px', position: 'sticky', top: 0 }}>
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="cursor-pointer"
            style={{
              borderRadius: 100, padding: '6px 14px', fontSize: 11, fontWeight: 500,
              background: filter === f.value ? 'var(--bg-surface)' : 'transparent',
              color: filter === f.value ? 'var(--text-secondary)' : 'var(--text-ghost)',
              border: `1px solid ${filter === f.value ? 'transparent' : 'var(--border)'}`,
              fontFamily: 'var(--font-sans)', transition: 'all var(--dur-fast) var(--ease-out)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Stream entries */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 24px 32px' }}>
        <div style={{ maxWidth: 'var(--message-max-width)', margin: '0 auto', width: '100%' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16">
              <StreamLoader />
              <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>Awaiting thoughts…</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((t) => (
                <ThoughtEntry key={t.id} thought={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThoughtEntry({ thought }: { thought: { type: string; source: string; salience: number; created_at: string; content: string; trigger: string | null } }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{thought.source}</span>
        <div className="rounded-full" style={{ width: 5, height: 5, background: 'var(--text-secondary)', opacity: thought.salience }} />
        <span className="ml-auto" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{formatTime(thought.created_at)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{thought.content}</div>
      {thought.trigger && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-ghost)', fontStyle: 'italic', marginTop: 6 }}>{thought.trigger}</div>
      )}
    </div>
  );
}

function StreamLoader() {
  return (
    <div className="flex items-center gap-2">
      {[0, 0.4, 0.8].map((delay, i) => (
        <div key={i} className="rounded-full" style={{ width: 4, height: 4, background: 'var(--text-ghost)', animation: `stream-breathe 1.6s ease-in-out infinite`, animationDelay: `${delay}s` }} />
      ))}
    </div>
  );
}

/* ====== Shared Components ====== */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-ghost)', marginBottom: 16 }}>{label}</div>
      {children}
    </div>
  );
}

function Modulator({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 text-right" style={{ width: 120, fontSize: 12, color: 'var(--text-ghost)' }}>{label}</div>
      <div className="flex-1 relative overflow-hidden" style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2 }}>
        <div style={{ height: '100%', background: 'var(--metric-fill)', borderRadius: 2, width: `${value * 100}%`, transition: 'width var(--dur-slow) var(--ease-premium)', animation: 'dash-breathe 4s ease-in-out infinite' }} />
      </div>
      <div className="shrink-0 text-left" style={{ width: 32, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>{value.toFixed(2)}</div>
    </div>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20, transition: 'border-color var(--dur-fast) var(--ease-out)' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-ghost)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{detail}</div>
    </div>
  );
}

function BeliefsCard({ beliefs }: { beliefs: { text: string; strength: number }[] }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20, transition: 'border-color var(--dur-fast) var(--ease-out)' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-ghost)', marginBottom: 8 }}>Beliefs</div>
      {beliefs.length === 0 ? (
        <>
          <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>—</div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>No data yet</div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {beliefs.slice(0, 5).map((b, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{b.text}</div>
              <div className="flex items-center gap-2 mt-1">
                <div style={{ flex: 1, height: 2, background: 'var(--bg-surface)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--metric-fill)', width: `${b.strength * 100}%`, borderRadius: 1 }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>{Math.round(b.strength * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmotionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-2">
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 overflow-hidden" style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: 'var(--metric-fill)', borderRadius: 2, width: `${Math.abs(value) * 100}%` }} />
        </div>
        <span className="shrink-0" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', minWidth: 35, textAlign: 'right' }}>{value.toFixed(2)}</span>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

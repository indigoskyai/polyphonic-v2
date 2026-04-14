import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';

type Section = 'modulators' | 'memory' | 'emotions' | 'events' | 'thoughts';
type ThoughtFilter = 'all' | 'dream' | 'reflection' | 'observation' | 'decision';

const sections: { id: Section; label: string; icon: JSX.Element }[] = [
  { id: 'modulators', label: 'Modulators', icon: <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.3}><path d="M2 4h10M2 7h10M2 10h10"/><circle cx={5} cy={4} r={1.2} fill="currentColor"/><circle cx={9} cy={7} r={1.2} fill="currentColor"/><circle cx={4} cy={10} r={1.2} fill="currentColor"/></svg> },
  { id: 'memory', label: 'Memory', icon: <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.3}><rect x={2} y={2} width={10} height={10} rx={2}/><path d="M5 5h4M5 7h4M5 9h2"/></svg> },
  { id: 'emotions', label: 'Emotions', icon: <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.3}><circle cx={7} cy={7} r={5}/><path d="M4.5 8.5c.5 1 1.5 1.5 2.5 1.5s2-.5 2.5-1.5"/></svg> },
  { id: 'events', label: 'Events', icon: <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.3}><path d="M2 3h10v8H2z"/><path d="M2 5.5h10"/><path d="M5 2v2M9 2v2"/></svg> },
  { id: 'thoughts', label: 'Thoughts', icon: <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.3}><path d="M3 10V4a4 4 0 0 1 8 0v1"/><circle cx={7} cy={8} r={3}/><path d="M7 7v2"/></svg> },
];

export default function DashboardView() {
  const [active, setActive] = useState<Section>('modulators');
  const { user } = useAuthStore();
  const { load, subscribe, loaded } = useCognitiveStore();

  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsub = subscribe(user.id);
    return unsub;
  }, [user?.id]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Section Nav */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 180, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}>
        {/* Header */}
        <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Inner Life</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="rounded-full" style={{ width: 4, height: 4, background: 'var(--text-tertiary)', animation: 'breathe-dot 3s ease-in-out infinite' }} />
          </div>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-0.5" style={{ padding: '12px 8px' }}>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className="flex items-center gap-2.5 rounded cursor-pointer text-left"
              style={{
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: active === s.id ? 450 : 400,
                fontFamily: 'var(--font-sans)',
                color: active === s.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: active === s.id ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                transition: 'all var(--dur-fast) var(--ease-out)',
                letterSpacing: '0.01em',
              }}
            >
              <span style={{ opacity: active === s.id ? 0.9 : 0.5, transition: 'opacity var(--dur-fast) var(--ease-out)' }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Status */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-1.5">
            <div className="rounded-full" style={{ width: 4, height: 4, background: 'var(--text-tertiary)', animation: 'breathe-dot 3s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>connected</span>
          </div>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '32px 40px' }}>
        <div style={{ maxWidth: 'var(--message-max-width)', margin: '0 auto', width: '100%' }}>
          {active === 'modulators' && <ModulatorsPanel />}
          {active === 'memory' && <MemoryPanel />}
          {active === 'emotions' && <EmotionsPanel />}
          {active === 'events' && <EventsPanel />}
          {active === 'thoughts' && <ThoughtsPanel />}
        </div>
      </div>
    </div>
  );
}

/* ====== Modulators Panel ====== */
function ModulatorsPanel() {
  const { modulators } = useCognitiveStore();
  const entries: [string, number][] = [
    ['arousal', modulators.arousal],
    ['resolution', modulators.resolution],
    ['openness', modulators.openness],
    ['surprise threshold', modulators.surprise_threshold],
    ['social drive', modulators.social_drive],
  ];

  return (
    <div>
      <PanelHeader label="Cognitive Modulators" description="Active processing parameters that shape how Luca perceives and responds." />
      <div className="flex flex-col gap-4 mt-6">
        {entries.map(([label, value]) => (
          <Modulator key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

/* ====== Memory Panel ====== */
function MemoryPanel() {
  const { beliefs } = useCognitiveStore();
  return (
    <div>
      <PanelHeader label="Memory" description="Stored engrams, connections, and evolving beliefs." />
      <div className="grid gap-3 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Card label="Engrams" value="—" detail="No data yet" />
        <Card label="Connections" value="—" detail="No data yet" />
        <BeliefsCard beliefs={beliefs} />
      </div>
    </div>
  );
}

/* ====== Emotions Panel ====== */
function EmotionsPanel() {
  const { emotions } = useCognitiveStore();
  const entries: [string, number][] = [
    ['valence', emotions.valence],
    ['arousal', emotions.arousal],
    ['dominance', emotions.dominance],
    ['certainty', emotions.certainty],
    ['novelty', emotions.novelty],
    ['social', emotions.social],
  ];

  return (
    <div>
      <PanelHeader label="Emotional State" description="Current emotional dimensions that color Luca's responses." />
      <div className="grid gap-4 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {entries.map(([label, value]) => (
          <EmotionBar key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

/* ====== Events Panel ====== */
function EventsPanel() {
  const { recentEvents } = useCognitiveStore();
  return (
    <div>
      <PanelHeader label="Recent Events" description="Interactions and triggers that have shaped Luca's current state." />
      <div className="mt-6">
        {recentEvents.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-ghost)', fontStyle: 'italic' }}>No events yet. Events appear as you interact with Luca.</div>
        ) : (
          <div className="flex flex-col">
            {recentEvents.slice(0, 20).map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', minWidth: 80 }}>{ev.type}</span>
                <div className="rounded-full" style={{ width: 5, height: 5, background: 'var(--text-secondary)', opacity: ev.salience }} />
                <span className="ml-auto text-xs" style={{ color: 'var(--text-ghost)' }}>{formatTime(ev.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====== Thoughts Panel ====== */
function ThoughtsPanel() {
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
    <div>
      <PanelHeader label="Thoughts" description="Luca's internal processing stream — dreams, reflections, observations." />

      {/* Filter pills */}
      <div className="flex items-center gap-2 mt-5 mb-6">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="cursor-pointer"
            style={{
              borderRadius: 100, padding: '5px 12px', fontSize: 11, fontWeight: 450,
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <StreamLoader />
          <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>Awaiting thoughts…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {filtered.map((t) => (
            <ThoughtEntry key={t.id} thought={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ====== Shared Components ====== */

function PanelHeader({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.01em', marginBottom: 4 }}>{label}</h2>
      <p style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.5 }}>{description}</p>
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
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-ghost)', marginBottom: 8 }}>Beliefs</div>
      {beliefs.length === 0 ? (
        <>
          <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>—</div>
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

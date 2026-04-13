export default function DashboardView() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Inner Life</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full" style={{ background: 'var(--text-tertiary)', animation: 'dash-breathe 3s ease-in-out infinite' }} />
          <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>connected</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '32px 24px' }}>
        <div style={{ maxWidth: 'var(--message-max-width)', margin: '0 auto', width: '100%' }}>
          {/* Modulators */}
          <Section label="cognitive modulators">
            <div className="flex flex-col gap-3.5">
              <Modulator label="curiosity" value={0.74} />
              <Modulator label="focus" value={0.82} />
              <Modulator label="confidence" value={0.65} />
              <Modulator label="empathy" value={0.88} />
              <Modulator label="creativity" value={0.63} />
            </div>
          </Section>

          {/* Memory */}
          <Section label="memory">
            <div className="grid grid-cols-3 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <Card label="Engrams" value="--" detail="No data yet" />
              <Card label="Connections" value="--" detail="No data yet" />
              <Card label="Beliefs" value="--" detail="No data yet" />
            </div>
          </Section>

          {/* Emotional state */}
          <Section label="emotional state">
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <EmotionBar label="coherence" value={0.82} />
              <EmotionBar label="clarity" value={0.91} />
              <EmotionBar label="excitement" value={0.58} />
              <EmotionBar label="social drive" value={0.84} />
            </div>
          </Section>

          <div style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 0', marginBottom: 32 }}>
            Dashboard data will populate as you chat with Luca.
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="text-[10px] font-medium uppercase" style={{ letterSpacing: '0.1em', color: 'var(--text-ghost)', marginBottom: 16 }}>{label}</div>
      {children}
    </div>
  );
}

function Modulator({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 text-right text-xs" style={{ width: 120, color: 'var(--text-ghost)' }}>{label}</div>
      <div className="flex-1 relative overflow-hidden" style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2 }}>
        <div style={{ height: '100%', background: 'var(--metric-fill)', borderRadius: 2, width: `${value * 100}%`, transition: 'width var(--dur-slow) var(--ease-premium)', animation: 'dash-breathe 4s ease-in-out infinite' }} />
      </div>
      <div className="shrink-0 text-left text-xs" style={{ width: 32, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>{value.toFixed(2)}</div>
    </div>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20, transition: 'border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)' }}>
      <div className="text-[10px] font-medium uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-ghost)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-ghost)' }}>{detail}</div>
    </div>
  );
}

function EmotionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 overflow-hidden" style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: 'var(--metric-fill)', borderRadius: 2, width: `${value * 100}%` }} />
        </div>
        <span className="text-xs shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', minWidth: 35, textAlign: 'right' }}>{value.toFixed(2)}</span>
      </div>
    </div>
  );
}

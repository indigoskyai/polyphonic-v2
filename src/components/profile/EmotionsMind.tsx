/**
 * EmotionsMind — Emotions tab in the Luca's Mind design language.
 * Combines mnemos_emotional_state (current + 90-day history),
 * affective trajectory from memories, and prose landscape fields.
 */
import { useMemo } from 'react';
import ProfileMindShell, { timeAgoShort } from './ProfileMindShell';
import {
  TraitBar, TagCloud, QuoteCard, RadarMini,
  PanelHead, Empty, Sparkbar, qualLabel,
} from './mindViz';
import { asProfileRecord, profileTagItems, profileText } from '@/lib/profileData';

type LandscapeData = {
  baseline_mood?: string;
  emotional_range?: string;
  regulation_style?: string;
  granularity?: string;
  triggers?: Array<string | { label: string; count?: number }>;
  coping_mechanisms?: Array<string | { label: string; count?: number }>;
  [k: string]: any;
};

type EmotionalState = {
  valence?: number; arousal?: number; dominance?: number;
  certainty?: number; social?: number; temporal?: number;
  recorded_at?: string;
};

type EmotionalSeries = {
  current: EmotionalState | null;
  history: Array<EmotionalState & { recorded_at: string }>;
};

type MemoryStats = {
  affectiveTrajectory: Array<{ at: string; valence: number; intensity: number }>;
  [k: string]: any;
};

interface Props {
  data: LandscapeData | null | undefined;
  emotionalSeries: EmotionalSeries | null;
  memoryStats: MemoryStats | null;
  updatedAt?: string;
  version?: number;
}

const AXES = [
  { key: 'valence', label: 'Valence' },
  { key: 'arousal', label: 'Arousal' },
  { key: 'dominance', label: 'Dominance' },
  { key: 'certainty', label: 'Certainty' },
  { key: 'social', label: 'Social' },
  { key: 'temporal', label: 'Temporal' },
];

const HISTORY_DAYS = 90;

/** Normalize an axis value (-1..1 or 0..1) to 0..1 */
function norm01(v: number | undefined | null): number {
  if (v == null) return 0.5;
  if (v >= -1 && v <= 1 && v < 0) return (v + 1) / 2;
  if (v >= -1 && v <= 1) return v <= 1 && v >= 0 ? v : (v + 1) / 2;
  return 0.5;
}

export default function EmotionsMind({ data, emotionalSeries, memoryStats, updatedAt, version }: Props) {
  const record = useMemo(() => asProfileRecord(data), [data]);

  const currentValues = useMemo(() => {
    if (!emotionalSeries?.current) return null;
    const out: Record<string, number> = {};
    for (const a of AXES) out[a.key] = norm01((emotionalSeries.current as any)[a.key]);
    return out;
  }, [emotionalSeries]);

  const dominant = useMemo(() => {
    if (!currentValues) return null;
    return Object.entries(currentValues).sort((a, b) => b[1] - a[1])[0];
  }, [currentValues]);

  const dominantLabel = AXES.find(a => a.key === dominant?.[0])?.label ?? '—';

  const heatmapRows = useMemo(() => {
    if (!emotionalSeries?.history.length) return [];
    return AXES.map(a => {
      const recent = emotionalSeries.history.slice(-HISTORY_DAYS);
      const values: Array<number | null> = recent.map(h => {
        const v = (h as any)[a.key];
        return typeof v === 'number' ? v : null;
      });
      while (values.length < HISTORY_DAYS) values.unshift(null);
      return { label: a.label, values };
    });
  }, [emotionalSeries]);

  const trajectory = memoryStats?.affectiveTrajectory ?? [];
  const trajStats = useMemo(() => {
    if (!trajectory.length) return null;
    const xs = trajectory.map(t => new Date(t.at).getTime());
    const min = Math.min(...xs), max = Math.max(...xs);
    const span = Math.max(1, max - min);
    const meanV = trajectory.reduce((s, p) => s + p.valence, 0) / trajectory.length;
    return { min, max, span, meanV };
  }, [trajectory]);

  const triggers = profileTagItems(record.triggers);
  const coping = profileTagItems(record.coping_mechanisms);

  return (
    <ProfileMindShell
      num="08"
      eyebrow="Emotions"
      title="How you feel"
      version={version}
      updatedAt={updatedAt}
      sub={
        currentValues
          ? <><span className="accent">{dominantLabel} reads {qualLabel(dominant?.[1] ?? 0.5)}.</span>{' '}Six-axis affective field tracked across {emotionalSeries?.history.length ?? 0} recordings.</>
          : <>Affective field assembling. Six axes tracked when sessions accumulate state.</>
      }
    >
      {/* i — Affective signature */}
      <div className="m-panel m-p-state" style={{ gridColumn: 'span 5' }}>
        <PanelHead num="i" label="Affective signature" aside={<>now · <span className="v">6 axes</span></>} />
        {currentValues ? (
          <div className="m-state-body">
            <div className="m-state-svg-wrap">
              <RadarMini axes={AXES} values={currentValues} />
            </div>
            <div className="m-state-readout">
              <p className="m-state-whisper">
                <span className="qual">{dominantLabel} {qualLabel(dominant?.[1] ?? 0.5)}</span>.{' '}
                Snapshot of present coordinates.
              </p>
              {AXES.map(a => (
                <div key={a.key} className="m-state-row">
                  <span>{a.label}</span><span className="v">{currentValues[a.key].toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty note="Affective state forming." />
        )}
      </div>

      {/* ii — 90-day weather */}
      <div className="m-panel" style={{ gridColumn: 'span 7' }}>
        <PanelHead
          num="ii"
          label="90-day weather"
          aside={<><span className="v">{emotionalSeries?.history.length ?? 0}</span> entries</>}
        />
        {heatmapRows.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            {heatmapRows.map(row => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', alignItems: 'center', gap: 12 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--text-soft)', letterSpacing: 'var(--track-meta)',
                  textTransform: 'uppercase',
                }}>{row.label}</div>
                <Sparkbar values={row.values} height={14} />
              </div>
            ))}
            <div style={{
              marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 8,
              color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
              textTransform: 'uppercase', textAlign: 'right',
            }}>
              oldest ← {Math.min(HISTORY_DAYS, emotionalSeries?.history.length ?? 0)} cells → newest
            </div>
          </div>
        ) : (
          <Empty note="No emotional history yet." />
        )}
      </div>

      {/* iii — Valence trajectory */}
      <div className="m-panel" style={{ gridColumn: 'span 12' }}>
        <PanelHead
          num="iii"
          label="Valence trajectory"
          aside={<><span className="v">{trajectory.length}</span> events</>}
        />
        {trajectory.length && trajStats ? (
          <ValenceScatter trajectory={trajectory} stats={trajStats} />
        ) : (
          <Empty note="No memory affect recorded." />
        )}
      </div>

      {/* iv — Landscape prose */}
      <div className="m-panel" style={{ gridColumn: 'span 7' }}>
        <PanelHead num="iv" label="Landscape" aside={<>updated · <span className="v">{timeAgoShort(updatedAt)}</span></>} />
        {profileText(record.baseline_mood) || profileText(record.emotional_range) || profileText(record.regulation_style) || profileText(record.granularity) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profileText(record.baseline_mood) && <QuoteCard eyebrow="Baseline mood" body={profileText(record.baseline_mood)} />}
            {profileText(record.emotional_range) && <QuoteCard eyebrow="Range" body={profileText(record.emotional_range)} />}
            {profileText(record.regulation_style) && <QuoteCard eyebrow="Regulation" body={profileText(record.regulation_style)} />}
            {profileText(record.granularity) && <QuoteCard eyebrow="Granularity" body={profileText(record.granularity)} />}
          </div>
        ) : (
          <Empty note="Landscape prose forming." />
        )}
      </div>

      {/* v — Triggers & coping */}
      <div className="m-panel" style={{ gridColumn: 'span 5' }}>
        <PanelHead num="v" label="Triggers & coping" aside={<><span className="v">{triggers.length + coping.length}</span> signals</>} />
        {triggers.length || coping.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
                textTransform: 'uppercase', marginBottom: 8,
              }}>Triggers · {triggers.length}</div>
              {triggers.length ? <TagCloud items={triggers} /> : <Empty note="No triggers surfaced." />}
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
                textTransform: 'uppercase', marginBottom: 8,
              }}>Coping · {coping.length}</div>
              {coping.length ? <TagCloud items={coping} /> : <Empty note="No coping mechanisms surfaced." />}
            </div>
          </div>
        ) : (
          <Empty note="Triggers and coping not yet surfaced." />
        )}
      </div>
    </ProfileMindShell>
  );
}

/* ─── ValenceScatter ─── inline SVG plot reusing Mind tokens */
function ValenceScatter({
  trajectory, stats,
}: {
  trajectory: Array<{ at: string; valence: number; intensity: number }>;
  stats: { min: number; max: number; span: number; meanV: number };
}) {
  const W = 980, H = 180, padX = 16, padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const yFor = (v: number) => padY + (1 - (v + 1) / 2) * innerH; // -1..1 → bottom..top
  const xFor = (t: string) => padX + ((new Date(t).getTime() - stats.min) / stats.span) * innerW;
  const meanY = yFor(stats.meanV);
  const zeroY = yFor(0);

  return (
    <div style={{ width: '100%', overflow: 'hidden', paddingTop: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="m-state-svg" preserveAspectRatio="none" style={{ width: '100%', height: 200 }}>
        {/* zero line */}
        <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} className="md-grid" />
        {/* mean line */}
        <line x1={padX} x2={W - padX} y1={meanY} y2={meanY} className="md-spoke" strokeDasharray="2 4" />
        {/* events */}
        {trajectory.map((p, i) => {
          const r = 1.5 + Math.max(0, Math.min(1, p.intensity)) * 4;
          return <circle key={i} cx={xFor(p.at).toFixed(1)} cy={yFor(p.valence).toFixed(1)} r={r} className="md-vertex" />;
        })}
        {/* axis labels */}
        <text x={padX} y={padY + 6} className="md-label" textAnchor="start">+1</text>
        <text x={padX} y={H - padY + 4} className="md-label" textAnchor="start">−1</text>
        <text x={W - padX} y={meanY - 4} className="md-label" textAnchor="end">μ {stats.meanV.toFixed(2)}</text>
      </svg>
    </div>
  );
}

import { useMemo } from 'react';

/**
 * Profile visualization primitives.
 *
 * All components share the lab-instrument aesthetic: hairline strokes only,
 * cream on dark, mathematical precision, no bloom. Each visual element earns
 * its place by encoding meaning — no decorative graphics.
 */

const INK = 'rgba(244, 243, 240, 0.92)';
const INK_SOFT = 'rgba(244, 243, 240, 0.6)';
const INK_GHOST = 'rgba(244, 243, 240, 0.32)';
const INK_HAIR = 'rgba(244, 243, 240, 0.10)';
const INK_FAINT = 'rgba(244, 243, 240, 0.06)';

/* ────────────────────────────────────────────────────────────
   Sigil — generative Big Five signature
   ──────────────────────────────────────────────────────────── */

type BigFive = Record<string, { score?: number } | number | undefined> | null | undefined;

const TRAIT_ORDER = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const;
const TRAIT_INITIAL: Record<string, string> = {
  openness: 'O', conscientiousness: 'C', extraversion: 'E', agreeableness: 'A', neuroticism: 'N',
};

function score(entry: any): number {
  if (typeof entry === 'number') return entry;
  if (entry && typeof entry === 'object' && typeof entry.score === 'number') return entry.score;
  return 50;
}

export function Sigil({ bigFive, byType, size = 320, showLabels = false }: {
  bigFive?: BigFive; byType?: Record<string, number> | null; size?: number; showLabels?: boolean;
}) {
  const cx = size / 2, cy = size / 2;
  const outerRadius = size / 2 - (showLabels ? 32 : 18);
  const innerRadius = outerRadius * 0.18;

  const traits = useMemo(() => TRAIT_ORDER.map((key, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const s = bigFive ? score(bigFive[key]) : 50;
    const r = innerRadius + (outerRadius - innerRadius) * (s / 100);
    return {
      key, score: s, angle,
      x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
      spokeX: cx + Math.cos(angle) * outerRadius, spokeY: cy + Math.sin(angle) * outerRadius,
      labelX: cx + Math.cos(angle) * (outerRadius + 14), labelY: cy + Math.sin(angle) * (outerRadius + 14),
      initial: TRAIT_INITIAL[key] || '·',
    };
  }), [bigFive, cx, cy, outerRadius, innerRadius]);

  const polygon = traits.map((t, i) => (i === 0 ? `M${t.x},${t.y}` : `L${t.x},${t.y}`)).join(' ') + ' Z';

  const ticks = useMemo(() => {
    if (!byType) return [];
    const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return [];
    const max = entries[0][1] || 1;
    return entries.map(([t, c], i, arr) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / arr.length;
      const len = 2 + (c / max) * 12;
      return {
        type: t,
        x1: cx + Math.cos(angle) * (outerRadius + 4), y1: cy + Math.sin(angle) * (outerRadius + 4),
        x2: cx + Math.cos(angle) * (outerRadius + 4 + len), y2: cy + Math.sin(angle) * (outerRadius + 4 + len),
      };
    });
  }, [byType, cx, cy, outerRadius]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Personality signature">
      {[0.25, 0.5, 0.75, 1].map(s => (
        <circle key={s} cx={cx} cy={cy} r={innerRadius + (outerRadius - innerRadius) * s} fill="none" stroke={INK_FAINT} strokeWidth={0.5} />
      ))}
      {traits.map(t => <line key={`spoke-${t.key}`} x1={cx} y1={cy} x2={t.spokeX} y2={t.spokeY} stroke={INK_FAINT} strokeWidth={0.5} />)}
      <path d={polygon} fill="rgba(244, 240, 232, 0.045)" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      {traits.map(t => <circle key={`v-${t.key}`} cx={t.x} cy={t.y} r={2} fill={INK} />)}
      {showLabels && traits.map(t => (
        <text key={`l-${t.key}`} x={t.labelX} y={t.labelY} fontSize={9} fontFamily="var(--font-mono)" fill={INK_SOFT} textAnchor="middle" dominantBaseline="middle" style={{ letterSpacing: '0.1em' }}>{t.initial}</text>
      ))}
      {ticks.map((tk, i) => <line key={`tk-${i}`} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke={INK_SOFT} strokeWidth={0.75} strokeLinecap="round" />)}
      <circle cx={cx} cy={cy} r={4} fill="none" stroke={INK_GHOST} strokeWidth={0.5} />
      <circle cx={cx} cy={cy} r={1.5} fill={INK_SOFT} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   TraitTrace — single trait readout with normal-distribution context
   ──────────────────────────────────────────────────────────── */

export function TraitTrace({ label, value, max = 100, evidence }: {
  label: string; value: number; max?: number; evidence?: string;
}) {
  const pct = Math.min(value / max, 1);
  const w = 600, h = 60;
  // Bell curve as reference
  const bell = useMemo(() => {
    const points: string[] = [];
    const samples = 60;
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples);
      const z = (x - 0.5) * 4; // -2 to +2 sigma
      const y = Math.exp(-(z * z) / 2);
      const px = x * w;
      const py = h - 4 - y * (h - 14);
      points.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return points.join(' ');
  }, [w, h]);

  const markerX = pct * w;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: INK_SOFT, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', minWidth: 130 }}>
          {label.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: 22, fontWeight: 300, color: INK, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ fontSize: 10, color: INK_GHOST, fontFamily: 'var(--font-mono)' }}>/{max}</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', marginBottom: 8 }}>
        {/* Tick marks at quartiles */}
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1={t * w} y1={h - 4} x2={t * w} y2={h - 1} stroke={INK_HAIR} strokeWidth={0.5} />
        ))}
        {/* Bell curve */}
        <path d={bell} stroke={INK_HAIR} strokeWidth={0.75} fill="none" />
        {/* Baseline */}
        <line x1={0} y1={h - 4} x2={w} y2={h - 4} stroke={INK_HAIR} strokeWidth={0.5} />
        {/* Marker — vertical hairline + dot */}
        <line x1={markerX} y1={6} x2={markerX} y2={h - 4} stroke={INK} strokeWidth={1} />
        <circle cx={markerX} cy={h - 4} r={3} fill={INK} />
      </svg>
      {evidence && (
        <p style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.65, fontStyle: 'italic', margin: 0, paddingLeft: 142 }}>
          {evidence}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   InsightPlate — prose dimension card with typographic register
   ──────────────────────────────────────────────────────────── */

export function InsightPlate({ label, text, prominence = 'normal' }: {
  label: string; text: string; prominence?: 'normal' | 'lead';
}) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  return (
    <div style={{
      padding: prominence === 'lead' ? '20px 20px' : '14px 20px',
      borderTop: `1px solid ${INK_HAIR}`,
      display: 'grid',
      gridTemplateColumns: '160px 1fr',
      gap: 24,
      alignItems: 'baseline',
    }}>
      <span style={{ fontSize: 10, color: INK_SOFT, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <p style={{
        fontSize: prominence === 'lead' ? 14 : 12.5,
        color: prominence === 'lead' ? 'var(--text-primary)' : 'var(--text-body)',
        lineHeight: 1.7,
        margin: 0,
      }}>
        {trimmed}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   RankedList — for values hierarchy, relationships, etc.
   ──────────────────────────────────────────────────────────── */

export function RankedList({ items }: {
  items: Array<{ label: string; sublabel?: string; evidence?: string; rank?: number | string }>;
}) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr',
          gap: 16,
          padding: '12px 0',
          borderBottom: i < items.length - 1 ? `1px solid ${INK_FAINT}` : 'none',
          alignItems: 'baseline',
        }}>
          <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: INK_GHOST, fontWeight: 300, letterSpacing: '0.04em' }}>
            {String(item.rank ?? i + 1).padStart(2, '0')}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: item.evidence ? 4 : 0 }}>
              <span style={{ fontSize: 14, color: INK, fontFamily: 'var(--font-serif)', fontStyle: 'italic', textTransform: 'capitalize' }}>
                {item.label}
              </span>
              {item.sublabel && (
                <span style={{ fontSize: 10, color: INK_GHOST, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {item.sublabel}
                </span>
              )}
            </div>
            {item.evidence && (
              <p style={{ fontSize: 12, color: 'var(--text-body)', lineHeight: 1.65, margin: 0 }}>
                {item.evidence}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   ConstellationCloud — weighted tag cloud for themes/triggers/biases
   ──────────────────────────────────────────────────────────── */

export function ConstellationCloud({ items, weighted = true, maxFontSize = 16, minFontSize = 10 }: {
  items: string[]; weighted?: boolean; maxFontSize?: number; minFontSize?: number;
}) {
  // For short lists (1-2 items), don't render the most prominent item huge — clamp range tightly.
  const span = items.length <= 3 ? Math.min(2, maxFontSize - minFontSize) : maxFontSize - minFontSize;
  // Weight by reverse rank (first items are heavier — assumes pre-sorted by frequency)
  const sized = items.map((label, i) => {
    const rank = items.length > 1 ? i / (items.length - 1) : 0;
    const weight = weighted ? 1 - rank * 0.5 : 1;
    const fontSize = minFontSize + (weighted ? (1 - rank) * span : span * 0.5);
    const opacity = weighted ? 0.4 + (1 - rank) * 0.5 : 0.7;
    return { label, weight, fontSize, opacity };
  });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px', padding: '4px 0' }}>
      {sized.map((s, i) => (
        <span key={i} style={{
          fontSize: s.fontSize,
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          color: `rgba(244, 243, 240, ${s.opacity})`,
          lineHeight: 1.4,
          letterSpacing: '0.005em',
        }}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   PhaseDiagram — 2D position plot with archetype regions
   ──────────────────────────────────────────────────────────── */

export function PhaseDiagram({ xLabel, yLabel, xValue, yValue, regions, point, size = 240 }: {
  xLabel: string; yLabel: string;
  xValue: number; yValue: number; // 0-100
  regions?: Array<{ label: string; x: number; y: number; w: number; h: number }>;
  point?: { label?: string };
  size?: number;
}) {
  const pad = 28;
  const inner = size - pad * 2;
  const px = (v: number) => pad + (v / 100) * inner;
  const py = (v: number) => pad + (1 - v / 100) * inner;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {/* Frame */}
      <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke={INK_HAIR} strokeWidth={0.75} />
      {/* Grid */}
      {[0.25, 0.5, 0.75].map(t => (
        <g key={t}>
          <line x1={pad + t * inner} y1={pad} x2={pad + t * inner} y2={pad + inner} stroke={INK_FAINT} strokeWidth={0.5} />
          <line x1={pad} y1={pad + t * inner} x2={pad + inner} y2={pad + t * inner} stroke={INK_FAINT} strokeWidth={0.5} />
        </g>
      ))}
      {/* Regions */}
      {regions?.map((r, i) => (
        <g key={i}>
          <rect x={px(r.x)} y={py(r.y + r.h)} width={(r.w / 100) * inner} height={(r.h / 100) * inner} fill="rgba(244, 240, 232, 0.025)" stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="2 3" />
          <text x={px(r.x + r.w / 2)} y={py(r.y + r.h / 2)} fontSize={9} fill={INK_GHOST} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)" style={{ letterSpacing: '0.05em' }}>
            {r.label}
          </text>
        </g>
      ))}
      {/* Axis labels */}
      <text x={size / 2} y={size - 8} fontSize={9} fontFamily="var(--font-mono)" fill={INK_SOFT} textAnchor="middle" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>{xLabel}</text>
      <text x={10} y={size / 2} fontSize={9} fontFamily="var(--font-mono)" fill={INK_SOFT} textAnchor="middle" style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }} transform={`rotate(-90, 10, ${size / 2})`}>{yLabel}</text>
      {/* Crosshair to point */}
      <line x1={pad} y1={py(yValue)} x2={px(xValue)} y2={py(yValue)} stroke={INK_HAIR} strokeWidth={0.5} strokeDasharray="1 2" />
      <line x1={px(xValue)} y1={pad + inner} x2={px(xValue)} y2={py(yValue)} stroke={INK_HAIR} strokeWidth={0.5} strokeDasharray="1 2" />
      {/* The point */}
      <circle cx={px(xValue)} cy={py(yValue)} r={5} fill="none" stroke={INK} strokeWidth={1} />
      <circle cx={px(xValue)} cy={py(yValue)} r={2} fill={INK} />
      {point?.label && (
        <text x={px(xValue) + 8} y={py(yValue) - 6} fontSize={9} fontFamily="var(--font-mono)" fill={INK_SOFT} style={{ letterSpacing: '0.06em' }}>{point.label}</text>
      )}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   MagnitudeBars — vertical bar code for category distributions
   ──────────────────────────────────────────────────────────── */

export function MagnitudeBars({ data, height = 80 }: {
  data: Array<{ label: string; value: number }>; height?: number;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, padding: '4px 0', borderBottom: `1px solid ${INK_HAIR}` }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <span style={{ fontSize: 10, color: INK_GHOST, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{d.value}</span>
            <div style={{
              width: '100%', maxWidth: 32,
              height: `${(d.value / max) * 70}%`,
              background: 'rgba(244, 240, 232, 0.5)',
              borderRadius: 1,
              minHeight: 1,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: INK_SOFT, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   PlateSection — wrapper that gives a section its label + content
   ──────────────────────────────────────────────────────────── */

export function PlateSection({ label, count, children }: {
  label: string; count?: number | string; children: React.ReactNode;
}) {
  return (
    <section style={{ padding: '24px 0', borderTop: `1px solid ${INK_FAINT}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18, paddingLeft: 4 }}>
        <span style={{ fontSize: 10, color: INK_SOFT, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: 10, color: INK_GHOST, fontFamily: 'var(--font-mono)' }}>· {count}</span>
        )}
      </div>
      <div style={{ paddingLeft: 4 }}>{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   StatusStrip — page header band
   ──────────────────────────────────────────────────────────── */

export function StatusStrip({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 0', borderBottom: `1px solid ${INK_FAINT}` }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 9, color: INK_GHOST, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{item.label}</span>
          <span style={{ fontSize: 11, color: INK_SOFT, fontFamily: 'var(--font-mono)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   EmptyState — graceful skeleton for sparse data
   ──────────────────────────────────────────────────────────── */

export function EmptyState({ note, height = 80 }: { note: string; height?: number }) {
  return (
    <div style={{
      height, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px dashed ${INK_FAINT}`, borderRadius: 4,
      fontSize: 10, color: INK_GHOST, fontFamily: 'var(--font-mono)',
      letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>
      {note}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   BurstPlot — horizontal time series with vertical event hairlines.
   Each event renders as a vertical hairline; height encodes magnitude.
   Used for memory arrivals over time (engagement velocity).
   ──────────────────────────────────────────────────────────── */

export function BurstPlot({ events, height = 100, label }: {
  events: Array<{ at: number | string | Date; magnitude?: number }>;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => {
    if (!events?.length) return null;
    const stamps = events.map(e => ({
      t: typeof e.at === 'number' ? e.at : new Date(e.at).getTime(),
      m: typeof e.magnitude === 'number' ? Math.max(0.1, Math.min(1, e.magnitude)) : 0.5,
    })).filter(e => Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
    if (!stamps.length) return null;
    const tMin = stamps[0].t;
    const tMax = stamps[stamps.length - 1].t;
    const span = Math.max(1, tMax - tMin);
    return { stamps, tMin, tMax, span };
  }, [events]);

  if (!data) {
    return <EmptyState note={label ? `${label} — no data yet` : 'No timeline data yet'} height={height} />;
  }

  const W = 1000;
  const H = height;
  const padX = 12;
  const padTop = 8;
  const padBot = 18;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBot;

  // Format date labels for axis (start, mid, end)
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {/* Baseline */}
        <line x1={padX} y1={H - padBot} x2={W - padX} y2={H - padBot} stroke={INK_HAIR} strokeWidth={0.5} />
        {/* Quartile gridlines */}
        {[0.25, 0.5, 0.75].map(q => (
          <line key={q} x1={padX + q * innerW} y1={padTop} x2={padX + q * innerW} y2={H - padBot}
            stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="2 4" />
        ))}
        {/* Event hairlines */}
        {data.stamps.map((s, i) => {
          const x = padX + ((s.t - data.tMin) / data.span) * innerW;
          const h = innerH * s.m;
          const y1 = H - padBot - h;
          return <line key={i} x1={x} y1={y1} x2={x} y2={H - padBot}
            stroke={INK} strokeWidth={0.7} opacity={0.55} />;
        })}
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: INK_GHOST, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.06em', padding: '4px 12px 0',
      }}>
        <span>{fmt(data.tMin)}</span>
        <span>{data.stamps.length} events</span>
        <span>{fmt(data.tMax)}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   JourneyTimeline — 7-node horizontal phase timeline with click-to-reveal.
   ──────────────────────────────────────────────────────────── */

export function JourneyTimeline({ phases, activeIndex = 0, onSelect }: {
  phases: Array<{ key: string; label: string; symbol?: string; description?: string }>;
  activeIndex?: number;
  onSelect?: (index: number) => void;
}) {
  if (!phases?.length) return null;
  const W = 1000;
  const H = 90;
  const trackY = 36;
  const padX = 36;
  const innerW = W - padX * 2;
  const step = phases.length > 1 ? innerW / (phases.length - 1) : 0;

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {/* Track */}
        <line x1={padX} y1={trackY} x2={W - padX} y2={trackY} stroke={INK_HAIR} strokeWidth={0.75} />
        {/* Phase nodes */}
        {phases.map((p, i) => {
          const x = padX + i * step;
          const isActive = i === activeIndex;
          return (
            <g key={p.key} style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={onSelect ? () => onSelect(i) : undefined}>
              {/* Outer ring */}
              <circle cx={x} cy={trackY} r={isActive ? 12 : 8} fill="rgba(10, 10, 12, 1)"
                stroke={isActive ? INK : INK_GHOST} strokeWidth={isActive ? 1 : 0.75} />
              {/* Inner symbol or dot */}
              {p.symbol ? (
                <text x={x} y={trackY} fontSize={11} fontFamily="var(--font-mono)"
                  fill={isActive ? INK : INK_SOFT}
                  textAnchor="middle" dominantBaseline="central">{p.symbol}</text>
              ) : (
                <circle cx={x} cy={trackY} r={isActive ? 3 : 1.5}
                  fill={isActive ? INK : INK_GHOST} />
              )}
              {/* Label */}
              <text x={x} y={trackY + 30} fontSize={9} fontFamily="var(--font-mono)"
                fill={isActive ? INK_SOFT : INK_GHOST}
                textAnchor="middle" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {p.label}
              </text>
              {/* Index folio */}
              <text x={x} y={trackY - 18} fontSize={8} fontFamily="var(--font-mono)"
                fill={INK_GHOST} textAnchor="middle" style={{ letterSpacing: '0.1em' }}>
                {String(i + 1).padStart(2, '0')}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Reveal panel */}
      {phases[activeIndex]?.description && (
        <div style={{
          marginTop: 16, padding: '14px 18px',
          borderLeft: `1px solid ${INK_HAIR}`,
          fontSize: 12.5, color: 'var(--text-body)',
          lineHeight: 1.65, fontFamily: 'var(--font-serif)', fontStyle: 'italic',
        }}>
          {phases[activeIndex].description}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   RadialChart — generic n-axis polar plot.
   Supports multiple traces (snapshot vs reference / current vs trail).
   ──────────────────────────────────────────────────────────── */

export function RadialChart({ axes, traces, size = 240, showLabels = true, labelGap = 14 }: {
  axes: Array<{ key: string; label: string }>;
  traces: Array<{ values: Record<string, number>; opacity?: number; primary?: boolean }>;
  size?: number;
  showLabels?: boolean;
  labelGap?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const outerRadius = size / 2 - (showLabels ? labelGap + 12 : 12);
  const innerRadius = outerRadius * 0.12;

  if (!axes?.length) return null;

  const points = useMemo(() => {
    return axes.map((a, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
      return {
        key: a.key,
        label: a.label,
        angle,
        spokeX: cx + Math.cos(angle) * outerRadius,
        spokeY: cy + Math.sin(angle) * outerRadius,
        labelX: cx + Math.cos(angle) * (outerRadius + labelGap),
        labelY: cy + Math.sin(angle) * (outerRadius + labelGap),
      };
    });
  }, [axes, cx, cy, outerRadius, labelGap]);

  function tracePath(values: Record<string, number>): string {
    return points.map((p, i) => {
      const v = Math.max(0, Math.min(100, values[p.key] ?? 0));
      const r = innerRadius + (outerRadius - innerRadius) * (v / 100);
      const x = cx + Math.cos(p.angle) * r;
      const y = cy + Math.sin(p.angle) * r;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z';
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* Reference rings */}
      {[0.25, 0.5, 0.75, 1].map(s => (
        <circle key={s} cx={cx} cy={cy} r={innerRadius + (outerRadius - innerRadius) * s}
          fill="none" stroke={INK_FAINT} strokeWidth={0.5} />
      ))}
      {/* Spokes */}
      {points.map(p => (
        <line key={`spoke-${p.key}`} x1={cx} y1={cy} x2={p.spokeX} y2={p.spokeY}
          stroke={INK_FAINT} strokeWidth={0.5} />
      ))}
      {/* Traces (lower-priority first, so primary draws on top) */}
      {traces.map((trace, i) => {
        const isPrimary = trace.primary ?? i === traces.length - 1;
        const op = trace.opacity ?? (isPrimary ? 1 : 0.4);
        return (
          <g key={i} opacity={op}>
            <path d={tracePath(trace.values)}
              fill={isPrimary ? 'rgba(244, 240, 232, 0.045)' : 'none'}
              stroke={isPrimary ? INK : INK_GHOST}
              strokeWidth={isPrimary ? 1 : 0.75}
              strokeLinejoin="round"
              strokeDasharray={isPrimary ? undefined : '2 3'} />
            {isPrimary && points.map(p => {
              const v = Math.max(0, Math.min(100, trace.values[p.key] ?? 0));
              const r = innerRadius + (outerRadius - innerRadius) * (v / 100);
              const x = cx + Math.cos(p.angle) * r;
              const y = cy + Math.sin(p.angle) * r;
              return <circle key={`pt-${p.key}`} cx={x} cy={y} r={2} fill={INK} />;
            })}
          </g>
        );
      })}
      {/* Axis labels */}
      {showLabels && points.map(p => (
        <text key={`l-${p.key}`} x={p.labelX} y={p.labelY}
          fontSize={9} fontFamily="var(--font-mono)" fill={INK_SOFT}
          textAnchor="middle" dominantBaseline="middle"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {p.label}
        </text>
      ))}
      {/* Center anchor */}
      <circle cx={cx} cy={cy} r={1.5} fill={INK_SOFT} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   TimelineHeatmap — N-row × M-day grid with cell alpha = value.
   Rows = dimensions (e.g. emotional axes); columns = days.
   ──────────────────────────────────────────────────────────── */

export function TimelineHeatmap({ rows, days, height = 150, normalize = 'row' }: {
  /** rows[i] = { label, values: number[] } where values.length === days */
  rows: Array<{ label: string; values: Array<number | null | undefined> }>;
  days: number;
  height?: number;
  /** 'row' = normalize per row; 'global' = single max across all */
  normalize?: 'row' | 'global';
}) {
  if (!rows?.length || !days) {
    return <EmptyState note="Insufficient history yet" height={height} />;
  }

  const labelWidth = 90;
  const maxByRow = rows.map(r => {
    const vals = r.values.filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.max(...vals.map(Math.abs), 1) : 1;
  });
  const globalMax = Math.max(...maxByRow, 1);
  const cellH = Math.max(8, (height - rows.length * 2) / rows.length);
  const W = 1000;
  const cellW = (W - labelWidth) / days;

  return (
    <svg width="100%" height={rows.length * (cellH + 2) + 20} viewBox={`0 0 ${W} ${rows.length * (cellH + 2) + 20}`}
      preserveAspectRatio="none" style={{ display: 'block' }}>
      {rows.map((row, i) => {
        const rowMax = normalize === 'row' ? maxByRow[i] : globalMax;
        const yTop = i * (cellH + 2);
        return (
          <g key={row.label}>
            {/* Row label */}
            <text x={labelWidth - 8} y={yTop + cellH / 2} fontSize={9}
              fontFamily="var(--font-mono)" fill={INK_SOFT}
              textAnchor="end" dominantBaseline="middle"
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {row.label}
            </text>
            {/* Cells */}
            {row.values.slice(0, days).map((v, j) => {
              if (v == null) {
                return <rect key={j} x={labelWidth + j * cellW} y={yTop}
                  width={Math.max(1, cellW - 0.5)} height={cellH}
                  fill="none" stroke={INK_FAINT} strokeWidth={0.25} />;
              }
              const norm = Math.min(1, Math.abs(v) / rowMax);
              // Two-tone — negative values get a slightly cooler tint, positive warmer; both stay cream-family
              const isNegative = v < 0;
              const fillBase = isNegative ? '194, 192, 188' : '244, 240, 232';
              const alpha = 0.04 + norm * 0.55;
              return <rect key={j}
                x={labelWidth + j * cellW} y={yTop}
                width={Math.max(1, cellW - 0.5)} height={cellH}
                fill={`rgba(${fillBase}, ${alpha.toFixed(3)})`}
                stroke={INK_FAINT} strokeWidth={0.25} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   DivergenceBar — paired stated-vs-revealed bar with hairline connector.
   Shows where claimed importance diverges from observed signal.
   ──────────────────────────────────────────────────────────── */

export function DivergenceBar({ items }: {
  items: Array<{ label: string; stated: number; revealed: number; threshold?: number }>;
}) {
  if (!items?.length) return null;
  // Stacked layout: HTML label row + SVG bar row. Allows long labels to wrap
  // gracefully without colliding with the bar geometry.
  const W = 1000;
  const barH = 22; // bar block height
  const padX = 4;
  return (
    <div>
      {items.map((item, i) => {
        const stated = Math.max(0, Math.min(1, item.stated));
        const revealed = Math.max(0, Math.min(1, item.revealed));
        const divergence = Math.abs(stated - revealed);
        const threshold = item.threshold ?? 0.3;
        const flagged = divergence >= threshold;

        const trackX = padX;
        const trackW = W - padX * 2 - 56; // reserve right edge for ∗ + Δ
        const statedX = trackX + stated * trackW;
        const revealedX = trackX + revealed * trackW;

        return (
          <div
            key={i}
            style={{
              padding: '14px 4px 16px',
              borderTop: i === 0 ? 'none' : `1px solid ${INK_HAIR}`,
            }}
          >
            {/* Label row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  color: INK,
                  lineHeight: 1.5,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.12em',
                  color: flagged ? INK_SOFT : INK_GHOST,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {flagged && <span style={{ color: INK, marginRight: 8 }}>∗</span>}
                Δ{Math.round(divergence * 100)}
              </span>
            </div>

            {/* Bar row */}
            <svg
              width="100%"
              height={barH}
              viewBox={`0 0 ${W} ${barH}`}
              preserveAspectRatio="none"
              style={{ display: 'block' }}
            >
              {/* Track */}
              <line
                x1={trackX} y1={barH / 2} x2={trackX + trackW} y2={barH / 2}
                stroke={INK_FAINT} strokeWidth={0.5}
              />
              {/* Stated — upper hairline */}
              <line
                x1={trackX} y1={barH / 2 - 4} x2={statedX} y2={barH / 2 - 4}
                stroke={INK_SOFT} strokeWidth={1}
              />
              <text
                x={Math.min(statedX + 6, W - 4)} y={barH / 2 - 4}
                fontSize={7.5} fontFamily="var(--font-mono)"
                fill={INK_GHOST} dominantBaseline="middle"
                style={{ letterSpacing: '0.12em' }}
              >
                STATED
              </text>
              {/* Revealed — lower hairline */}
              <line
                x1={trackX} y1={barH / 2 + 4} x2={revealedX} y2={barH / 2 + 4}
                stroke={INK} strokeWidth={1}
              />
              <text
                x={Math.min(revealedX + 6, W - 4)} y={barH / 2 + 4}
                fontSize={7.5} fontFamily="var(--font-mono)"
                fill={INK_GHOST} dominantBaseline="middle"
                style={{ letterSpacing: '0.12em' }}
              >
                REVEALED
              </text>
              {/* Divergence connector */}
              <line
                x1={statedX} y1={barH / 2 - 4} x2={revealedX} y2={barH / 2 + 4}
                stroke={flagged ? INK : INK_HAIR}
                strokeWidth={0.75}
                strokeDasharray={flagged ? undefined : '2 3'}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

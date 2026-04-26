import { useMemo, useState, type ReactNode } from 'react';

/**
 * Profile visualization primitives.
 *
 * All components share the lab-instrument aesthetic: hairline strokes only,
 * cream on dark, mathematical precision, no bloom. Each visual element earns
 * its place by encoding meaning — no decorative graphics.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TYPE SYSTEM — three voices, never mixed accidentally.
 *
 *   mono   (--font-mono, JetBrains Mono)
 *          Labels, eyebrows, indices, hints, axis ticks, footers, numerals
 *          in an instrument context, status strips, page numbering.
 *          Always tracked. Often uppercase. The "this is data" voice.
 *
 *   serif  (--font-serif, Instrument Serif)
 *          Editorial accents — italic only. Ledes, lede sentences, named
 *          entities (value names, ranked-list labels, theme constellation
 *          items, divergence-bar labels), identity portrait, italic quotes.
 *          The "this was named/written by a person" voice.
 *
 *   sans   (--font-sans, Switzer)
 *          Body prose only. Plate body text, evidence paragraphs, derivation
 *          explanations, descriptive copy. Always upright. Never italic —
 *          if you want italic body, switch to serif. The "this is description"
 *          voice.
 *
 * Type scale — keep additions inside this scale. No orphan sizes.
 *   8.5 — sub-axis tick labels (day initials, axis abbreviations)
 *   9   — micro mono (hints, footers, axis labels, colophons, eyebrow indices)
 *   10  — eyebrow labels (uppercase tracked)
 *   11  — TraitTrace label, status values, secondary mono numerals
 *   12.5 — body sans normal (InsightPlate normal, evidence, derivation prose)
 *          AND serif italic ledes (SectionEyebrow lede, prose pull-quotes)
 *   14  — body sans lead (InsightPlate prominence='lead')
 *          AND serif italic medium (RankedList entry labels)
 *   15  — serif italic large (Identity Portrait, Questions to sit with)
 *   18  — mono numeric display (RankedList rank)
 *   22  — mono numeric display large (TraitTrace value)
 * ──────────────────────────────────────────────────────────────────────────
 */

const INK = 'rgba(244, 243, 240, 0.92)';
const INK_SOFT = 'rgba(244, 243, 240, 0.6)';
const INK_GHOST = 'rgba(244, 243, 240, 0.32)';
const INK_HAIR = 'rgba(244, 243, 240, 0.10)';
const INK_FAINT = 'rgba(244, 243, 240, 0.06)';

/* ────────────────────────────────────────────────────────────
   COLOR SYSTEM — restrained accent palette
   Eight hues at similar lightness (~65-72%) and chroma (~30) so
   they read as a family, not a rainbow. Color is only applied to
   data marks that *encode* identity (a thread, a memory type, an
   active state). Backgrounds, ledes, body, axes, eyebrows stay
   cream/mono. Color earns its place.
   ──────────────────────────────────────────────────────────── */

export const THREAD_PALETTE: Array<{ name: string; hue: string; dim: string }> = [
  { name: 'amber',  hue: 'rgba(228, 178,  98, 0.82)', dim: 'rgba(228, 178,  98, 0.32)' },
  { name: 'sage',   hue: 'rgba(143, 175, 137, 0.82)', dim: 'rgba(143, 175, 137, 0.32)' },
  { name: 'violet', hue: 'rgba(170, 145, 200, 0.82)', dim: 'rgba(170, 145, 200, 0.32)' },
  { name: 'coral',  hue: 'rgba(218, 145, 130, 0.82)', dim: 'rgba(218, 145, 130, 0.32)' },
  { name: 'cobalt', hue: 'rgba(135, 165, 200, 0.82)', dim: 'rgba(135, 165, 200, 0.32)' },
  { name: 'ochre',  hue: 'rgba(200, 155, 105, 0.82)', dim: 'rgba(200, 155, 105, 0.32)' },
  { name: 'rose',   hue: 'rgba(195, 130, 165, 0.82)', dim: 'rgba(195, 130, 165, 0.32)' },
  { name: 'moss',   hue: 'rgba(150, 175, 110, 0.82)', dim: 'rgba(150, 175, 110, 0.32)' },
];

// Memory-type → palette mapping. Stable per type so colors are recognizable
// across tabs (BurstPlot, future legend, etc.).
export const MEMORY_TYPE_COLOR: Record<string, { hue: string; dim: string }> = {
  goal:         { hue: 'rgba(228, 178,  98, 0.82)', dim: 'rgba(228, 178,  98, 0.30)' }, // amber
  preference:   { hue: 'rgba(143, 175, 137, 0.82)', dim: 'rgba(143, 175, 137, 0.30)' }, // sage
  principle:    { hue: 'rgba(200, 155, 105, 0.82)', dim: 'rgba(200, 155, 105, 0.30)' }, // ochre
  commitment:   { hue: 'rgba(218, 145, 130, 0.82)', dim: 'rgba(218, 145, 130, 0.30)' }, // coral
  fact:         { hue: 'rgba(135, 165, 200, 0.82)', dim: 'rgba(135, 165, 200, 0.30)' }, // cobalt
  moment:       { hue: 'rgba(170, 145, 200, 0.82)', dim: 'rgba(170, 145, 200, 0.30)' }, // violet
  relationship: { hue: 'rgba(195, 130, 165, 0.82)', dim: 'rgba(195, 130, 165, 0.30)' }, // rose
  synthesis:    { hue: 'rgba(150, 175, 110, 0.82)', dim: 'rgba(150, 175, 110, 0.30)' }, // moss
  reflection:   { hue: 'rgba(170, 145, 200, 0.82)', dim: 'rgba(170, 145, 200, 0.30)' }, // violet (shared with moment — both reflective)
};

const ACTIVE_GLOW = 'rgba(228, 178, 98, 0.85)'; // amber — JourneyTimeline active state
const ACTIVE_GLOW_SOFT = 'rgba(228, 178, 98, 0.18)'; // amber inner halo (still hairline-discipline)

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
        <p style={{
          fontSize: 12.5,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-body)',
          lineHeight: 1.7,
          margin: 0,
          paddingLeft: 142,
        }}>
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
        fontFamily: 'var(--font-sans)',
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
              <p style={{
                fontSize: 12.5,
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-body)',
                lineHeight: 1.7,
                margin: 0,
              }}>
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

export function ConstellationCloud({ items, weighted = true, maxFontSize = 16, minFontSize = 10, showCounts = false }: {
  items: Array<string | { label: string; count: number }>;
  weighted?: boolean; maxFontSize?: number; minFontSize?: number; showCounts?: boolean;
}) {
  // Normalize to {label, count?}
  const normalized = items.map(it => typeof it === 'string' ? { label: it, count: undefined as number | undefined } : it);
  // For short lists (1-2 items), don't render the most prominent item huge — clamp range tightly.
  const span = normalized.length <= 3 ? Math.min(2, maxFontSize - minFontSize) : maxFontSize - minFontSize;
  // Weight by reverse rank (first items are heavier — assumes pre-sorted by frequency)
  const sized = normalized.map((it, i) => {
    const rank = normalized.length > 1 ? i / (normalized.length - 1) : 0;
    const fontSize = minFontSize + (weighted ? (1 - rank) * span : span * 0.5);
    const opacity = weighted ? 0.4 + (1 - rank) * 0.5 : 0.7;
    return { ...it, fontSize, opacity };
  });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 18px', padding: '4px 0' }}>
      {sized.map((s, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 5,
          lineHeight: 1.4,
        }}>
          <span style={{
            fontSize: s.fontSize,
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            color: `rgba(244, 243, 240, ${s.opacity})`,
            letterSpacing: '0.005em',
          }}>
            {s.label}
          </span>
          {showCounts && s.count !== undefined && (
            <span style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              color: `rgba(244, 243, 240, ${Math.max(0.25, s.opacity * 0.55)})`,
              letterSpacing: '0.06em',
            }}>
              {s.count}
            </span>
          )}
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
  label: string; count?: number | string; children: ReactNode;
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
   SectionEyebrow — editorial section heading
   Numbered, monospace eyebrow + serif lede + optional ornament
   ──────────────────────────────────────────────────────────── */

export function SectionEyebrow({
  index, label, lede, hint,
}: {
  index?: string; label: string; lede?: string; hint?: string;
}) {
  return (
    <div style={{ paddingTop: 28, paddingBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: lede ? 6 : 0,
      }}>
        {index !== undefined && (
          <span style={{
            fontSize: 9.5, color: INK_GHOST, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.16em', textTransform: 'uppercase',
            minWidth: 28,
          }}>
            {index}
          </span>
        )}
        <span style={{
          fontSize: 10, color: INK_SOFT, fontFamily: 'var(--font-mono)',
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
        {hint && (
          <span style={{
            fontSize: 9, color: INK_GHOST, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', marginLeft: 'auto',
          }}>
            {hint}
          </span>
        )}
      </div>
      {lede && (
        <p style={{
          margin: 0, paddingLeft: index !== undefined ? 42 : 0,
          fontSize: 12.5, fontStyle: 'italic',
          color: INK_SOFT, fontFamily: 'var(--font-serif)',
          lineHeight: 1.55, maxWidth: 640,
        }}>
          {lede}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TabColophon — page-numbered footer that closes each tab
   ──────────────────────────────────────────────────────────── */

export function TabColophon({ name, page, of = 9, kicker = 'polyphonic · psych. profile' }: {
  name: string; page: number; of?: number; kicker?: string;
}) {
  const pp = String(page).padStart(2, '0');
  const tt = String(of).padStart(2, '0');
  return (
    <div style={{
      marginTop: 36, paddingTop: 16,
      borderTop: `1px solid ${INK_FAINT}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>
      <span style={{
        fontSize: 9, color: 'rgba(244, 243, 240, 0.28)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}>
        {name} · {pp} / {tt}
      </span>
      <span style={{
        fontSize: 9, color: 'rgba(244, 243, 240, 0.28)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
      }}>
        {kicker}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SectionDivider — ornamental hairline between movements
   ──────────────────────────────────────────────────────────── */

export function SectionDivider({ ornament = '·∗·' }: { ornament?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '20px 0 4px', color: INK_GHOST,
    }}>
      <div style={{ flex: 1, height: 1, background: INK_HAIR }} />
      <span style={{
        fontSize: 10, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.4em',
      }}>
        {ornament}
      </span>
      <div style={{ flex: 1, height: 1, background: INK_HAIR }} />
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
  events: Array<{ at: number | string | Date; magnitude?: number; memoryType?: string }>;
  height?: number;
  label?: string;
}) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; date: string; memoryType?: string; magnitude: number;
  } | null>(null);

  const data = useMemo(() => {
    if (!events?.length) return null;
    const stamps = events.map(e => ({
      t: typeof e.at === 'number' ? e.at : new Date(e.at).getTime(),
      m: typeof e.magnitude === 'number' ? Math.max(0.1, Math.min(1, e.magnitude)) : 0.5,
      type: e.memoryType,
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

  // Build a legend of unique memory_types present (lowercased)
  const typesPresent = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.stamps) if (s.type) set.add(s.type.toLowerCase());
    return Array.from(set);
  }, [data.stamps]);

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Baseline */}
        <line x1={padX} y1={H - padBot} x2={W - padX} y2={H - padBot} stroke={INK_HAIR} strokeWidth={0.5} />
        {/* Quartile gridlines */}
        {[0.25, 0.5, 0.75].map(q => (
          <line key={q} x1={padX + q * innerW} y1={padTop} x2={padX + q * innerW} y2={H - padBot}
            stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="2 4" />
        ))}
        {/* Event hairlines — colored by memory_type if available */}
        {data.stamps.map((s, i) => {
          const x = padX + ((s.t - data.tMin) / data.span) * innerW;
          const h = innerH * s.m;
          const y1 = H - padBot - h;
          const typeKey = s.type?.toLowerCase();
          const palette = typeKey ? MEMORY_TYPE_COLOR[typeKey] : undefined;
          const stroke = palette ? palette.hue : INK;
          return (
            <line key={i}
              x1={x} y1={y1} x2={x} y2={H - padBot}
              stroke={stroke} strokeWidth={1} opacity={0.85}
              onMouseEnter={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setTooltip({
                  x: ((x / W) * r.width) + r.left,
                  y: r.top + ((y1 / H) * r.height),
                  date: fmt(s.t),
                  memoryType: s.type,
                  magnitude: s.m,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            />
          );
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
      {/* Memory-type legend */}
      {typesPresent.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px 14px',
          padding: '8px 12px 0',
        }}>
          {typesPresent.map(t => {
            const c = MEMORY_TYPE_COLOR[t];
            if (!c) return null;
            return (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 9, fontFamily: 'var(--font-mono)',
                color: INK_GHOST, letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 1.5,
                  background: c.hue,
                }} />
                {t}
              </span>
            );
          })}
        </div>
      )}
      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 8,
            top: tooltip.y - 30,
            pointerEvents: 'none',
            padding: '5px 9px',
            background: 'rgba(20, 20, 22, 0.94)',
            border: `1px solid ${INK_HAIR}`,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: INK,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            zIndex: 50,
          }}
        >
          {tooltip.date}
          {tooltip.memoryType && (
            <> · <span style={{ color: MEMORY_TYPE_COLOR[tooltip.memoryType.toLowerCase()]?.hue ?? INK_SOFT }}>
              {tooltip.memoryType}
            </span></>
          )}
          {' · '}<span style={{ color: INK_GHOST }}>c{tooltip.magnitude.toFixed(2)}</span>
        </div>
      )}
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
              {/* Outer halo on active — subtle amber, hairline-discipline */}
              {isActive && (
                <circle cx={x} cy={trackY} r={16}
                  fill="none" stroke={ACTIVE_GLOW_SOFT} strokeWidth={1} />
              )}
              {/* Outer ring */}
              <circle cx={x} cy={trackY} r={isActive ? 12 : 8} fill="rgba(10, 10, 12, 1)"
                stroke={isActive ? ACTIVE_GLOW : INK_GHOST} strokeWidth={isActive ? 1 : 0.75} />
              {/* Inner symbol or dot */}
              {p.symbol ? (
                <text x={x} y={trackY} fontSize={11} fontFamily="var(--font-mono)"
                  fill={isActive ? ACTIVE_GLOW : INK_SOFT}
                  textAnchor="middle" dominantBaseline="central">{p.symbol}</text>
              ) : (
                <circle cx={x} cy={trackY} r={isActive ? 3 : 1.5}
                  fill={isActive ? ACTIVE_GLOW : INK_GHOST} />
              )}
              {/* Label */}
              <text x={x} y={trackY + 30} fontSize={9} fontFamily="var(--font-mono)"
                fill={isActive ? ACTIVE_GLOW : INK_GHOST}
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

/* ════════════════════════════════════════════════════════════
   BEHAVIORAL RHYTHM — signal-strip primitives
   Small instrument readouts derived from memories.created_at,
   confidence, sharpness. Each is a tile in a 4-up signal band.
   ════════════════════════════════════════════════════════════ */

/* InstrumentTile — shared frame for the 4 signal-strip readouts */
function InstrumentTile({
  label, hint, children, footer,
}: {
  label: string; hint?: string; children: ReactNode; footer?: string;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '14px 16px 12px',
      borderLeft: `1px solid ${INK_HAIR}`,
      minHeight: 130, gap: 8,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 8,
      }}>
        <span style={{
          fontSize: 9, color: INK_SOFT, fontFamily: 'var(--font-mono)',
          letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
        {hint && (
          <span style={{
            fontSize: 9, color: INK_GHOST, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.05em',
          }}>
            {hint}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {children}
      </div>
      {footer && (
        <div style={{
          fontSize: 9, color: INK_GHOST, fontFamily: 'var(--font-mono)',
          letterSpacing: '0.05em', textAlign: 'center',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   DiurnalRing — 24-hour radial of memory-creation activity.
   Each hour is a radial tick whose length = relative count.
   Inner cardinal labels mark 00 / 06 / 12 / 18.
   ──────────────────────────────────────────────────────────── */

export function DiurnalRing({ buckets, size = 110 }: {
  buckets: number[]; // length 24
  size?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const rOuter = size / 2 - 6;
  const rInner = rOuter * 0.55;
  const max = Math.max(1, ...buckets);
  const peakHour = buckets.indexOf(max);
  const total = buckets.reduce((a, b) => a + b, 0);

  // Peak detection: detect peak hour, tag morning/afternoon/evening/night
  const phase = peakHour < 6 ? 'NIGHT'
    : peakHour < 12 ? 'MORNING'
    : peakHour < 18 ? 'AFTERNOON' : 'EVENING';

  return (
    <InstrumentTile
      label="Diurnal rhythm"
      hint={total > 0 ? `n=${total}` : undefined}
      footer={total > 0 ? `peak ${String(peakHour).padStart(2, '0')}:00 · ${phase}` : 'awaiting history'}
    >
      <svg width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
        {/* Reference rings */}
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={INK_FAINT} strokeWidth={0.5} />
        <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="1 3" />
        {/* Cardinal hour ticks at 0/6/12/18 */}
        {[0, 6, 12, 18].map(h => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const x1 = cx + Math.cos(a) * rOuter;
          const y1 = cy + Math.sin(a) * rOuter;
          const x2 = cx + Math.cos(a) * (rOuter + 3);
          const y2 = cy + Math.sin(a) * (rOuter + 3);
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK_GHOST} strokeWidth={0.5} />;
        })}
        {/* 24 hourly radial bars */}
        {buckets.map((count, h) => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const len = (count / max) * (rOuter - rInner);
          const r1 = rInner;
          const r2 = rInner + Math.max(0.5, len);
          const x1 = cx + Math.cos(a) * r1;
          const y1 = cy + Math.sin(a) * r1;
          const x2 = cx + Math.cos(a) * r2;
          const y2 = cy + Math.sin(a) * r2;
          const isPeak = count === max && count > 0;
          return (
            <line
              key={h}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={count === 0 ? INK_FAINT : (isPeak ? INK : INK_SOFT)}
              strokeWidth={isPeak ? 1.25 : 0.85}
            />
          );
        })}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={1} fill={INK_GHOST} />
      </svg>
    </InstrumentTile>
  );
}

/* ────────────────────────────────────────────────────────────
   WeeklyMicroBars — 7-day vertical bars (Sun..Sat).
   Memory volume by day-of-week.
   ──────────────────────────────────────────────────────────── */

export function WeeklyMicroBars({ buckets }: { buckets: number[] /* length 7, Sun..Sat */ }) {
  const max = Math.max(1, ...buckets);
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const peakDow = buckets.indexOf(max);
  const dowName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][peakDow];
  const total = buckets.reduce((a, b) => a + b, 0);
  const W = 168, H = 86, padX = 4, gap = 6;
  const colW = (W - padX * 2 - gap * 6) / 7;

  return (
    <InstrumentTile
      label="Weekly cycle"
      hint={total > 0 ? `n=${total}` : undefined}
      footer={total > 0 ? `peak ${dowName}` : 'awaiting history'}
    >
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Baseline */}
        <line x1={padX} y1={H - 16} x2={W - padX} y2={H - 16} stroke={INK_FAINT} strokeWidth={0.5} />
        {buckets.map((c, i) => {
          const x = padX + i * (colW + gap);
          const h = (c / max) * (H - 28);
          const isPeak = c === max && c > 0;
          return (
            <g key={i}>
              <rect
                x={x}
                y={H - 16 - h}
                width={colW}
                height={h}
                fill={c === 0 ? INK_FAINT : (isPeak ? INK : INK_SOFT)}
                opacity={c === 0 ? 0.4 : 1}
              />
              <text
                x={x + colW / 2} y={H - 4}
                fontSize={8.5} fontFamily="var(--font-mono)"
                fill={isPeak ? INK_SOFT : INK_GHOST}
                textAnchor="middle"
                style={{ letterSpacing: '0.06em' }}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </InstrumentTile>
  );
}

/* ────────────────────────────────────────────────────────────
   ConfidencePulse — horizontal stacked-bar of low/mid/high
   confidence claims, with hairline tier markers above.
   ──────────────────────────────────────────────────────────── */

export function ConfidencePulse({ tiers }: {
  tiers: { low: number; mid: number; high: number };
}) {
  const total = tiers.low + tiers.mid + tiers.high;
  const W = 168, H = 86;
  const barY = H / 2 - 6, barH = 12;
  const padX = 6;
  const trackW = W - padX * 2;

  if (total === 0) {
    return (
      <InstrumentTile label="Confidence pulse" footer="awaiting claims">
        <div style={{ width: '100%', height: 12, background: INK_FAINT, borderRadius: 1 }} />
      </InstrumentTile>
    );
  }

  const lowW = (tiers.low / total) * trackW;
  const midW = (tiers.mid / total) * trackW;
  const highW = (tiers.high / total) * trackW;
  const dom =
    tiers.high >= tiers.mid && tiers.high >= tiers.low ? 'high'
    : tiers.mid >= tiers.low ? 'mid' : 'low';

  return (
    <InstrumentTile
      label="Confidence pulse"
      hint={`n=${total}`}
      footer={`${dom}-confidence dominant`}
    >
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Tier baseline */}
        <line x1={padX} y1={barY + barH + 6} x2={W - padX} y2={barY + barH + 6} stroke={INK_FAINT} strokeWidth={0.5} />
        {/* Low segment */}
        <rect x={padX} y={barY} width={lowW} height={barH} fill={INK_GHOST} />
        {/* Mid segment */}
        <rect x={padX + lowW} y={barY} width={midW} height={barH} fill={INK_SOFT} />
        {/* High segment */}
        <rect x={padX + lowW + midW} y={barY} width={highW} height={barH} fill={INK} />
        {/* Tier ticks above */}
        <line x1={padX + lowW} y1={barY - 5} x2={padX + lowW} y2={barY - 1} stroke={INK_GHOST} strokeWidth={0.5} />
        <line x1={padX + lowW + midW} y1={barY - 5} x2={padX + lowW + midW} y2={barY - 1} stroke={INK_GHOST} strokeWidth={0.5} />
        {/* Tier labels */}
        <text x={padX + 2} y={barY - 8} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST} style={{ letterSpacing: '0.08em' }}>LOW</text>
        <text x={padX + lowW + 2} y={barY - 8} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST} style={{ letterSpacing: '0.08em' }}>MID</text>
        <text x={padX + lowW + midW + 2} y={barY - 8} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST} style={{ letterSpacing: '0.08em' }}>HIGH</text>
        {/* Counts beneath each segment */}
        <text x={padX + lowW / 2} y={barY + barH + 16} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="middle">{tiers.low}</text>
        <text x={padX + lowW + midW / 2} y={barY + barH + 16} fontSize={9} fontFamily="var(--font-mono)" fill={INK_SOFT} textAnchor="middle">{tiers.mid}</text>
        <text x={padX + lowW + midW + highW / 2} y={barY + barH + 16} fontSize={9} fontFamily="var(--font-mono)" fill={INK} textAnchor="middle">{tiers.high}</text>
      </svg>
    </InstrumentTile>
  );
}

/* ────────────────────────────────────────────────────────────
   SignalCoherence — 2D scatter (sharpness × confidence).
   The single point shows where the corpus sits inside the
   unit square; reference quadrants imply meaning.
   ──────────────────────────────────────────────────────────── */

export function SignalCoherence({ sharpness, confidence }: {
  sharpness: number; confidence: number;
}) {
  const W = 168, H = 86;
  const padL = 26, padR = 12, padT = 8, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = padL + Math.max(0, Math.min(1, sharpness)) * plotW;
  const y = padT + (1 - Math.max(0, Math.min(1, confidence))) * plotH;

  // Quadrant phrasing — softer thresholds; reserve "uncertain" for genuinely low confidence
  const verdict =
    confidence === 0 && sharpness === 0 ? 'AWAITING'
    : confidence >= 0.75 && sharpness >= 0.75 ? 'CRYSTALLINE'
    : sharpness >= 0.7 && confidence >= 0.55 ? 'SHARP · CONVERGING'
    : sharpness >= 0.7 ? 'SHARP · UNSETTLED'
    : confidence >= 0.7 ? 'CONFIDENT · SOFT'
    : 'DEVELOPING';

  return (
    <InstrumentTile
      label="Signal coherence"
      hint={`σ${sharpness.toFixed(2)} · c${confidence.toFixed(2)}`}
      footer={verdict.toLowerCase()}
    >
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Plot frame */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="none" stroke={INK_FAINT} strokeWidth={0.5} />
        {/* Quadrant midlines */}
        <line x1={padL + plotW / 2} y1={padT} x2={padL + plotW / 2} y2={padT + plotH} stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="1 3" />
        <line x1={padL} y1={padT + plotH / 2} x2={padL + plotW} y2={padT + plotH / 2} stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="1 3" />
        {/* Y-axis label (CONFIDENCE) */}
        <text x={4} y={padT + plotH / 2} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST}
          textAnchor="middle" transform={`rotate(-90 4 ${padT + plotH / 2})`}
          style={{ letterSpacing: '0.1em' }}>CONF</text>
        {/* X-axis label (SHARPNESS) */}
        <text x={padL + plotW / 2} y={H - 8} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST}
          textAnchor="middle" style={{ letterSpacing: '0.1em' }}>SHARP</text>
        {/* The point — small open circle if data is real, ghost mark if zero */}
        {(sharpness > 0 || confidence > 0) ? (
          <>
            {/* Crosshair */}
            <line x1={padL} y1={y} x2={x} y2={y} stroke={INK_HAIR} strokeWidth={0.5} />
            <line x1={x} y1={padT + plotH} x2={x} y2={y} stroke={INK_HAIR} strokeWidth={0.5} />
            <circle cx={x} cy={y} r={3} fill="none" stroke={INK} strokeWidth={1} />
            <circle cx={x} cy={y} r={0.8} fill={INK} />
          </>
        ) : (
          <text x={padL + plotW / 2} y={padT + plotH / 2 + 4} fontSize={9}
            fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="middle">—</text>
        )}
      </svg>
    </InstrumentTile>
  );
}

/* ────────────────────────────────────────────────────────────
   SignalStrip — 4-up container for the instrument tiles
   Renders as a single bordered band; tiles are separated by
   internal hairlines.
   ──────────────────────────────────────────────────────────── */

export function SignalStrip({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      borderTop: `1px solid ${INK_HAIR}`,
      borderBottom: `1px solid ${INK_HAIR}`,
    }}>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ThreadArcs — narrative threads as stacked timeline lanes.
   Each thread is one horizontal lane; vertical hairlines mark
   each memory's arrival time. Each thread carries a palette
   color so multiple parallel arcs are legible at a glance.

   Interactivity:
     • hover a lane → that lane stays full-opacity, others dim
     • click a lane → locks the highlight; click again to release
     • hover a tick → tooltip with date + thread name
   ════════════════════════════════════════════════════════════ */

export function ThreadArcs({ threads, laneHeight = 32 }: {
  threads: Array<{
    thread: string;
    count: number;
    events: Array<{ at: string; magnitude: number; memoryType?: string }>;
  }>;
  laneHeight?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [locked, setLocked] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; date: string; thread: string;
  } | null>(null);

  // Active = locked if set, else hovered
  const active = locked !== null ? locked : hovered;

  // Compute the global time range across all threads
  const timeRange = useMemo(() => {
    let tMin = Infinity, tMax = -Infinity;
    for (const t of threads) {
      for (const e of t.events) {
        const ms = new Date(e.at).getTime();
        if (Number.isFinite(ms)) {
          if (ms < tMin) tMin = ms;
          if (ms > tMax) tMax = ms;
        }
      }
    }
    if (!Number.isFinite(tMin)) return null;
    return { tMin, tMax, span: Math.max(1, tMax - tMin) };
  }, [threads]);

  if (!threads?.length || !timeRange) {
    return <EmptyState note="Threads will surface as memories accumulate" height={120} />;
  }

  const W = 1000;
  const labelW = 240;
  const trackX = labelW + 8;
  const trackW = W - trackX - 12;
  const axisH = 22; // bottom date axis
  const totalH = threads.length * laneHeight + axisH;

  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const xOf = (ms: number) => trackX + ((ms - timeRange.tMin) / timeRange.span) * trackW;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={totalH}
        viewBox={`0 0 ${W} ${totalH}`}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => { setHovered(null); setTooltip(null); }}
      >
        {threads.map((t, i) => {
          const yTop = i * laneHeight;
          const yMid = yTop + laneHeight / 2;
          const baseColor = THREAD_PALETTE[i % THREAD_PALETTE.length];
          const isActive = active === i;
          const isOther = active !== null && active !== i;
          const tickHue = isOther ? baseColor.dim : baseColor.hue;
          const labelColor = isOther ? INK_GHOST : (isActive ? INK : INK_SOFT);

          return (
            <g
              key={t.thread}
              onMouseEnter={() => setHovered(i)}
              onClick={(e) => {
                e.stopPropagation();
                setLocked(prev => prev === i ? null : i);
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* Lane hit-region — invisible rect that captures hover/click across the whole row */}
              <rect
                x={0} y={yTop} width={W} height={laneHeight}
                fill="transparent"
              />
              {/* Lane baseline */}
              <line
                x1={trackX} y1={yMid} x2={trackX + trackW} y2={yMid}
                stroke={isOther ? INK_FAINT : INK_HAIR}
                strokeWidth={0.5}
              />
              {/* Color swatch — small filled square next to the label */}
              <rect
                x={4} y={yMid - 4} width={6} height={6}
                fill={isOther ? baseColor.dim : baseColor.hue}
              />
              {/* Thread label (italic-serif, capitalized) */}
              <text
                x={18} y={yMid}
                fontSize={13} fontFamily="var(--font-serif)"
                fontStyle="italic" fill={labelColor}
                dominantBaseline="middle"
                style={{ textTransform: 'capitalize', transition: 'fill 200ms ease' }}
              >
                {t.thread.length > 32 ? t.thread.slice(0, 30) + '…' : t.thread}
              </text>
              {/* Count — mono ghost on the right of the label area */}
              <text
                x={labelW - 4} y={yMid}
                fontSize={9} fontFamily="var(--font-mono)"
                fill={isOther ? 'rgba(244, 243, 240, 0.18)' : INK_GHOST}
                textAnchor="end" dominantBaseline="middle"
                style={{ letterSpacing: '0.06em', transition: 'fill 200ms ease' }}
              >
                {t.count}
              </text>
              {/* Memory ticks */}
              {t.events.map((ev, j) => {
                const ms = new Date(ev.at).getTime();
                if (!Number.isFinite(ms)) return null;
                const x = xOf(ms);
                const tickH = 5 + ev.magnitude * 7; // 5..12
                return (
                  <line
                    key={j}
                    x1={x} y1={yMid - tickH / 2}
                    x2={x} y2={yMid + tickH / 2}
                    stroke={tickHue}
                    strokeWidth={isActive ? 1.4 : 1}
                    style={{ transition: 'stroke 200ms ease, stroke-width 200ms ease' }}
                    onMouseEnter={(e) => {
                      const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setTooltip({
                        x: ((x / W) * r.width) + r.left,
                        y: r.top + (yMid / totalH) * r.height,
                        date: fmtDate(ms),
                        thread: t.thread,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
              {/* Locked indicator — small chevron at left edge */}
              {locked === i && (
                <text
                  x={2} y={yMid + 1}
                  fontSize={10} fontFamily="var(--font-mono)"
                  fill={baseColor.hue}
                  dominantBaseline="middle"
                >
                  ▸
                </text>
              )}
            </g>
          );
        })}
        {/* Time axis */}
        <g transform={`translate(0 ${threads.length * laneHeight + 14})`}>
          <text x={trackX} y={0} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="start" style={{ letterSpacing: '0.04em' }}>
            {fmtDate(timeRange.tMin)}
          </text>
          <text x={trackX + trackW / 2} y={0} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="middle" style={{ letterSpacing: '0.06em' }}>
            {locked !== null
              ? `locked · ${threads[locked].thread}`
              : (active !== null
                ? `hover · ${threads[active].thread}`
                : `${threads.length} threads · click to lock`)}
          </text>
          <text x={trackX + trackW} y={0} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="end" style={{ letterSpacing: '0.04em' }}>
            {fmtDate(timeRange.tMax)}
          </text>
        </g>
      </svg>
      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 8,
            top: tooltip.y - 30,
            pointerEvents: 'none',
            padding: '5px 9px',
            background: 'rgba(20, 20, 22, 0.94)',
            border: `1px solid ${INK_HAIR}`,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: INK,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            zIndex: 50,
          }}
        >
          {tooltip.date} · <span style={{ color: INK_SOFT, fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>{tooltip.thread}</span>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ValenceTrajectory — affective arc over time.
   x = arrival timestamp (oldest → newest)
   y = emotional_valence in [-1, +1] (zero baseline)
   r = scaled by emotional_intensity in [0, 1]
   Draws zero baseline, ±0.5 reference gridlines, scatter of open
   circles, a smoothed running-mean hairline, date axis labels.
   ════════════════════════════════════════════════════════════ */

export function ValenceTrajectory({ events, height = 160 }: {
  events: Array<{ at: string; valence: number; intensity: number }>;
  height?: number;
}) {
  const data = useMemo(() => {
    if (!events?.length) return null;
    const stamps = events
      .map(e => ({
        t: new Date(e.at).getTime(),
        v: Math.max(-1, Math.min(1, e.valence)),
        i: Math.max(0, Math.min(1, e.intensity)),
      }))
      .filter(e => Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t);
    if (!stamps.length) return null;
    const tMin = stamps[0].t;
    const tMax = stamps[stamps.length - 1].t;
    const span = Math.max(1, tMax - tMin);
    // Running mean — window of min(11, n/4) so it's never overwhelmed
    const window = Math.max(3, Math.min(11, Math.floor(stamps.length / 4)));
    const smoothed = stamps.map((_, i) => {
      const lo = Math.max(0, i - Math.floor(window / 2));
      const hi = Math.min(stamps.length, i + Math.ceil(window / 2));
      const slice = stamps.slice(lo, hi);
      const m = slice.reduce((acc, s) => acc + s.v, 0) / slice.length;
      return m;
    });
    return { stamps, tMin, tMax, span, smoothed };
  }, [events]);

  if (!data) {
    return <EmptyState note="awaiting per-memory affective signal" height={height} />;
  }

  const W = 1000;
  const H = height;
  const padL = 12, padR = 12, padT = 14, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const midY = padT + innerH / 2;

  const xOf = (t: number) => padL + ((t - data.tMin) / data.span) * innerW;
  // valence -1..+1 → bottom..top
  const yOf = (v: number) => midY - (v * (innerH / 2));

  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Smoothed mean path
  const smoothedPath = data.stamps.map((s, i) => {
    const x = xOf(s.t);
    const y = yOf(data.smoothed[i]);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Means for hint
  const meanV = data.stamps.reduce((a, s) => a + s.v, 0) / data.stamps.length;
  const positiveCount = data.stamps.filter(s => s.v > 0.05).length;
  const negativeCount = data.stamps.filter(s => s.v < -0.05).length;

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {/* Reference gridlines at ±0.5 */}
        <line x1={padL} y1={yOf(0.5)} x2={W - padR} y2={yOf(0.5)} stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="2 4" />
        <line x1={padL} y1={yOf(-0.5)} x2={W - padR} y2={yOf(-0.5)} stroke={INK_FAINT} strokeWidth={0.5} strokeDasharray="2 4" />
        {/* Zero baseline */}
        <line x1={padL} y1={midY} x2={W - padR} y2={midY} stroke={INK_HAIR} strokeWidth={0.75} />
        {/* Y-axis tick labels — left margin */}
        <text x={padL - 2} y={yOf(0.5)} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="start" dominantBaseline="middle" style={{ letterSpacing: '0.06em' }}>+.5</text>
        <text x={padL - 2} y={midY} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="start" dominantBaseline="middle" style={{ letterSpacing: '0.06em' }}>0</text>
        <text x={padL - 2} y={yOf(-0.5)} fontSize={8} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="start" dominantBaseline="middle" style={{ letterSpacing: '0.06em' }}>-.5</text>
        {/* Smoothed mean line — under the points */}
        {data.stamps.length >= 2 && (
          <path d={smoothedPath} stroke={INK_SOFT} strokeWidth={1} fill="none" opacity={0.55} />
        )}
        {/* Per-memory points — open circles, radius scaled by intensity */}
        {data.stamps.map((s, i) => {
          const x = xOf(s.t);
          const y = yOf(s.v);
          const r = 1.5 + s.i * 3.5; // 1.5..5px
          const isNegative = s.v < -0.05;
          const stroke = isNegative ? 'rgba(194, 192, 188, 0.75)' : INK;
          return (
            <circle key={i} cx={x} cy={y} r={r}
              fill="none" stroke={stroke}
              strokeWidth={0.85} opacity={0.85} />
          );
        })}
        {/* Date labels — corners + midpoint */}
        <text x={padL} y={H - 6} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="start" style={{ letterSpacing: '0.04em' }}>{fmtDate(data.tMin)}</text>
        <text x={W / 2} y={H - 6} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="middle" style={{ letterSpacing: '0.04em' }}>
          n={data.stamps.length} · μ={meanV >= 0 ? '+' : ''}{meanV.toFixed(2)}
        </text>
        <text x={W - padR} y={H - 6} fontSize={9} fontFamily="var(--font-mono)" fill={INK_GHOST} textAnchor="end" style={{ letterSpacing: '0.04em' }}>{fmtDate(data.tMax)}</text>
      </svg>
      {/* Editorial caption beneath: positive vs negative split */}
      <div style={{
        marginTop: 8, display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: INK_GHOST, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        <span>positive · {positiveCount}</span>
        <span>neutral · {data.stamps.length - positiveCount - negativeCount}</span>
        <span>negative · {negativeCount}</span>
      </div>
    </div>
  );
}

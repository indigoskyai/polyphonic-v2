/**
 * mindViz — primitives that render data in the Mind design language.
 * All components use m-* / hairline / mono tokens — no hardcoded colors.
 */
import { ReactNode } from 'react';

/* ─── TraitBar ─── label · hairline track · numeric value */
export function TraitBar({ label, value, max = 1, showValue = true }: { label: string; value: number; max?: number; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 48px', alignItems: 'center', gap: 14, padding: '4px 0' }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-soft)', letterSpacing: 'var(--track-meta)',
        textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{ position: 'relative', height: 4, background: 'var(--hairline)', borderRadius: 2 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: 'rgba(244, 243, 240, 0.55)',
          borderRadius: 2,
        }} />
      </div>
      {showValue && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-primary)', textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}>{(value / max).toFixed(2)}</div>
      )}
    </div>
  );
}

/* ─── MagnitudeRow ─── like TraitBar but value is a count, taller bar */
export function MagnitudeRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 48px', alignItems: 'center', gap: 14, padding: '5px 0' }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-soft)', letterSpacing: 'var(--track-meta)',
        textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{ position: 'relative', height: 6, background: 'var(--hairline)', borderRadius: 2 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: 'rgba(244, 243, 240, 0.45)',
          borderRadius: 2,
        }} />
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-primary)', textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  );
}

/* ─── TagCloud ─── opacity + size scaled by count (or uniform if no counts) */
export function TagCloud({ items }: { items: Array<{ label: string; count?: number }> }) {
  if (items.length === 0) return <Empty note="No items." />;
  const max = Math.max(1, ...items.map(i => i.count ?? 1));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
      {items.map((t) => {
        const c = t.count ?? 1;
        const intensity = 0.4 + (c / max) * 0.55;
        const fs = 10 + (c / max) * 4;
        return (
          <span
            key={t.label}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: fs,
              color: `rgba(244, 243, 240, ${intensity})`,
              letterSpacing: '0.04em',
              padding: '4px 9px',
              border: '1px solid var(--hairline)',
              borderRadius: 999,
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span style={{
                marginLeft: 6,
                color: 'var(--text-whisper)',
                fontVariantNumeric: 'tabular-nums',
              }}>{t.count}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ─── QuoteCard ─── serif-italic body with mono eyebrow, hairline left rule */
export function QuoteCard({ eyebrow, body }: { eyebrow?: string; body: string }) {
  return (
    <div style={{ paddingLeft: 16, borderLeft: '1px solid var(--hairline)' }}>
      {eyebrow && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
          textTransform: 'uppercase', marginBottom: 6,
        }}>{eyebrow}</div>
      )}
      <p style={{
        fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.7,
        color: 'var(--text-primary)', margin: 0, letterSpacing: 'var(--track-body)',
      }}>{body}</p>
    </div>
  );
}

/* ─── RadarMini ─── compact polygon radar; 3-6 axes */
export function RadarMini({
  axes, values, size = 220,
}: {
  axes: Array<{ key: string; label: string }>;
  values: Record<string, number>; // 0..1
  size?: number;
}) {
  const c = size / 2;
  const r = c * 0.7;
  const n = axes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const ring = (s: number) =>
    axes.map((_, i) => {
      const x = c + Math.cos(angle(i)) * r * s;
      const y = c + Math.sin(angle(i)) * r * s;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  const pts = axes.map((a, i) => {
    const v = Math.max(0.02, Math.min(1, values[a.key] ?? 0));
    const x = c + Math.cos(angle(i)) * r * v;
    const y = c + Math.sin(angle(i)) * r * v;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="m-state-svg" preserveAspectRatio="xMidYMid meet">
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <polygon key={s} points={ring(s)} className="md-grid" />
      ))}
      {axes.map((_, i) => {
        const x = c + Math.cos(angle(i)) * r;
        const y = c + Math.sin(angle(i)) * r;
        return <line key={i} x1={c} y1={c} x2={x.toFixed(1)} y2={y.toFixed(1)} className="md-spoke" />;
      })}
      <polygon points={pts.join(' ')} className="md-fill" />
      {pts.map((p, i) => {
        const [x, y] = p.split(',');
        return <circle key={i} cx={x} cy={y} r={2.5} className="md-vertex" />;
      })}
      {axes.map((a, i) => {
        const lr = r + 18;
        const x = c + Math.cos(angle(i)) * lr;
        const y = c + Math.sin(angle(i)) * lr;
        const cosA = Math.cos(angle(i));
        const anchor = Math.abs(cosA) < 0.2 ? 'middle' : cosA > 0 ? 'start' : 'end';
        return (
          <text key={a.key} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle" className="md-label">
            {a.label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

/* ─── PanelHead ─── thin convenience wrapper */
export function PanelHead({ num, label, aside }: { num: string; label: string; aside?: ReactNode }) {
  return (
    <div className="m-panel-head">
      <div className="m-panel-eye"><span className="num">{num}</span> {label}</div>
      {aside && <div className="m-panel-aside">{aside}</div>}
    </div>
  );
}

/* ─── Empty ─── quiet ghost-text empty state */
export function Empty({ note }: { note: string }) {
  return (
    <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-ghost)', fontStyle: 'italic' }}>
      {note}
    </div>
  );
}

/* ─── helpers ─── */
export function score100(entry: any): number {
  if (typeof entry === 'number') return entry;
  if (entry && typeof entry === 'object' && typeof entry.score === 'number') return entry.score;
  return 50;
}

/** Heuristic: parse prose for keyword markers and infer 0..1. */
export function inferIntensity(text: string | undefined | null): number | null {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();
  if (/\b(extreme|extremely|exceptional|profound|extraordinary)\b/.test(t)) return 0.92;
  if (/\b(very high|very strong|highly|strongly|prolific)\b/.test(t)) return 0.82;
  if (/\b(high|strong|rich|sophisticated|complex|elevated)\b/.test(t)) return 0.7;
  if (/\b(moderate|moderately|balanced|mixed|some|frequent|regular)\b/.test(t)) return 0.55;
  if (/\b(low|reserved|sparing|infrequent|cautious|hedged)\b/.test(t)) return 0.35;
  if (/\b(very low|minimal|rare|seldom|absent)\b/.test(t)) return 0.18;
  return null;
}

export function qualLabel(v: number): string {
  if (v >= 0.66) return 'high';
  if (v >= 0.33) return 'moderate';
  return 'low';
}

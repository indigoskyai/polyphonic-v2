import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function ScatterField({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const rows = data?.rows ?? [];
  const isEmpty = rows.length === 0;

  // Try to derive (x, y) from common columns
  const points = rows.map((r) => {
    const x = Number(r.emotional_valence ?? r.valence ?? r.confidence ?? 0);
    const y = Number(r.emotional_arousal ?? r.arousal ?? r.salience ?? r.strength ?? 0);
    return { x, y };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs, -1), maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const W = 320, H = 160, P = 12;

  return (
    <StateShell loading={loading} error={error} empty={isEmpty}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 160 }}>
        <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="var(--border-subtle)" strokeDasharray="2,3" />
        <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke="var(--border-subtle)" strokeDasharray="2,3" />
        {points.map((p, i) => {
          const x = P + ((p.x - minX) / (maxX - minX || 1)) * (W - P * 2);
          const y = H - P - ((p.y - minY) / (maxY - minY || 1)) * (H - P * 2);
          return <circle key={i} cx={x} cy={y} r={2.2} fill="var(--luca)" opacity={0.55} />;
        })}
      </svg>
    </StateShell>
  );
}

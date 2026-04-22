import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function TimelineChart({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const buckets = data?.buckets ?? [];
  const points = [...buckets].sort((a, b) => a.key.localeCompare(b.key));
  const isEmpty = points.length === 0;

  const W = 600, H = 140, P = 16;
  const max = Math.max(...points.map((p) => p.value ?? p.count), 1);
  const min = 0;
  const xStep = points.length > 1 ? (W - P * 2) / (points.length - 1) : 0;
  const path = points.map((p, i) => {
    const x = P + i * xStep;
    const y = H - P - ((p.value ?? p.count) - min) / (max - min) * (H - P * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <StateShell loading={loading} error={error} empty={isEmpty}>
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 140 }}>
          <defs>
            <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--luca)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--luca)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${(P + (points.length - 1) * xStep).toFixed(1)},${H - P} L${P},${H - P} Z`} fill={`url(#grad-${widget.id})`} />
          <path d={path} fill="none" stroke="var(--luca)" strokeWidth={1.2} opacity={0.85} />
        </svg>
        <div className="flex justify-between mt-1" style={{ fontSize: 9, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
          <span>{points[0]?.key}</span>
          <span>{points[points.length - 1]?.key}</span>
        </div>
      </div>
    </StateShell>
  );
}

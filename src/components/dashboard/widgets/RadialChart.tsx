import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function RadialChart({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const buckets = data?.buckets ?? [];
  const isEmpty = buckets.length === 0;

  // Try to interpret as 24-hour spokes if keys are 0–23
  const isHourly = buckets.length > 0 && buckets.every((b) => /^\d+$/.test(b.key) && Number(b.key) >= 0 && Number(b.key) < 24);
  const spokes = isHourly
    ? Array.from({ length: 24 }, (_, h) => buckets.find((b) => Number(b.key) === h)?.count ?? 0)
    : buckets.slice(0, 16).map((b) => b.count);

  const max = Math.max(...spokes, 1);
  const cx = 90, cy = 90, R = 70;

  return (
    <StateShell loading={loading} error={error} empty={isEmpty}>
      <div className="flex justify-center">
        <svg width={180} height={180}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border-subtle)" />
          <circle cx={cx} cy={cy} r={R * 0.66} fill="none" stroke="var(--border-subtle)" strokeDasharray="2,3" />
          {spokes.map((v, i) => {
            const angle = (i / spokes.length) * Math.PI * 2 - Math.PI / 2;
            const len = (v / max) * R;
            const x2 = cx + Math.cos(angle) * len;
            const y2 = cy + Math.sin(angle) * len;
            return (
              <line
                key={i}
                x1={cx} y1={cy} x2={x2} y2={y2}
                stroke="var(--luca)" strokeWidth={2}
                opacity={0.4 + (v / max) * 0.5}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={2} fill="var(--luca)" />
        </svg>
      </div>
    </StateShell>
  );
}

import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function MetricCard({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const value = data?.metric?.value ?? '—';
  const spark = data?.metric?.sparkline ?? [];
  const unit = widget.spec.render_hints?.unit ?? '';

  return (
    <StateShell loading={loading} error={error}>
      <div className="flex flex-col h-full justify-center">
        <div style={{ fontSize: 38, fontWeight: 300, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {value}{unit && <span style={{ fontSize: 14, color: 'var(--text-ghost)', marginLeft: 4 }}>{unit}</span>}
        </div>
        {spark.length > 1 && <Sparkline values={spark} />}
      </div>
    </StateShell>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 140, h = 24;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ marginTop: 12, opacity: 0.7 }}>
      <polyline fill="none" stroke="var(--luca)" strokeWidth={1} points={points} />
    </svg>
  );
}

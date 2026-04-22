import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function ComparisonBars({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const items = (data?.buckets ?? []).slice(0, 10);
  const isEmpty = items.length === 0;
  const max = Math.max(...items.map((i) => i.value ?? i.count), 1);
  const unit = widget.spec.render_hints?.unit ?? '';

  return (
    <StateShell loading={loading} error={error} empty={isEmpty}>
      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const v = it.value ?? it.count;
          const pct = (v / max) * 100;
          return (
            <div key={it.key} className="flex items-center gap-2">
              <span style={{ fontSize: 11, color: 'var(--text-soft)', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.key}</span>
              <div className="flex-1" style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--luca)', opacity: 0.55, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', minWidth: 36, textAlign: 'right' }}>
                {typeof v === 'number' && Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v)}{unit}
              </span>
            </div>
          );
        })}
      </div>
    </StateShell>
  );
}

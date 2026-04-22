import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function ListBlock({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const rows = data?.rows ?? [];
  const buckets = data?.buckets ?? [];

  // Prefer buckets if grouping was specified
  const items: { primary: string; secondary?: string; meta?: string }[] = buckets.length
    ? buckets.slice(0, 12).map((b) => ({ primary: String(b.key), meta: String(b.count) }))
    : rows.slice(0, 12).map((r) => {
        const primary = String(r.content ?? r.question ?? r.title ?? r.label ?? r.id ?? '—').slice(0, 140);
        const secondary = r.tags && Array.isArray(r.tags) ? r.tags.slice(0, 3).join(' · ') : undefined;
        const meta = typeof r.confidence === 'number' ? `${Math.round(r.confidence * 100)}%`
          : typeof r.curiosity_score === 'number' ? `${Math.round(r.curiosity_score * 100)}`
          : typeof r.salience === 'number' ? `${Math.round(r.salience * 100)}` : undefined;
        return { primary, secondary, meta };
      });

  return (
    <StateShell loading={loading} error={error} empty={items.length === 0}>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {items.map((it, i) => (
          <div key={i} className="flex items-baseline gap-2 py-1" style={{ borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 9, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)', width: 18 }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.4 }}>{it.primary}</span>
            {it.secondary && <span style={{ fontSize: 10, color: 'var(--text-whisper)' }}>{it.secondary}</span>}
            {it.meta && <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{it.meta}</span>}
          </div>
        ))}
      </div>
    </StateShell>
  );
}

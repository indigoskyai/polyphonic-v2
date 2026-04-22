import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function HeatmapGrid({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const cells = data?.heatmap ?? [];
  const isEmpty = cells.length === 0;

  // Build matrix: weeks (cols) × days (rows)
  const weeks = Array.from(new Set(cells.map((c) => c.y))).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const max = Math.max(...cells.map((c) => c.v), 1);
  const lookup: Record<string, number> = {};
  for (const c of cells) lookup[`${c.y}|${c.x}`] = c.v;

  return (
    <StateShell loading={loading} error={error} empty={isEmpty}>
      <div className="flex flex-col gap-1">
        {DAYS.map((d) => (
          <div key={d} className="flex items-center gap-1">
            <span style={{ fontSize: 9, color: 'var(--text-whisper)', width: 22, fontFamily: 'var(--font-mono)' }}>{d}</span>
            <div className="flex gap-[2px] flex-1" style={{ flexWrap: 'wrap' }}>
              {weeks.slice(0, 16).map((w) => {
                const v = lookup[`${w}|${d}`] ?? 0;
                const intensity = v / max;
                return (
                  <div
                    key={w}
                    title={`${d} ${w}: ${v}`}
                    style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: v === 0 ? 'var(--bg-surface)' : `rgba(201, 168, 124, ${0.15 + intensity * 0.7})`,
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </StateShell>
  );
}

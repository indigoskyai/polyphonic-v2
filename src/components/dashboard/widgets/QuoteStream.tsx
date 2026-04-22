import type { DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function QuoteStream({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const rows = (data?.rows ?? []).slice(0, 8);

  return (
    <StateShell loading={loading} error={error} empty={rows.length === 0}>
      <div className="flex flex-col" style={{ gap: 12 }}>
        {rows.map((r, i) => {
          const text = String(r.content ?? r.question ?? r.summary ?? '').slice(0, 240);
          const ts = r.created_at ?? r.recorded_at;
          return (
            <div key={i} className="relative" style={{ paddingLeft: 12, borderLeft: '2px solid var(--luca)', borderLeftColor: 'rgba(201, 168, 124, 0.35)' }}>
              <p style={{ fontSize: 12, color: 'var(--text-body)', lineHeight: 1.55, fontStyle: 'italic' }}>"{text}"</p>
              {ts && (
                <div style={{ fontSize: 9, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </StateShell>
  );
}

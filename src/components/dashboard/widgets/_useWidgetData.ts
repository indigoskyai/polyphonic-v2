import { useEffect, useState } from 'react';
import { runWidgetQuery, type WidgetData } from '../widgetRunner';
import type { DashboardWidget } from '../dashboardStore';

export function useWidgetData(widget: DashboardWidget): { data: WidgetData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    runWidgetQuery(widget.spec)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Query failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [widget.id, widget.updated_at]);

  return { data, loading, error };
}

export function StateShell({ loading, error, empty, children }: {
  loading: boolean; error: string | null; empty?: boolean; children: React.ReactNode;
}) {
  if (loading) return <div style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>loading…</div>;
  if (error) return <div style={{ fontSize: 11, color: '#e88' }}>{error}</div>;
  if (empty) return <div style={{ fontSize: 11, color: 'var(--text-whisper)', fontStyle: 'italic' }}>no data yet</div>;
  return <>{children}</>;
}

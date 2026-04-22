import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardStore, type DashboardWidget } from '../dashboardStore';
import { useWidgetData, StateShell } from './_useWidgetData';

export default function NarrativeCard({ widget }: { widget: DashboardWidget }) {
  const { data, loading, error } = useWidgetData(widget);
  const { preferredModel, useOpenRouter } = useDashboardStore();
  const [text, setText] = useState<string | null>(widget.spec.render_hints?.text ?? null);
  const [narrating, setNarrating] = useState(false);
  const [narrErr, setNarrErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data || loading || error) return;
    if (text && text.length > 0) return;
    let cancelled = false;
    (async () => {
      setNarrating(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            mode: 'narrate',
            title: widget.spec.title,
            prompt: widget.prompt,
            rows: data.rows.slice(0, 30),
            model: preferredModel,
            use_openrouter: useOpenRouter,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancelled) setText(j.text || '');
      } catch (e: any) {
        if (!cancelled) setNarrErr(e.message || 'Narration failed');
      } finally {
        if (!cancelled) setNarrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data, loading, error, widget.id, widget.updated_at]);

  return (
    <StateShell loading={loading} error={error}>
      {narrating && !text ? (
        <div style={{ fontSize: 11, color: 'var(--text-ghost)', fontStyle: 'italic' }}>thinking…</div>
      ) : narrErr ? (
        <div style={{ fontSize: 11, color: '#e88' }}>{narrErr}</div>
      ) : (
        <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-body)' }}>{text}</p>
      )}
    </StateShell>
  );
}

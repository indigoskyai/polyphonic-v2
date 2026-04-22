import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useDashboardStore, type DashboardWidget } from './dashboardStore';
import Pulse from './Pulse';
import Atelier from './Atelier';
import Studio from './Studio';
import { toast } from 'sonner';

interface Props {
  profile: any;
  memoryCount: number;
  generating: boolean;
  onRegenerate: () => void;
  onRefresh: () => void;
  onSwitchToClassic: () => void;
}

export default function DashboardView({ profile, memoryCount, generating, onRegenerate, onRefresh, onSwitchToClassic }: Props) {
  const user = useAuthStore((s) => s.user);
  const { widgets, setWidgets, upsertWidget, removeWidget, reorder, preferredModel, useOpenRouter } = useDashboardStore();
  const [busy, setBusy] = useState(false);

  // Load widgets
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('dashboard_widgets' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('position', { ascending: true });
      setWidgets((data ?? []) as unknown as DashboardWidget[]);
    })();
  }, [user?.id, setWidgets]);

  async function callGenerate(prompt: string) {
    if (!user) return;
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'design', prompt, model: preferredModel, use_openrouter: useOpenRouter }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      const position = widgets.length;
      const { data: inserted, error } = await (supabase.from('dashboard_widgets' as any) as any)
        .insert({
          user_id: user.id,
          prompt,
          spec: j.spec,
          position,
          model: j.model ?? preferredModel,
          last_run_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      upsertWidget(inserted as unknown as DashboardWidget);
      toast.success('Widget generated');
    } catch (e: any) {
      toast.error(e.message || 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(id: string) {
    await (supabase.from('dashboard_widgets' as any) as any).update({ archived: true }).eq('id', id);
    removeWidget(id);
  }

  async function handleRegenerate(id: string) {
    const w = widgets.find((x) => x.id === id);
    if (!w) return;
    // Just bump updated_at to trigger re-fetch
    const { data } = await (supabase.from('dashboard_widgets' as any) as any)
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (data) upsertWidget(data as unknown as DashboardWidget);
  }

  async function handleReprompt(id: string, newPrompt: string) {
    const w = widgets.find((x) => x.id === id);
    if (!w || !user) return;
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'design', prompt: newPrompt, model: preferredModel, use_openrouter: useOpenRouter }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const { data } = await (supabase.from('dashboard_widgets' as any) as any)
        .update({ prompt: newPrompt, spec: j.spec, last_run_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (data) upsertWidget(data as unknown as DashboardWidget);
      toast.success('Widget updated');
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePin(id: string) {
    const w = widgets.find((x) => x.id === id);
    if (!w) return;
    const { data } = await (supabase.from('dashboard_widgets' as any) as any).update({ pinned: !w.pinned }).eq('id', id).select().single();
    if (data) upsertWidget(data as unknown as DashboardWidget);
  }

  async function handleReorder(ids: string[]) {
    reorder(ids);
    // Persist new positions
    await Promise.all(ids.map((id, idx) =>
      (supabase.from('dashboard_widgets' as any) as any).update({ position: idx }).eq('id', id),
    ));
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: '14px 28px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 className="text-sm font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '0.01em' }}>Atelier</h1>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
            {widgets.length} widget{widgets.length === 1 ? '' : 's'} · {memoryCount} memories · v{profile?.version ?? 1}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            disabled={generating}
            className="text-[10px] px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: generating ? 'var(--text-ghost)' : 'var(--text-tertiary)', cursor: generating ? 'wait' : 'pointer' }}
          >
            {generating ? 'Regenerating…' : 'Re-analyze'}
          </button>
          <button
            onClick={onRefresh}
            className="text-[10px] px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            Refresh
          </button>
          <button
            onClick={onSwitchToClassic}
            className="text-[10px] px-3 py-1.5 rounded"
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-ghost)', cursor: 'pointer' }}
          >
            Classic view
          </button>
        </div>
      </div>

      {/* Pulse */}
      <Pulse />

      {/* Atelier grid */}
      <Atelier
        widgets={widgets}
        onReorder={handleReorder}
        onArchive={handleArchive}
        onRegenerate={handleRegenerate}
        onReprompt={handleReprompt}
        onTogglePin={handleTogglePin}
      />

      {/* Studio prompt bar */}
      <Studio onSubmit={callGenerate} generating={busy} empty={widgets.length === 0} />
    </div>
  );
}

/**
 * ImportsTab — Round 2.
 * Wrapped in MnemosStreamShell with ALL/RECENT/SALIENT filter (mapped to
 * status), sort selector, and import cards rendered in the s-row aesthetic.
 *
 * Salient = anything currently `processing` or with conflicts.
 * Recent  = within last 7 days.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import ImportDetailPanel from '@/components/ImportDetailPanel';
import MnemosStreamShell, { type StreamFilter } from './MnemosStreamShell';

type ImportRecord = {
  id: string;
  status: string;
  pipeline_stage: string | null;
  source_platform: string | null;
  total_conversations: number | null;
  processed_conversations: number | null;
  memories_created: number | null;
  questions_generated: number | null;
  conflicts_detected: number | null;
  file_size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function ImportRow({
  imp, selected, onClick,
}: { imp: ImportRecord; selected: boolean; onClick: () => void }) {
  const created = imp.memories_created ?? 0;
  const total = imp.total_conversations ?? 0;
  const processed = imp.processed_conversations ?? 0;
  const isActive = imp.status === 'processing';
  const isFailed = imp.status === 'error' || imp.status === 'failed';
  const progress = total > 0
    ? Math.min(1, processed / total)
    : (imp.status === 'completed' ? 1 : 0);

  return (
    <div
      className={`s-row s-engram${selected ? ' selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="s-row-meta">
        <span className="dot" />
        <span className="s-type-chip" data-state={imp.status}>
          {imp.source_platform || 'unknown'}
        </span>
        <span className="kind">{imp.status}</span>
        {imp.conflicts_detected != null && imp.conflicts_detected > 0 && (
          <span className="kind">{imp.conflicts_detected} conflicts</span>
        )}
        <span className="salience">{created} mem</span>
        <span className="time">{timeAgo(imp.created_at)}</span>
      </div>
      <div className="s-row-content">
        {imp.pipeline_stage && isActive
          ? <>Stage <span style={{ color: 'var(--text-soft)' }}>{imp.pipeline_stage}</span> · {processed} / {total} conversations</>
          : isFailed
            ? <>Import stopped at <span style={{ color: 'var(--text-soft)' }}>{imp.pipeline_stage || 'error'}</span> · {processed} / {total} conversations</>
            : <>{processed} of {total} conversations processed · {created} memories created</>}
      </div>
      <div className="s-bars">
        <div className="s-bar">
          <span className="s-bar-label">prg</span>
          <div className="s-bar-track">
            <div className="s-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="s-bar-val">{(progress * 100).toFixed(0)}%</span>
        </div>
        {imp.questions_generated != null && imp.questions_generated > 0 && (
          <div className="s-bar">
            <span className="s-bar-label">q</span>
            <div className="s-bar-track">
              <div className="s-bar-fill" style={{ width: `${Math.min(100, imp.questions_generated * 4)}%` }} />
            </div>
            <span className="s-bar-val">{imp.questions_generated}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportsTab() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImport, setSelectedImport] = useState<ImportRecord | null>(null);
  const [reprofiling, setReprofiling] = useState(false);
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_imports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      const rows = data as ImportRecord[];
      setImports(rows);
      setSelectedImport((prev) => prev ? rows.find((imp) => imp.id === prev.id) ?? prev : prev);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const hasActiveImports = imports.some((imp) => imp.status === 'processing');
  useEffect(() => {
    if (!hasActiveImports) return;
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [hasActiveImports, refresh]);

  const filtered = useMemo(() => {
    let list = imports;
    if (filter === 'recent') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((i) => new Date(i.created_at).getTime() >= cutoff);
    } else if (filter === 'salient') {
      list = list.filter((i) => i.status === 'processing' || i.status === 'failed' || i.status === 'error' || (i.conflicts_detected ?? 0) > 0);
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((i) =>
        (i.source_platform || '').toLowerCase().includes(q)
        || i.status.toLowerCase().includes(q)
        || (i.pipeline_stage || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [imports, filter, query]);

  async function handleGlobalReprofile() {
    setReprofiling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-deep-analysis`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      toast({
        title: 'Re-analysis started',
        description: 'Running on your full memory corpus. Check Profile in 3–6 minutes.',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: 'Could not start analysis', description: msg, variant: 'destructive' });
    } finally {
      setReprofiling(false);
    }
  }

  const toolbarExtra = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleGlobalReprofile}
        disabled={reprofiling}
        className="s-pill"
        style={{ cursor: reprofiling ? 'wait' : 'pointer' }}
        title="Re-run the 5-pass deep psychological analysis on your latest memories"
      >
        {reprofiling ? 'Starting…' : 'Re-run profiling'}
      </button>
      <button
        type="button"
        onClick={() => navigate('/import')}
        className="s-pill"
      >
        New import
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <MnemosStreamShell
          num="05"
          streamLabel="IMPORTS STREAM"
          title="Imports"
          subtitle={`${filtered.length} import${filtered.length === 1 ? '' : 's'} on record. Conversation exports feed the substrate; processing happens in the background.`}
          searchPlaceholder="Search imports…"
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          toolbarExtra={toolbarExtra}
        >
          {loading && <div className="s-empty">Loading…</div>}
          {!loading && imports.length === 0 && (
            <div className="s-empty" style={{ flexDirection: 'column', gap: 12 }}>
              <div>No imports yet.</div>
              <button type="button" onClick={() => navigate('/import')} className="s-pill">
                Go to Import
              </button>
            </div>
          )}
          {!loading && imports.length > 0 && filtered.length === 0 && (
            <div className="s-empty">No imports match.</div>
          )}
          {!loading && filtered.map((imp) => (
            <ImportRow
              key={imp.id}
              imp={imp}
              selected={selectedImport?.id === imp.id}
              onClick={() => setSelectedImport(imp)}
            />
          ))}
        </MnemosStreamShell>
      </div>

      {selectedImport && (
        <ImportDetailPanel
          imp={selectedImport}
          onClose={() => setSelectedImport(null)}
          onDeleted={() => {
            setSelectedImport(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

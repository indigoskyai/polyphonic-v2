/**
 * MemoryView — Round 2 Mnemos router.
 *
 * Memories tab → MnemosOverview (digest/overview surface)
 * Engrams / Beliefs / Graph → restyled tabs in shared MnemosStreamShell aesthetic
 * Imports → preserved import-history table
 * Settings → preserved settings panel
 *
 * NOTE: The old in-file MemoriesTab + MemoryDetailPanel were superseded by
 * MnemosOverview + GraphDetailPanel. To browse the full memories table the user
 * can use the Engrams tab (engrams ARE the substrate units of memory in Mnemos).
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useViewTabStore } from '@/stores/viewTabStore';
import GraphTab from '@/components/memory/GraphTab';
import EngramsTab from '@/components/memory/EngramsTab';
import BeliefsTab from '@/components/memory/BeliefsTab';
import ImportsTab from '@/components/memory/ImportsTab';
import MemorySettingsPanel from '@/components/memory/MemorySettingsPanel';
import MnemosOverview from '@/components/memory/MnemosOverview';

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

export default function MemoryView() {
  const activeTab = useViewTabStore((s) => s.memoryTab);
  const user = useAuthStore((s) => s.user);
  const loadAll = useMemoryStore((s) => s.loadAll);

  useEffect(() => {
    if (user) loadAll(user.id);
  }, [user]);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}
    >
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: activeTab === 'Graph' ? 0 : undefined }}
        >
          {activeTab === 'Memories' && <MnemosOverview />}
          {activeTab === 'Engrams' && <EngramsTab />}
          {activeTab === 'Beliefs' && <BeliefsTab />}
          {activeTab === 'Graph' && <GraphTab />}
          {activeTab === 'Imports' && <ImportsTab />}
          {activeTab === 'Settings' && <MemorySettingsPanel />}
        </div>
        {/* Engram details now open via the global drawer router (memory-detail). */}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMPORTS TAB — View import history and status (preserved as-is)
   ═══════════════════════════════════════════════════════════════ */

function ImportsTab() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImport, setSelectedImport] = useState<ImportRecord | null>(null);
  const [reprofiling, setReprofiling] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_imports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setImports(data as ImportRecord[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-ghost)', fontSize: 11 }}>
        Loading...
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-ghost)' }}>
        <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>No imports yet</div>
        <div className="text-[11px] mb-4">Upload conversation exports from ChatGPT or Claude.</div>
        <button
          onClick={() => navigate('/import')}
          className="text-[11px] px-4 py-2 rounded"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          Go to Import
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] uppercase font-medium" style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}>
            Import History
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleGlobalReprofile}
              disabled={reprofiling}
              className="text-[11px] px-3 py-1.5 rounded"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: reprofiling ? 'var(--text-ghost)' : 'var(--text-tertiary)',
                cursor: reprofiling ? 'wait' : 'pointer',
              }}
              title="Re-run the 5-pass deep psychological analysis on your latest memories"
            >
              {reprofiling ? 'Starting…' : 'Re-run profiling'}
            </button>
            <button
              onClick={() => navigate('/import')}
              className="text-[11px] px-3 py-1.5 rounded"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            >
              New Import
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {imports.map((imp) => (
            <div
              key={imp.id}
              onClick={() => setSelectedImport(imp)}
              className="cursor-pointer"
              style={{
                padding: '14px 16px',
                background: selectedImport?.id === imp.id ? 'var(--bg-surface)' : 'var(--card-bg)',
                border: `1px solid ${selectedImport?.id === imp.id ? 'var(--border)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                transition: 'all 120ms ease',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-soft)', letterSpacing: '0.04em' }}>
                    {imp.source_platform || 'unknown'}
                  </span>
                  <StatusBadge status={imp.status} />
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(imp.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {imp.total_conversations != null && <MiniStat label="Conversations" value={imp.total_conversations} />}
                {imp.processed_conversations != null && <MiniStat label="Processed" value={imp.processed_conversations} />}
                {imp.memories_created != null && <MiniStat label="Memories" value={imp.memories_created} />}
                {imp.questions_generated != null && imp.questions_generated > 0 && <MiniStat label="Questions" value={imp.questions_generated} />}
                {imp.conflicts_detected != null && imp.conflicts_detected > 0 && <MiniStat label="Conflicts" value={imp.conflicts_detected} />}
              </div>

              {imp.pipeline_stage && imp.status === 'processing' && (
                <div className="text-[10px] mt-2" style={{ color: 'var(--text-ghost)' }}>
                  Stage: <span style={{ color: 'var(--text-soft)' }}>{imp.pipeline_stage}</span>
                </div>
              )}
            </div>
          ))}
        </div>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px]" style={{ color: 'var(--text-ghost)' }}>{label}:</span>
      <span className="text-[10px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: 'rgba(140,168,156,0.12)', text: '#8ca89c' },
    processing: { bg: 'rgba(201,168,124,0.12)', text: '#c9a87c' },
    pending: { bg: 'rgba(140,140,140,0.1)', text: '#888' },
    failed: { bg: 'rgba(248,113,113,0.1)', text: '#f87171' },
    cleared: { bg: 'rgba(140,140,140,0.06)', text: '#666' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span
      className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, letterSpacing: '0.04em' }}
    >
      {status}
    </span>
  );
}

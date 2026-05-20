import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

interface Props {
  imp: ImportRecord;
  onClose: () => void;
  onDeleted: () => void;
  onReprofileStarted?: () => void;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportDetailPanel({ imp, onClose, onDeleted, onReprofileStarted }: Props) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reprofiling, setReprofiling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const startedMs = Date.now() - new Date(imp.created_at).getTime();
  const isProcessing = imp.status === 'processing';
  const isStalled = isProcessing && startedMs > 5 * 60 * 1000;

  async function handleCancel() {
    setCancelling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-cancel`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ import_id: imp.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Cancel failed (${res.status})`);
      }
      toast({ title: 'Import cancelled', description: 'The stuck import has been marked failed.' });
      onDeleted();
    } catch (e: any) {
      toast({ title: 'Cancel failed', description: e.message, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-import`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ import_id: imp.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Delete failed (${res.status})`);
      }
      const data = await res.json();
      toast({
        title: 'Import deleted',
        description: `Removed ${data.memories_deleted} memories and ${data.questions_deleted} questions.`,
      });
      onDeleted();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleReprofile() {
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
        description: 'Deep analysis is running in the background. Check the Profile page in 3–6 minutes.',
      });
      onReprofileStarted?.();
    } catch (e: any) {
      toast({ title: 'Could not start analysis', description: e.message, variant: 'destructive' });
    } finally {
      setReprofiling(false);
    }
  }

  return (
    <div
      style={{
        width: 360,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        overflow: 'auto',
        padding: '20px 18px',
        animation: 'viewFadeIn 0.2s var(--ease-out) both',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[9px] font-semibold uppercase"
          style={{ letterSpacing: '0.08em', color: 'var(--text-soft)' }}
        >
          {imp.source_platform || 'unknown'} · manage
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      </div>

      <div className="space-y-2 mb-5" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14 }}>
        <Row label="Status" value={imp.status} />
        <Row label="Stage" value={imp.pipeline_stage || '—'} />
        <Row label="File size" value={formatBytes(imp.file_size_bytes)} />
        <Row label="Conversations" value={imp.total_conversations ?? '—'} />
        <Row label="Memories created" value={imp.memories_created ?? 0} />
        <Row label="Questions" value={imp.questions_generated ?? 0} />
        <Row label="Conflicts" value={imp.conflicts_detected ?? 0} />
        <Row label="Started" value={new Date(imp.created_at).toLocaleString()} />
        {imp.completed_at && <Row label="Completed" value={new Date(imp.completed_at).toLocaleString()} />}
      </div>

      <div className="space-y-2">
        <button
          onClick={handleReprofile}
          disabled={reprofiling}
          className="text-[11px] px-3 py-2 rounded w-full"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: reprofiling ? 'var(--text-ghost)' : 'var(--text-primary)',
            cursor: reprofiling ? 'wait' : 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          {reprofiling ? 'Starting analysis…' : 'Re-run psychological profiling'}
        </button>

        <button
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          className="text-[11px] px-3 py-2 rounded w-full"
          style={{
            background: 'rgba(248,113,113,0.06)',
            border: '1px solid rgba(248,113,113,0.25)',
            color: '#f87171',
            cursor: deleting ? 'wait' : 'pointer',
          }}
        >
          {deleting ? 'Deleting…' : 'Delete import + memories'}
        </button>

        <div className="text-[10px] mt-2" style={{ color: 'var(--text-ghost)', lineHeight: 1.5 }}>
          Deleting cascades: removes the import, all memories tagged with this import, and curiosity questions
          generated during it. Engrams and beliefs are preserved.
        </div>
      </div>

      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 24,
              maxWidth: 420,
              width: '90%',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
              Delete this import?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              This will permanently remove the import record, all{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{imp.memories_created ?? 0}</strong> memories
              extracted from it, and any curiosity questions it generated. Engrams and beliefs are preserved.
              This cannot be undone.
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="cursor-pointer"
                style={{
                  height: 36,
                  padding: '0 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer"
                style={{
                  height: 36,
                  padding: '0 16px',
                  background: 'rgba(248,113,113,0.88)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between" style={{ fontSize: 11 }}>
      <span style={{ color: 'var(--text-ghost)' }}>{label}</span>
      <span style={{ color: 'var(--text-soft)', fontFamily: 'var(--font-mono)' }}>{String(value)}</span>
    </div>
  );
}

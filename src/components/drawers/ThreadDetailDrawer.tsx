import React, { useEffect, useMemo, useState } from 'react';
import {
  DrawerHeader,
  DrawerCrumb,
  DrawerTitle,
  DrawerEscChip,
  DrawerCloseBtn,
  DrawerBody,
  DrawerSection,
  DrawerSectionLabel,
  DrawerFooter,
  DrawerFooterSep,
  Pill,
} from '@/components/ui/luca';
import { useDrawerStore } from '@/stores/drawerStore';
import { useThreadStore } from '@/stores/threadStore';
import { supabase } from '@/integrations/supabase/client';
import ActivityTimeline, { activityLogToTimeline } from '@/components/timeline/ActivityTimeline';

interface ThreadDetailPayload {
  threadId?: string;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  title: string | null;
  summary: string | null;
  content: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ${Math.round((mins - hrs * 60) / 10) * 10}m ago`.replace(' 0m ', ' ');
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function computeThreadNumber(threads: { id: string; created_at: string }[], id: string): string {
  const sorted = [...threads].sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
  const idx = sorted.findIndex((t) => t.id === id);
  if (idx < 0) return '—';
  return `№ ${String(idx + 1).padStart(4, '0')}`;
}

export default function ThreadDetailDrawer() {
  const close = useDrawerStore((s) => s.close);
  const payload = useDrawerStore((s) => s.payload) as ThreadDetailPayload | null;
  const threadId = payload?.threadId;

  const threads = useThreadStore((s) => s.threads);
  const updateThreadTitle = useThreadStore((s) => s.updateThreadTitle);
  const updateThreadPinned = useThreadStore((s) => s.updateThreadPinned);

  const thread = useMemo(() => threads.find((t) => t.id === threadId) || null, [threads, threadId]);

  const [turns, setTurns] = useState<number | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!threadId) return;
      setLoading(true);
      const settled = await Promise.allSettled([
        supabase
          .from('messages')
          .select('id, role, model, tokens_used, agent')
          .eq('thread_id', threadId),
        supabase
          .from('entity_activity_log')
          .select('id, activity_type, title, summary, content, source, created_at')
          .eq('user_id', thread?.user_id ?? '')
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

      if (cancelled) return;

      const msgRes = settled[0].status === 'fulfilled' ? settled[0].value : { data: [] };
      const actRes = settled[1].status === 'fulfilled' ? settled[1].value : { data: [] };

      const msgs = (msgRes.data ?? []) as { id: string; role: string; model: string | null; tokens_used: number | null; agent: string | null }[];
      setTurns(msgs.length);
      setTokens(msgs.reduce((sum, m) => sum + (m.tokens_used ?? 0), 0));
      const models = msgs.map((m) => m.model).filter(Boolean) as string[];
      setPrimaryModel(models.length ? models[models.length - 1] : null);

      // Filter activity to thread when possible (content may have thread_id)
      const all = (actRes.data ?? []) as ActivityRow[];
      const forThread = all.filter((a) => {
        const c = a.content || {};
        return !c.thread_id || c.thread_id === threadId;
      });
      setActivityRows(forThread.slice(0, 20));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [threadId, thread?.user_id]);

  useEffect(() => {
    if (!renaming) setRenameDraft(thread?.title || '');
  }, [thread?.title, renaming]);

  if (!threadId || !thread) {
    return (
      <>
        <DrawerHeader>
          <DrawerTitle>Thread</DrawerTitle>
          <DrawerEscChip />
          <DrawerCloseBtn onClick={close} />
        </DrawerHeader>
        <DrawerBody>
          <DrawerSection>
            <p style={{ color: 'var(--text-ghost)' }}>Thread not found.</p>
          </DrawerSection>
        </DrawerBody>
      </>
    );
  }

  const threadNumber = computeThreadNumber(threads, thread.id);
  const timelineRows = activityLogToTimeline(activityRows);

  const commitRename = async () => {
    const v = renameDraft.trim();
    if (v && v !== thread.title) {
      await updateThreadTitle(thread.id, v);
    }
    setRenaming(false);
  };

  const cancelRename = () => {
    setRenameDraft(thread.title || '');
    setRenaming(false);
  };

  const togglePin = async () => {
    await updateThreadPinned(thread.id, !thread.pinned);
  };

  const exportJSON = () => {
    const payload = {
      thread,
      turns,
      tokens,
      primaryModel,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thread-${thread.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <DrawerHeader>
        <div className="drawer-header-col">
          <DrawerCrumb num={threadNumber} label={renaming ? 'Renaming' : 'Thread'} />
          {renaming ? (
            <input
              className="drawer-title-input"
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
              }}
              onBlur={commitRename}
            />
          ) : (
            <DrawerTitle>{thread.title || 'Untitled thread'}</DrawerTitle>
          )}
          {renaming && (
            <span className="drawer-rename-hint">↵ save · esc cancel</span>
          )}
        </div>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        <DrawerSection>
          <DrawerSectionLabel>METADATA</DrawerSectionLabel>
          <div className="meta-kv">
            <div className="meta-kv__row"><span className="meta-kv__k">created</span><span className="meta-kv__v">{absTime(thread.created_at)} · {relativeTime(thread.created_at)}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">updated</span><span className="meta-kv__v">{absTime(thread.updated_at)} · {relativeTime(thread.updated_at)}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">turns</span><span className="meta-kv__v">{loading ? '—' : turns}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">tokens</span><span className="meta-kv__v">{loading ? '—' : tokens?.toLocaleString() ?? '0'}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">model</span><span className="meta-kv__v">{primaryModel || 'opus-4-7'}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">heat</span><span className="meta-kv__v">{thread.heat}</span></div>
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>PARTICIPANTS · 1</DrawerSectionLabel>
          <div className="participant-list">
            <div className="participant">
              <div className="participant__avatar participant__avatar--luca">L</div>
              <div className="participant__body">
                <div className="participant__name">Luca</div>
                <div className="participant__role">ORCHESTRATOR · {(primaryModel || 'OPUS 4.7').toUpperCase()}</div>
              </div>
              <div className="participant__stats">
                <span>{turns ?? '—'} turns</span>
                <span>{tokens?.toLocaleString() ?? '—'} tok</span>
              </div>
            </div>
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>ACTIVITY · {timelineRows.length} events</DrawerSectionLabel>
          <ActivityTimeline rows={timelineRows} emptyText="No activity recorded for this thread." />
        </DrawerSection>
      </DrawerBody>
      <DrawerFooter>
        <Pill variant="ghost" size="xs" onClick={() => setRenaming(true)}>Rename</Pill>
        <Pill variant="ghost" size="xs" active={thread.pinned} onClick={togglePin}>
          {thread.pinned ? 'Unpin' : 'Pin'}
        </Pill>
        <Pill variant="ghost" size="xs" onClick={exportJSON}>Export</Pill>
        <DrawerFooterSep />
        <Pill variant="destructive" size="xs" onClick={close}>Archive</Pill>
      </DrawerFooter>
    </>
  );
}

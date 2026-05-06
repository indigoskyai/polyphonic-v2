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
  EmptyState,
  Pill,
} from '@/components/ui/luca';
import { useDrawerStore } from '@/stores/drawerStore';
import { useThreadStore } from '@/stores/threadStore';
import { supabase } from '@/integrations/supabase/client';
import ActivityTimeline, { activityLogToTimeline } from '@/components/timeline/ActivityTimeline';
import { activityReferencesThread } from '@/lib/threadActivity';

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

interface MessageRow {
  id: string;
  role: string;
  model: string | null;
  tokens_used: number | null;
  agent: string | null;
  created_at?: string;
}

interface ParticipantSummary {
  id: string;
  label: string;
  role: string;
  turns: number;
  tokens: number;
  model: string | null;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins - hrs * 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
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

function agentLabel(agent: string): string {
  const normalized = agent.toLowerCase();
  if (normalized === 'luca') return 'Luca';
  if (normalized === 'anima') return 'Anima';
  if (normalized === 'vektor') return 'Vektor';
  if (normalized === 'guardian' || normalized === 'observer') return 'Observer';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function agentInitial(agent: string): string {
  return agentLabel(agent).charAt(0) || 'L';
}

function agentAvatarClass(agent: string): string {
  const normalized = agent.toLowerCase();
  if (['luca', 'anima', 'vektor'].includes(normalized)) return ` participant__avatar--${normalized}`;
  return '';
}

function agentRole(agent: string, model: string | null): string {
  const normalized = agent.toLowerCase();
  const modelLabel = model ? model.toUpperCase() : 'MODEL UNRECORDED';
  if (normalized === 'luca') return `ORCHESTRATOR · ${modelLabel}`;
  if (normalized === 'guardian' || normalized === 'observer') return `OBSERVER · ${modelLabel}`;
  return `AGENT · ${modelLabel}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeParticipants(messages: MessageRow[], fallbackAgent: string): ParticipantSummary[] {
  const map = new Map<string, ParticipantSummary>();
  messages.forEach((message) => {
    if (message.role === 'user') return;
    const agent = (message.agent || fallbackAgent || 'luca').toLowerCase();
    const existing = map.get(agent);
    if (existing) {
      existing.turns += 1;
      existing.tokens += message.tokens_used ?? 0;
      if (message.model) existing.model = message.model;
      existing.role = agentRole(agent, existing.model);
      return;
    }
    map.set(agent, {
      id: agent,
      label: agentLabel(agent),
      role: agentRole(agent, message.model),
      turns: 1,
      tokens: message.tokens_used ?? 0,
      model: message.model,
    });
  });

  if (map.size === 0) {
    const agent = (fallbackAgent || 'luca').toLowerCase();
    map.set(agent, {
      id: agent,
      label: agentLabel(agent),
      role: agentRole(agent, null),
      turns: 0,
      tokens: 0,
      model: null,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.turns - a.turns);
}

export default function ThreadDetailDrawer() {
  const close = useDrawerStore((s) => s.close);
  const payload = useDrawerStore((s) => s.payload) as ThreadDetailPayload | null;
  const threadId = payload?.threadId;

  const threads = useThreadStore((s) => s.threads);
  const updateThreadTitle = useThreadStore((s) => s.updateThreadTitle);
  const updateThreadPinned = useThreadStore((s) => s.updateThreadPinned);

  const thread = useMemo(() => threads.find((t) => t.id === threadId) || null, [threads, threadId]);

  const [messageRows, setMessageRows] = useState<MessageRow[]>([]);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!threadId || !thread?.user_id) return;
      setLoading(true);
      setMessageRows([]);
      setActivityRows([]);
      const settled = await Promise.allSettled([
        supabase
          .from('messages')
          .select('id, role, model, tokens_used, agent')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true }),
        supabase
          .from('entity_activity_log')
          .select('id, activity_type, title, summary, content, source, created_at')
          .eq('user_id', thread.user_id)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (cancelled) return;

      const msgRes = settled[0].status === 'fulfilled' ? settled[0].value : { data: [] };
      const actRes = settled[1].status === 'fulfilled' ? settled[1].value : { data: [] };

      const msgs = (msgRes.data ?? []) as MessageRow[];
      setMessageRows(msgs);

      const all = (actRes.data ?? []) as ActivityRow[];
      const forThread = all.filter((row) => activityReferencesThread(row.content, threadId));
      setActivityRows(forThread.slice(0, 40));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [threadId, thread?.user_id]);

  useEffect(() => {
    if (!threadId || !thread?.user_id) return;
    const channel = supabase
      .channel(`thread-drawer-${threadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row?.id) return;
          setMessageRows((prev) => {
            const idx = prev.findIndex((msg) => msg.id === row.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = { ...next[idx], ...row };
              return next;
            }
            return [...prev, row];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'entity_activity_log', filter: `user_id=eq.${thread.user_id}` },
        (payload) => {
          const row = payload.new as ActivityRow;
          if (!row?.id || !activityReferencesThread(row.content, threadId)) return;
          setActivityRows((prev) => [row, ...prev.filter((item) => item.id !== row.id)].slice(0, 40));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
  const turns = messageRows.length;
  const tokens = messageRows.reduce((sum, message) => sum + (message.tokens_used ?? 0), 0);
  const primaryModel = [...messageRows].reverse().find((message) => message.model)?.model ?? null;
  const participants = summarizeParticipants(messageRows, thread.agent_id || 'luca');

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
      participants,
      activity: activityRows,
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
            <div className="meta-kv__row"><span className="meta-kv__k">model</span><span className="meta-kv__v">{primaryModel || '—'}</span></div>
            <div className="meta-kv__row"><span className="meta-kv__k">heat</span><span className="meta-kv__v">{thread.heat}</span></div>
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>PARTICIPANTS · {participants.length}</DrawerSectionLabel>
          <div className="participant-list">
            {participants.map((participant) => (
              <div key={participant.id} className="participant">
                <div className={`participant__avatar${agentAvatarClass(participant.id)}`}>{agentInitial(participant.id)}</div>
                <div className="participant__body">
                  <div className="participant__name">{participant.label}</div>
                  <div className="participant__role">{participant.role}</div>
                </div>
                <div className="participant__stats">
                  <span>{formatCount(participant.turns, 'turn')}</span>
                  <span>{participant.tokens ? participant.tokens.toLocaleString() : '—'} tok</span>
                </div>
              </div>
            ))}
          </div>
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>ACTIVITY · {timelineRows.length} events</DrawerSectionLabel>
          {loading ? (
            <EmptyState text="Loading thread activity..." />
          ) : (
            <ActivityTimeline rows={timelineRows} emptyText="No activity recorded for this thread." />
          )}
        </DrawerSection>
      </DrawerBody>
      <DrawerFooter>
        <Pill variant="ghost" size="xs" onClick={() => setRenaming(true)}>Rename</Pill>
        <Pill variant="ghost" size="xs" active={thread.pinned} onClick={togglePin}>
          {thread.pinned ? 'Unpin' : 'Pin'}
        </Pill>
        <Pill variant="ghost" size="xs" onClick={exportJSON}>Export</Pill>
        <DrawerFooterSep />
        <Pill variant="ghost" size="xs" onClick={close}>Close</Pill>
      </DrawerFooter>
    </>
  );
}

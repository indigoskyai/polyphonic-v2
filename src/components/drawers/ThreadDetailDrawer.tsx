import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getChatModelLabel, normalizeThreadRuntimeMode } from '@/lib/chatRuntime';

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

interface ContinuityDiagnosticRow {
  layer: string;
  status: 'ok' | 'empty' | 'skipped' | 'error';
  count: number | null;
  rendered: number | null;
  message: string | null;
}

export type ContinuityPreviewItem =
  | string
  | {
      id?: string | null;
      content?: string | null;
      excerpt?: string | null;
      summary?: string | null;
      text?: string | null;
      score?: number | null;
      confidence?: number | null;
      source?: string | null;
      thread_id?: string | null;
      source_message_id?: string | null;
      tags?: string[];
    };

interface ContinuityInspectPayload {
  ok: boolean;
  generated_at?: string;
  runtime_mode?: string;
  selected_model?: string | null;
  memory_enabled?: boolean;
  bridge?: string;
  hypomnema?: { count: number; rendered: number; items: ContinuityPreviewItem[] };
  functional_memory?: Array<{
    id: string;
    type: string;
    confidence: number;
    source?: string;
    content: string;
    tags: string[];
  }>;
  mnemos?: Array<{
    id: string | null;
    activation: number | null;
    path: string | null;
    type: string | null;
    content: string;
    tags: string[];
  }>;
  diagnostics?: ContinuityDiagnosticRow[];
}

export function continuityItemToText(item: ContinuityPreviewItem | null | undefined): string {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return String(item);
  const candidate = item.content ?? item.excerpt ?? item.summary ?? item.text;
  if (typeof candidate === 'string') return candidate;
  return '';
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins - hrs * 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function absTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
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

function modelParticipantRole(model: string | null): string {
  return `MODEL · ${model ? model.toUpperCase() : 'MODEL UNRECORDED'}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeParticipants(
  messages: MessageRow[],
  options: { fallbackAgent: string; runtimeMode: string; selectedModel?: string | null },
): ParticipantSummary[] {
  const map = new Map<string, ParticipantSummary>();
  messages.forEach((message) => {
    if (message.role === 'user') return;
    const isClassicModelTurn = options.runtimeMode === 'classic' && !message.agent;
    const model = message.model || options.selectedModel || null;
    const id = isClassicModelTurn ? `model:${model || 'unknown'}` : (message.agent || options.fallbackAgent || 'luca').toLowerCase();
    const existing = map.get(id);
    if (existing) {
      existing.turns += 1;
      existing.tokens += message.tokens_used ?? 0;
      if (message.model) existing.model = message.model;
      existing.role = isClassicModelTurn ? modelParticipantRole(existing.model || model) : agentRole(id, existing.model);
      return;
    }
    map.set(id, {
      id,
      label: isClassicModelTurn ? getChatModelLabel(model) : agentLabel(id),
      role: isClassicModelTurn ? modelParticipantRole(model) : agentRole(id, message.model),
      turns: 1,
      tokens: message.tokens_used ?? 0,
      model: message.model,
    });
  });

  if (map.size === 0) {
    const isClassic = options.runtimeMode === 'classic';
    const id = isClassic ? `model:${options.selectedModel || 'unknown'}` : (options.fallbackAgent || 'luca').toLowerCase();
    map.set(id, {
      id,
      label: isClassic ? getChatModelLabel(options.selectedModel) : agentLabel(id),
      role: isClassic ? modelParticipantRole(options.selectedModel || null) : agentRole(id, null),
      turns: 0,
      tokens: 0,
      model: isClassic ? options.selectedModel || null : null,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.turns - a.turns);
}

function participantInitial(participant: ParticipantSummary): string {
  return participant.label.charAt(0).toUpperCase() || 'M';
}

function layerLabel(layer: string): string {
  return layer.replace(/_/g, ' ');
}

function continuityStatusColor(status: ContinuityDiagnosticRow['status']): string {
  if (status === 'ok') return 'var(--success, #7bd88f)';
  if (status === 'error') return 'var(--danger, #ff6b6b)';
  if (status === 'skipped') return 'var(--text-ghost)';
  return 'var(--text-tertiary)';
}

function compactBridge(value: string | undefined): string {
  return (value || '')
    .replace(/^## .+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ContinuityList({
  title,
  items,
  empty,
}: {
  title: string;
  items: ContinuityPreviewItem[];
  empty: string;
}) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => continuityItemToText(item))
    .filter((text) => text && text.length > 0);
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div style={{ color: 'var(--text-ghost)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      {normalized.length > 0 ? (
        <div style={{ display: 'grid', gap: 7 }}>
          {normalized.slice(0, 4).map((text, index) => (
            <div key={`${title}-${index}`} style={{ color: 'var(--text-soft)', fontSize: 12, lineHeight: 1.45 }}>
              {text}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-ghost)', fontSize: 12 }}>{empty}</div>
      )}
    </div>
  );
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
  const [continuity, setContinuity] = useState<ContinuityInspectPayload | null>(null);
  const [continuityLoading, setContinuityLoading] = useState(false);
  const [continuityError, setContinuityError] = useState<string | null>(null);

  const loadContinuity = useCallback(async () => {
    if (!threadId) return;
    setContinuityLoading(true);
    setContinuityError(null);
    try {
      const { data, error } = await supabase.functions.invoke('continuity-inspect', {
        body: { thread_id: threadId },
      });
      if (error) throw error;
      setContinuity(data as ContinuityInspectPayload);
    } catch (err) {
      setContinuity(null);
      setContinuityError(err instanceof Error ? err.message : 'Could not load continuity');
    } finally {
      setContinuityLoading(false);
    }
  }, [threadId]);

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
    void loadContinuity();
  }, [loadContinuity]);

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
  const runtimeMode = normalizeThreadRuntimeMode(thread.runtime_mode, 'agent');
  const participants = summarizeParticipants(messageRows, {
    fallbackAgent: thread.agent_id || 'luca',
    runtimeMode,
    selectedModel: thread.selected_model || primaryModel,
  });
  const bridgeText = compactBridge(continuity?.bridge);
  const degradedLayers = continuity?.diagnostics?.filter((diagnostic) => diagnostic.status === 'error') ?? [];
  const continuityHasSignal = Boolean(
    bridgeText ||
    continuity?.hypomnema?.items?.length ||
    continuity?.functional_memory?.length ||
    continuity?.mnemos?.length ||
    degradedLayers.length,
  );

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
                <div className={`participant__avatar${agentAvatarClass(participant.id)}`}>{participantInitial(participant)}</div>
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
          <DrawerSectionLabel>CONTINUITY</DrawerSectionLabel>
          {continuityLoading ? (
            <EmptyState text="Loading continuity..." />
          ) : continuityError ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ color: 'var(--danger, #ff6b6b)', fontSize: 12, margin: 0 }}>{continuityError}</p>
              <Pill variant="ghost" size="xs" onClick={() => { void loadContinuity(); }}>Retry</Pill>
            </div>
          ) : !continuityHasSignal ? (
            <EmptyState text="No continuity signal loaded for this thread yet." />
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="meta-kv">
                <div className="meta-kv__row"><span className="meta-kv__k">mode</span><span className="meta-kv__v">{continuity?.runtime_mode || '—'}</span></div>
                <div className="meta-kv__row"><span className="meta-kv__k">memory</span><span className="meta-kv__v">{continuity?.memory_enabled === false ? 'off' : 'on'}</span></div>
                <div className="meta-kv__row"><span className="meta-kv__k">updated</span><span className="meta-kv__v">{continuity?.generated_at ? absTime(continuity.generated_at) : '—'}</span></div>
              </div>

              {bridgeText && (
                <div style={{ color: 'var(--text-soft)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {bridgeText}
                </div>
              )}

              {degradedLayers.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: 'var(--danger, #ff6b6b)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Degraded</div>
                  {degradedLayers.map((diagnostic) => (
                    <div key={diagnostic.layer} style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                      {layerLabel(diagnostic.layer)}{diagnostic.message ? ` · ${diagnostic.message}` : ''}
                    </div>
                  ))}
                </div>
              )}

              <ContinuityList
                title={`Hypomnema · ${continuity?.hypomnema?.rendered ?? 0}`}
                items={Array.isArray(continuity?.hypomnema?.items) ? continuity!.hypomnema!.items : []}
                empty="No interior thread loaded."
              />
              <ContinuityList
                title={`Reliable memory · ${Array.isArray(continuity?.functional_memory) ? continuity!.functional_memory!.length : 0}`}
                items={Array.isArray(continuity?.functional_memory) ? continuity!.functional_memory! : []}
                empty="No reliable memories matched this thread."
              />
              <ContinuityList
                title={`Mnemos · ${Array.isArray(continuity?.mnemos) ? continuity!.mnemos!.length : 0}`}
                items={Array.isArray(continuity?.mnemos) ? continuity!.mnemos! : []}
                empty="No associative traces matched this focus."
              />

              {continuity?.diagnostics && continuity.diagnostics.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Layer health</div>
                  <div style={{ display: 'grid', gap: 5 }}>
                    {continuity.diagnostics.map((diagnostic) => (
                      <div key={diagnostic.layer} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-soft)' }}>{layerLabel(diagnostic.layer)}</span>
                        <span style={{ color: continuityStatusColor(diagnostic.status) }}>
                          {diagnostic.status}{diagnostic.rendered != null ? ` · ${diagnostic.rendered}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
        <Pill variant="ghost" size="xs" onClick={() => { void loadContinuity(); }}>Refresh continuity</Pill>
        <DrawerFooterSep />
        <Pill variant="ghost" size="xs" onClick={close}>Close</Pill>
      </DrawerFooter>
    </>
  );
}

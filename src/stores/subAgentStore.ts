import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type SubAgentState = 'queued' | 'active' | 'complete' | 'failed';
export type SubAgentFamily = 'v1' | 'v2' | 'v3';

const FAMILIES: SubAgentFamily[] = ['v1', 'v2', 'v3'];

export function deriveSubAgentFamily(seed: string): SubAgentFamily {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return FAMILIES[Math.abs(h) % FAMILIES.length];
}

export interface SubAgent {
  id: string;
  family: SubAgentFamily;
  parentAgent: string;
  task: string;
  state: SubAgentState;
  startedAt: number | null;
  endedAt: number | null;
  progress: number;
  source?: 'local' | 'remote';
  threadId?: string;
}

export interface SubAgentTaskRow {
  id: string;
  parent_thread_id: string;
  agent_id: string | null;
  task_description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | string;
  started_at: string | null;
  completed_at: string | null;
  progress: number | null;
}

export interface SubAgentEvent {
  id: string;
  ts: number;
  agentId: string | null;
  agentName: string;
  text: string;
}

interface PendingCancel {
  agentId: string;
  previousState: SubAgentState;
  expiresAt: number;
  timeoutId: number;
}

interface SubAgentStore {
  agents: Record<string, SubAgent>;
  events: SubAgentEvent[];
  overlayOpenForParent: string | null;
  selectedAgentId: string | null;
  pendingCancel: PendingCancel | null;
  spawn: (a: Omit<SubAgent, 'id' | 'state' | 'startedAt' | 'endedAt' | 'progress'>) => string;
  update: (id: string, patch: Partial<SubAgent>) => void;
  emit: (e: Omit<SubAgentEvent, 'id' | 'ts'>) => void;
  openOverlay: (parentAgent: string, selectedId?: string) => void;
  closeOverlay: () => void;
  select: (id: string | null) => void;
  cancel: (id: string) => void;
  undoCancel: () => void;
  clearPendingCancel: () => void;
  syncRemoteTask: (row: SubAgentTaskRow) => void;
  hydrateRemoteTasks: (rows: SubAgentTaskRow[]) => void;
  pruneStaleRemoteTasks: (maxAgeMs?: number) => void;
}

const MAX_EVENTS = 200;

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

export const useSubAgentStore = create<SubAgentStore>((set, get) => ({
  agents: {},
  events: [],
  overlayOpenForParent: null,
  selectedAgentId: null,
  pendingCancel: null,

  spawn: (a) => {
    const id = genId('sa');
    const agent: SubAgent = {
      ...a,
      id,
      state: 'active',
      startedAt: Date.now(),
      endedAt: null,
      progress: 0,
    };
    set((s) => ({
      agents: { ...s.agents, [id]: agent },
      events: [
        { id: genId('ev'), ts: Date.now(), agentId: id, agentName: a.family, text: `spawned: ${a.task}` },
        ...s.events,
      ].slice(0, MAX_EVENTS),
    }));
    return id;
  },

  update: (id, patch) => set((s) => {
    const existing = s.agents[id];
    if (!existing) return {};
    const merged: SubAgent = { ...existing, ...patch };
    if ((patch.state === 'complete' || patch.state === 'failed') && !existing.endedAt) {
      merged.endedAt = Date.now();
    }
    return { agents: { ...s.agents, [id]: merged } };
  }),

  emit: (e) => set((s) => ({
    events: [
      { ...e, id: genId('ev'), ts: Date.now() },
      ...s.events,
    ].slice(0, MAX_EVENTS),
  })),

  openOverlay: (parentAgent, selectedId) => set({
    overlayOpenForParent: parentAgent,
    selectedAgentId: selectedId ?? null,
  }),

  closeOverlay: () => set({ overlayOpenForParent: null, selectedAgentId: null }),

  select: (id) => set({ selectedAgentId: id }),

  cancel: (id) => {
    const { agents, pendingCancel } = get();
    const existing = agents[id];
    if (!existing) return;
    if (pendingCancel) {
      window.clearTimeout(pendingCancel.timeoutId);
    }
    const previousState = existing.state;
    set((s) => ({
      agents: {
        ...s.agents,
        [id]: { ...existing, state: 'failed', endedAt: Date.now() },
      },
    }));

    // Defer the DB cancel until the 3-second undo window expires — that way
    // undoCancel can revert without leaving an already-cancelled row in the
    // DB. If the user lets the toast time out, we commit the cancellation
    // (remote tasks only; local DEV-mock tasks have no DB row).
    const timeoutId = window.setTimeout(() => {
      const cur = get().pendingCancel;
      if (cur && cur.agentId === id) {
        if (existing.source === 'remote' && existing.id.startsWith('remote-')) {
          const dbId = existing.id.slice('remote-'.length);
          cancelRemoteSubagent(dbId).catch((err) => console.warn('[subagent] remote cancel failed:', err));
        }
        set({ pendingCancel: null });
      }
    }, 3000);
    set({ pendingCancel: { agentId: id, previousState, expiresAt: Date.now() + 3000, timeoutId } });
  },

  undoCancel: () => {
    const { pendingCancel, agents } = get();
    if (!pendingCancel) return;
    window.clearTimeout(pendingCancel.timeoutId);
    const target = agents[pendingCancel.agentId];
    if (target) {
      set((s) => ({
        agents: { ...s.agents, [target.id]: { ...target, state: pendingCancel.previousState, endedAt: null } },
        pendingCancel: null,
      }));
    } else {
      set({ pendingCancel: null });
    }
  },

  clearPendingCancel: () => {
    const { pendingCancel } = get();
    if (pendingCancel) window.clearTimeout(pendingCancel.timeoutId);
    set({ pendingCancel: null });
  },

  syncRemoteTask: (row) => set((s) => {
    const next = applyRemoteTask(s.agents, row);
    if (!next) return {};
    return next;
  }),

  hydrateRemoteTasks: (rows) => set((s) => {
    let agents = s.agents;
    for (const row of rows) {
      const result = applyRemoteTask(agents, row);
      if (result) agents = result.agents;
    }
    return agents === s.agents ? {} : { agents };
  }),

  pruneStaleRemoteTasks: (maxAgeMs = 5 * 60 * 1000) => set((s) => {
    const now = Date.now();
    const filtered: Record<string, SubAgent> = {};
    let changed = false;
    for (const [id, agent] of Object.entries(s.agents)) {
      if (
        agent.source === 'remote'
        && (agent.state === 'complete' || agent.state === 'failed')
        && agent.endedAt
        && now - agent.endedAt > maxAgeMs
      ) {
        changed = true;
        continue;
      }
      filtered[id] = agent;
    }
    return changed ? { agents: filtered } : {};
  }),
}));

async function cancelRemoteSubagent(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('subagent_tasks')
    .update({ status: 'cancelled' })
    .eq('id', taskId)
    .in('status', ['pending', 'running']);
  if (error) throw error;
}

function mapRemoteState(status: string): SubAgentState {
  if (status === 'completed') return 'complete';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'running') return 'active';
  return 'queued';
}

function applyRemoteTask(
  agents: Record<string, SubAgent>,
  row: SubAgentTaskRow,
): { agents: Record<string, SubAgent> } | null {
  const remoteId = `remote-${row.id}`;
  const state = mapRemoteState(row.status);
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : null;
  const endedAt = row.completed_at ? new Date(row.completed_at).getTime() : null;
  const progress = state === 'complete'
    ? 1
    : Math.min(0.99, Math.max(0, Number(row.progress ?? 0)));

  const next: SubAgent = {
    id: remoteId,
    family: deriveSubAgentFamily(row.id),
    parentAgent: row.agent_id || 'luca',
    task: row.task_description,
    state,
    startedAt,
    endedAt,
    progress,
    source: 'remote',
    threadId: row.parent_thread_id,
  };

  const previous = agents[remoteId];
  if (
    previous
    && previous.state === next.state
    && previous.progress === next.progress
    && previous.task === next.task
  ) {
    return null;
  }

  return { agents: { ...agents, [remoteId]: next } };
}

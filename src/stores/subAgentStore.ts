import { create } from 'zustand';

export type SubAgentState = 'queued' | 'active' | 'complete' | 'failed';
export type SubAgentFamily = 'v1' | 'v2' | 'v3';

export interface SubAgent {
  id: string;
  family: SubAgentFamily;
  parentAgent: string;
  task: string;
  state: SubAgentState;
  startedAt: number | null;
  endedAt: number | null;
  progress: number;
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
    const timeoutId = window.setTimeout(() => {
      const cur = get().pendingCancel;
      if (cur && cur.agentId === id) {
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
}));

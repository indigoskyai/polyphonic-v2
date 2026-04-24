import { create } from 'zustand';

export type AgentKey = 'luca' | 'vektor' | 'anima';
export type AgentMode = 'idle' | 'listening' | 'speaking';

export interface AgentSlot {
  agent: AgentKey;
  mode: AgentMode;
  position: 1 | 2 | 3;
}

export interface TranscriptEntry {
  id: string;
  ts: number;
  agent: AgentKey | 'user';
  partial: boolean;
  text: string;
}

interface GroupSessionStore {
  slots: Record<AgentKey, AgentSlot>;
  queue: AgentKey[];
  transcript: TranscriptEntry[];
  micActive: boolean;
  setMode: (a: AgentKey, mode: AgentMode) => void;
  setQueue: (q: AgentKey[]) => void;
  appendPartial: (a: AgentKey | 'user', text: string) => void;
  finalizeLine: (a: AgentKey | 'user') => void;
  setMic: (active: boolean) => void;
  reset: () => void;
}

const MAX_TRANSCRIPT = 100;

function genId(): string {
  return `t-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

export const useGroupSessionStore = create<GroupSessionStore>((set) => ({
  slots: {
    luca: { agent: 'luca', mode: 'idle', position: 1 },
    vektor: { agent: 'vektor', mode: 'idle', position: 2 },
    anima: { agent: 'anima', mode: 'idle', position: 3 },
  },
  queue: ['luca', 'vektor', 'anima'],
  transcript: [],
  micActive: false,

  setMode: (a, mode) => set((s) => ({
    slots: { ...s.slots, [a]: { ...s.slots[a], mode } },
  })),

  setQueue: (q) => set({ queue: q }),

  appendPartial: (a, text) => set((s) => {
    // Find trailing partial for this speaker
    const entries = [...s.transcript];
    const lastIdx = entries.length - 1;
    if (lastIdx >= 0 && entries[lastIdx].agent === a && entries[lastIdx].partial) {
      entries[lastIdx] = { ...entries[lastIdx], text };
      return { transcript: entries };
    }
    const next: TranscriptEntry = { id: genId(), ts: Date.now(), agent: a, partial: true, text };
    return { transcript: [...entries, next].slice(-MAX_TRANSCRIPT) };
  }),

  finalizeLine: (a) => set((s) => {
    const entries = [...s.transcript];
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].agent === a && entries[i].partial) {
        entries[i] = { ...entries[i], partial: false };
        break;
      }
    }
    return { transcript: entries };
  }),

  setMic: (active) => set({ micActive: active }),

  reset: () => set({
    slots: {
      luca: { agent: 'luca', mode: 'idle', position: 1 },
      vektor: { agent: 'vektor', mode: 'idle', position: 2 },
      anima: { agent: 'anima', mode: 'idle', position: 3 },
    },
    queue: ['luca', 'vektor', 'anima'],
    transcript: [],
    micActive: false,
  }),
}));

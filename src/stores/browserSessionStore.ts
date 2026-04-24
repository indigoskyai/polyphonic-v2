import { create } from 'zustand';

export type BrowserActionStatus = 'pending' | 'success' | 'error';

export interface BrowserAction {
  id: string;
  ts: string;
  status: BrowserActionStatus;
  text: string;
}

export interface BrowserSession {
  id: string;
  agent: 'luca' | 'vektor' | 'anima' | 'observer';
  url: string;
  status: 'live' | 'done' | 'errored';
  cursor: { x: number; y: number };
  actions: BrowserAction[];
}

interface BrowserSessionState {
  sessions: Record<string, BrowserSession>;
  upsert: (s: BrowserSession) => void;
  appendAction: (sessionId: string, a: BrowserAction) => void;
  setCursor: (sessionId: string, x: number, y: number) => void;
  setStatus: (sessionId: string, status: BrowserSession['status']) => void;
  remove: (sessionId: string) => void;
}

export const useBrowserSessionStore = create<BrowserSessionState>((set) => ({
  sessions: {},

  upsert: (s) => set((state) => ({
    sessions: { ...state.sessions, [s.id]: s },
  })),

  appendAction: (sessionId, a) => set((state) => {
    const existing = state.sessions[sessionId];
    if (!existing) return {};
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: { ...existing, actions: [...existing.actions, a].slice(-40) },
      },
    };
  }),

  setCursor: (sessionId, x, y) => set((state) => {
    const existing = state.sessions[sessionId];
    if (!existing) return {};
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: { ...existing, cursor: { x, y } },
      },
    };
  }),

  setStatus: (sessionId, status) => set((state) => {
    const existing = state.sessions[sessionId];
    if (!existing) return {};
    return {
      sessions: { ...state.sessions, [sessionId]: { ...existing, status } },
    };
  }),

  remove: (sessionId) => set((state) => {
    const next = { ...state.sessions };
    delete next[sessionId];
    return { sessions: next };
  }),
}));

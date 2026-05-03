// Live store for agent-to-agent consultations on the current thread.
//
// Keeps the small number of recent consultations in memory so the
// agent-dialogue drawer can show the back-and-forth as it happens.
// Hydrated by `useAgentConsultRealtime` for the active thread; updates
// flow in via the agent_consultations realtime publication.

import { create } from 'zustand';

export type ConsultStatus = 'pending' | 'completed' | 'failed' | string;

export interface AgentConsultation {
  id: string;
  parent_thread_id: string | null;
  parent_message_id: string | null;
  from_agent: string;
  to_agent: string;
  question: string;
  response: string | null;
  status: ConsultStatus;
  model_used: string | null;
  tokens_used: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ConsultStoreState {
  byThread: Record<string, AgentConsultation[]>;
  hydrate: (threadId: string, rows: AgentConsultation[]) => void;
  upsert: (row: AgentConsultation) => void;
  clearThread: (threadId: string) => void;
}

const MAX_PER_THREAD = 30;

export const useAgentConsultStore = create<ConsultStoreState>((set) => ({
  byThread: {},

  hydrate: (threadId, rows) =>
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: rows.slice(0, MAX_PER_THREAD) },
    })),

  upsert: (row) =>
    set((state) => {
      const threadKey = row.parent_thread_id;
      if (!threadKey) return {};
      const existing = state.byThread[threadKey] ?? [];
      const idx = existing.findIndex((r) => r.id === row.id);
      let next: AgentConsultation[];
      if (idx >= 0) {
        next = existing.slice();
        next[idx] = { ...existing[idx], ...row };
      } else {
        next = [row, ...existing].slice(0, MAX_PER_THREAD);
      }
      return { byThread: { ...state.byThread, [threadKey]: next } };
    }),

  clearThread: (threadId) =>
    set((state) => {
      if (!(threadId in state.byThread)) return {};
      const { [threadId]: _, ...rest } = state.byThread;
      return { byThread: rest };
    }),
}));

/**
 * Stable empty array — returned by `selectByThread` when a thread has no
 * consultations yet. Reusing the same reference avoids the infinite-loop
 * trap where a curried selector allocates `[]` per render and Zustand's
 * useSyncExternalStore detects it as a state change.
 */
const EMPTY_CONSULTS: AgentConsultation[] = Object.freeze([]) as AgentConsultation[];

/**
 * Hook-friendly selector: returns the consultation list for a thread, or
 * a stable empty array. Use with `useAgentConsultStore`:
 *
 *   const list = useAgentConsultStore(selectByThread(threadId));
 *
 * Derive `pending count` etc. in the component with `useMemo` so the
 * subscription stays referentially stable.
 */
export function selectByThread(threadId: string | null | undefined) {
  return (state: ConsultStoreState): AgentConsultation[] => {
    if (!threadId) return EMPTY_CONSULTS;
    return state.byThread[threadId] ?? EMPTY_CONSULTS;
  };
}

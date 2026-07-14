import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type CandidateType = 'pin' | 'standard';
export type CandidateStatus = 'pending' | 'pinned' | 'committed' | 'rejected';

export interface MemoryCandidate {
  id: string;
  user_id: string;
  agent_id: string;
  content: string;
  memory_type: string;
  confidence: number;
  candidate_type: CandidateType;
  rationale: string;
  source: Record<string, unknown> | null;
  status: CandidateStatus;
  reviewed_at: string | null;
  created_at: string;
  content_integrity_status?: 'valid' | 'suspect' | 'rejected';
  content_integrity_reason?: string | null;
  content_hidden_at?: string | null;
}

interface MemoryCandidatesState {
  items: MemoryCandidate[];
  loading: boolean;
  error: string | null;
  load: (userId: string, agentId?: string) => Promise<void>;
  subscribe: (userId: string, agentId?: string) => () => void;
  pin: (id: string) => Promise<void>;
  commit: (id: string) => Promise<void>;
  edit: (id: string, patch: Partial<Pick<MemoryCandidate, 'content' | 'memory_type'>>) => Promise<void>;
  reject: (id: string) => Promise<void>;
}

async function callAction(
  id: string,
  action: 'pin' | 'commit' | 'edit' | 'reject',
  patch?: { content?: string; memory_type?: string },
): Promise<MemoryCandidate | null> {
  const { data, error } = await supabase.functions.invoke('memory-candidate-action', {
    body: { id, action, patch },
  });
  if (error) {
    console.error('[memoryCandidatesStore] action failed', action, error);
    throw error;
  }
  return (data as { candidate?: MemoryCandidate })?.candidate ?? null;
}

export const useMemoryCandidatesStore = create<MemoryCandidatesState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  load: async (userId, agentId = 'luca') => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('memory_candidates')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      items: ((data ?? []) as MemoryCandidate[]).filter((candidate) =>
        !candidate.content_hidden_at && candidate.content_integrity_status !== 'rejected'
      ),
      loading: false,
    });
  },

  subscribe: (userId, agentId = 'luca') => {
    const channel = supabase
      .channel(`memory_candidates:${userId}:${agentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_candidates', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as MemoryCandidate | undefined;
          if (!row) return;
          if ((row.agent_id || 'luca') !== agentId) return;
          if (row.content_hidden_at || row.content_integrity_status === 'rejected') return;
          if (payload.eventType === 'INSERT') {
            if (row.status !== 'pending') return;
            set((s) => ({ items: [row, ...s.items] }));
          } else if (payload.eventType === 'UPDATE') {
            set((s) => {
              const newRow = payload.new as MemoryCandidate;
              // If it left pending state, drop it
              if (newRow.status !== 'pending') {
                return { items: s.items.filter((i) => i.id !== newRow.id) };
              }
              return { items: s.items.map((i) => (i.id === newRow.id ? newRow : i)) };
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as MemoryCandidate;
            set((s) => ({ items: s.items.filter((i) => i.id !== oldRow.id) }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  pin: async (id) => {
    const prev = get().items;
    set({ items: prev.filter((i) => i.id !== id) });
    try {
      await callAction(id, 'pin');
    } catch {
      set({ items: prev });
    }
  },

  commit: async (id) => {
    const prev = get().items;
    set({ items: prev.filter((i) => i.id !== id) });
    try {
      await callAction(id, 'commit');
    } catch {
      set({ items: prev });
    }
  },

  edit: async (id, patch) => {
    try {
      const updated = await callAction(id, 'edit', patch);
      if (updated) {
        set((s) => ({ items: s.items.map((i) => (i.id === id ? updated : i)) }));
      }
    } catch (err) {
      console.error('edit failed', err);
    }
  },

  reject: async (id) => {
    const prev = get().items;
    set({ items: prev.filter((i) => i.id !== id) });
    try {
      await callAction(id, 'reject');
    } catch {
      set({ items: prev });
    }
  },
}));

export function selectPendingCandidatesCount(s: MemoryCandidatesState): number {
  return s.items.length;
}

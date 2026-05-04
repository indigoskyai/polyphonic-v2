import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface HypomnemaEntry {
  id: string;
  user_id: string;
  agent_id: string;
  thread_id: string | null;
  source_message_id: string | null;
  content: string;
  density: 'primary' | 'observer';
  primary_in_thread: boolean;
  domain: string | null;
  tags: string[];
  confidence: number;
  created_at: string;
  last_revised: string;
  last_challenged: string;
  revision_count: number;
  // Server returns Json — narrow to what the UI uses.
  revisions: Array<{
    old_confidence?: number;
    new_confidence?: number;
    reason?: string;
    timestamp?: string;
    challenge_verdict?: string;
  }>;
  active: boolean;
  superseded_by: string | null;
  foundational: boolean;
  active_attention: boolean;
  source: string;
  graduated_to_engram_id: string | null;
}

interface HypomnemaState {
  entries: HypomnemaEntry[];
  loading: boolean;
  load: (userId: string) => Promise<void>;
  forget: (entryId: string) => Promise<void>;
  upsert: (entry: HypomnemaEntry) => void;
  remove: (entryId: string) => void;
  subscribe: (userId: string) => () => void;
}

export const useHypomnemaStore = create<HypomnemaState>((set, get) => ({
  entries: [],
  loading: false,

  load: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('hypomnema_entry')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('last_revised', { ascending: false })
      .limit(500);
    if (!error && data) {
      // Cast through unknown — server returns revisions as Json, runtime is array.
      set({ entries: data as unknown as HypomnemaEntry[], loading: false });
    } else {
      set({ loading: false });
    }
  },

  forget: async (entryId) => {
    // Optimistic remove from UI.
    const prev = get().entries;
    set({ entries: prev.filter((e) => e.id !== entryId) });
    try {
      const { error } = await supabase.functions.invoke('hypomnema-forget', {
        body: { entry_id: entryId },
      });
      if (error) {
        // Revert on failure.
        set({ entries: prev });
        throw error;
      }
    } catch (err) {
      set({ entries: prev });
      throw err;
    }
  },

  upsert: (entry) => {
    const list = get().entries;
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx === -1) {
      if (entry.active) set({ entries: [entry, ...list] });
    } else {
      const next = list.slice();
      if (entry.active) {
        next[idx] = { ...next[idx], ...entry };
        set({ entries: next });
      } else {
        next.splice(idx, 1);
        set({ entries: next });
      }
    }
  },

  remove: (entryId) => set({ entries: get().entries.filter((e) => e.id !== entryId) }),

  subscribe: (userId) => {
    const channel = supabase
      .channel(`hypomnema:${userId}`)
      .on(
        // postgres_changes payload type is loose; we do best-effort narrowing
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'hypomnema_entry',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new?: HypomnemaEntry; old?: { id: string }; eventType?: string }) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            get().remove(payload.old.id);
          } else if (payload.new) {
            get().upsert(payload.new);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
}));

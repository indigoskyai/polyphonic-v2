/**
 * digestStore — Daily Mnemos digest of engrams formed today.
 *
 * The digest is built server-side by `mnemos-digest-build` (cron + on-demand).
 * The user reviews each engram (confirm / reject / edit) via
 * `mnemos-digest-action`. We subscribe to engrams scoped to the current
 * digest_id so review actions stream live.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface DigestRow {
  id: string;
  user_id: string;
  agent_id: string;
  digest_date: string;
  generated_at: string;
  finalized_at: string | null;
  engram_count: number;
  reviewed_count: number;
  status: 'open' | 'finalized' | 'auto_finalized' | 'expired';
  summary: string | null;
}

export interface DigestEngram {
  id: string;
  user_id: string;
  agent_id: string;
  content: string;
  engram_type: string;
  strength: number;
  stability: number;
  surprise_score: number;
  emotional_valence: number;
  emotional_arousal: number;
  tags: string[];
  source_context: Record<string, unknown> | null;
  state: string;
  digest_id: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_decision: string | null;
  digest_suggestion_action: 'keep' | 'release' | 'distill' | null;
  digest_suggestion_reason: string | null;
  digest_suggestion_confidence: number | null;
  digest_suggested_by: string | null;
  digest_suggestion_model: string | null;
  digest_suggestion_generated_at: string | null;
  created_at: string;
  content_integrity_status?: 'valid' | 'suspect' | 'rejected';
  content_integrity_reason?: string | null;
  content_hidden_at?: string | null;
}

interface DigestState {
  digest: DigestRow | null;
  engrams: DigestEngram[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: (userId: string, agentId?: string) => Promise<void>;
  refresh: (agentId?: string) => Promise<void>;
  subscribe: (userId: string, agentId?: string) => () => void;
  confirm: (engramId: string) => Promise<void>;
  reject: (engramId: string) => Promise<void>;
  edit: (engramId: string, patch: { content?: string; tags?: string[] }) => Promise<void>;
  confirmAll: () => Promise<void>;
}

async function callAction(
  engramId: string,
  action: 'confirm' | 'reject' | 'edit',
  patch?: { content?: string; tags?: string[] },
) {
  const { data, error } = await supabase.functions.invoke('mnemos-digest-action', {
    body: { engram_id: engramId, action, patch },
  });
  if (error) throw error;
  return (data as { engram?: DigestEngram })?.engram ?? null;
}

export const useDigestStore = create<DigestState>((set, get) => ({
  digest: null,
  engrams: [],
  loading: false,
  refreshing: false,
  error: null,

  load: async (userId, agentId = 'luca') => {
    set({ loading: true, error: null });
    const today = new Date().toISOString().slice(0, 10);
    let { data: digest } = await supabase
      .from('mnemos_digests')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('digest_date', today)
      .maybeSingle();

    // Build on-demand if no digest yet for today
    if (!digest) {
      try {
        await supabase.functions.invoke('mnemos-digest-build', { body: { agent_id: agentId } });
        const { data: rebuilt } = await supabase
          .from('mnemos_digests')
          .select('*')
          .eq('user_id', userId)
          .eq('agent_id', agentId)
          .eq('digest_date', today)
          .maybeSingle();
        digest = rebuilt;
      } catch (e) {
        console.error('[digestStore] build failed', e);
      }
    }

    if (!digest) {
      set({ digest: null, engrams: [], loading: false });
      return;
    }

    const { data: engrams, error } = await supabase
      .from('engrams')
      .select('*')
      .eq('digest_id', digest.id)
      .eq('agent_id', agentId)
      .order('surprise_score', { ascending: false });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      digest: digest as DigestRow,
      engrams: ((engrams ?? []) as DigestEngram[]).filter(
        (engram) => !engram.content_hidden_at && engram.content_integrity_status !== 'rejected',
      ),
      loading: false,
    });
  },

  refresh: async (agentId) => {
    set({ refreshing: true });
    try {
      const activeAgentId = agentId || get().digest?.agent_id || 'luca';
      await supabase.functions.invoke('mnemos-digest-build', { body: { agent_id: activeAgentId } });
      // Re-load with the same user
      const userId = get().digest?.user_id;
      if (userId) await get().load(userId, activeAgentId);
    } finally {
      set({ refreshing: false });
    }
  },

  subscribe: (userId, agentId = 'luca') => {
    const channel = supabase
      .channel(`digest:${userId}:${agentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engrams', filter: `user_id=eq.${userId}` },
        (payload) => {
          const digestId = get().digest?.id;
          if (!digestId) return;
          const row = (payload.new ?? payload.old) as DigestEngram;
          if (!row || row.digest_id !== digestId) return;
          if ((row.agent_id || 'luca') !== agentId) return;
          if (row.content_hidden_at || row.content_integrity_status === 'rejected') {
            set((s) => ({ engrams: s.engrams.filter((engram) => engram.id !== row.id) }));
            return;
          }
          if (payload.eventType === 'UPDATE') {
            set((s) => ({
              engrams: s.engrams.map((e) => (e.id === row.id ? (payload.new as DigestEngram) : e)),
            }));
          } else if (payload.eventType === 'INSERT') {
            set((s) => ({ engrams: [payload.new as DigestEngram, ...s.engrams] }));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mnemos_digests', filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as DigestRow;
          if ((next.agent_id || 'luca') !== agentId) return;
          if (get().digest?.id === next.id) set({ digest: next });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },

  confirm: async (id) => {
    const prev = get().engrams;
    set({ engrams: prev.map((e) => e.id === id ? { ...e, review_decision: 'confirmed', reviewed_by: 'user', reviewed_at: new Date().toISOString() } : e) });
    try { await callAction(id, 'confirm'); }
    catch { set({ engrams: prev }); }
  },

  reject: async (id) => {
    const prev = get().engrams;
    set({ engrams: prev.map((e) => e.id === id ? { ...e, review_decision: 'rejected', reviewed_by: 'user', reviewed_at: new Date().toISOString() } : e) });
    try { await callAction(id, 'reject'); }
    catch { set({ engrams: prev }); }
  },

  edit: async (id, patch) => {
    try {
      const updated = await callAction(id, 'edit', patch);
      if (updated) set((s) => ({ engrams: s.engrams.map((e) => e.id === id ? updated : e) }));
    } catch (e) { console.error('edit failed', e); }
  },

  confirmAll: async () => {
    const pending = get().engrams.filter((e) => !e.reviewed_at);
    for (const e of pending) await get().confirm(e.id);
  },
}));

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface Handle {
  handle: string;
  owner_kind: 'user' | 'agent';
  owner_user_id: string | null;
  owner_agent_id: string | null;
  reserved: boolean;
  created_at: string;
}

interface HandleState {
  myHandle: Handle | null;
  myAgentHandles: Handle[];
  loading: boolean;
  load: (userId: string) => Promise<void>;
  checkAvailable: (handle: string) => Promise<boolean>;
  claimUserHandle: (handle: string, displayName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  claimAgentHandle: (handle: string, agentId: string, displayName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const HANDLE_RX = /^[a-z0-9_]{3,24}$/;

export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}
export function isValidHandle(h: string): boolean {
  return HANDLE_RX.test(h);
}

export const useHandleStore = create<HandleState>((set, get) => ({
  myHandle: null,
  myAgentHandles: [],
  loading: false,

  load: async (userId) => {
    set({ loading: true });
    const { data } = await (supabase as any)
      .from('handles')
      .select('*')
      .eq('owner_user_id', userId);
    const all = (data || []) as Handle[];
    set({
      myHandle: all.find((h) => h.owner_kind === 'user') || null,
      myAgentHandles: all.filter((h) => h.owner_kind === 'agent'),
      loading: false,
    });
  },

  checkAvailable: async (handle) => {
    const norm = normalizeHandle(handle);
    if (!isValidHandle(norm)) return false;
    const { data } = await (supabase as any)
      .from('handles')
      .select('handle')
      .eq('handle', norm)
      .maybeSingle();
    return !data;
  },

  claimUserHandle: async (handle, displayName) => {
    const norm = normalizeHandle(handle);
    if (!isValidHandle(norm)) return { ok: false, error: 'Handle must be 3–24 chars, a–z 0–9 _' };
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp.user?.id;
    if (!userId) return { ok: false, error: 'Not authenticated' };

    const { error: hErr } = await (supabase as any).from('handles').insert({
      handle: norm,
      owner_kind: 'user',
      owner_user_id: userId,
    });
    if (hErr) return { ok: false, error: hErr.message };

    const { error: pErr } = await (supabase as any).from('profiles_public').insert({
      handle: norm,
      display_name: displayName || norm,
    });
    if (pErr) return { ok: false, error: pErr.message };

    await get().load(userId);
    return { ok: true };
  },

  claimAgentHandle: async (handle, agentId, displayName) => {
    const norm = normalizeHandle(handle);
    if (!isValidHandle(norm)) return { ok: false, error: 'Handle must be 3–24 chars, a–z 0–9 _' };
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp.user?.id;
    if (!userId) return { ok: false, error: 'Not authenticated' };

    const { error: hErr } = await (supabase as any).from('handles').insert({
      handle: norm,
      owner_kind: 'agent',
      owner_user_id: userId,
      owner_agent_id: agentId,
    });
    if (hErr) return { ok: false, error: hErr.message };

    const { error: pErr } = await (supabase as any).from('profiles_public').insert({
      handle: norm,
      display_name: displayName || norm,
    });
    if (pErr) return { ok: false, error: pErr.message };

    await get().load(userId);
    return { ok: true };
  },
}));

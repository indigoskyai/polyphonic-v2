import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type ItemType = 'artifact' | 'upload' | 'note';

export interface ProfileItem {
  id: string;
  handle: string;
  item_type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  payload: Record<string, any>;
  caption: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfilePublic {
  handle: string;
  display_name: string;
  bio_short: string;
  bio_long: string;
  accent_color: string;
  avatar_storage_path: string | null;
  home_viewport: { x: number; y: number; zoom: number };
  theme: Record<string, any>;
  published: boolean;
  updated_at: string;
}

interface State {
  profile: ProfilePublic | null;
  items: ProfileItem[];
  loading: boolean;
  selectedId: string | null;

  loadByHandle: (handle: string) => Promise<void>;
  setSelected: (id: string | null) => void;

  // optimistic CRUD
  patchItem: (id: string, patch: Partial<ProfileItem>) => void;
  persistItem: (id: string, patch: Partial<ProfileItem>) => Promise<void>;
  addItem: (item: Omit<ProfileItem, 'id' | 'created_at' | 'updated_at' | 'handle'>) => Promise<ProfileItem | null>;
  removeItem: (id: string) => Promise<void>;
  bringForward: (id: string) => Promise<void>;

  updateProfile: (patch: Partial<ProfilePublic>) => Promise<void>;
}

export const useProfileCanvasStore = create<State>((set, get) => ({
  profile: null,
  items: [],
  loading: false,
  selectedId: null,

  loadByHandle: async (handle) => {
    set({ loading: true, profile: null, items: [] });
    const [{ data: profile }, { data: items }] = await Promise.all([
      (supabase as any).from('profiles_public').select('*').eq('handle', handle).maybeSingle(),
      (supabase as any).from('profile_items').select('*').eq('handle', handle).order('z', { ascending: true }),
    ]);
    set({
      profile: (profile as ProfilePublic | null) || null,
      items: ((items as ProfileItem[] | null) || []),
      loading: false,
    });
  },

  setSelected: (id) => set({ selectedId: id }),

  patchItem: (id, patch) => set((s) => ({
    items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
  })),

  persistItem: async (id, patch) => {
    get().patchItem(id, patch);
    await (supabase as any).from('profile_items').update(patch).eq('id', id);
  },

  addItem: async (input) => {
    const handle = get().profile?.handle;
    if (!handle) return null;
    const row = { ...input, handle };
    const { data } = await (supabase as any).from('profile_items').insert(row).select('*').single();
    if (data) {
      set((s) => ({ items: [...s.items, data as ProfileItem], selectedId: (data as ProfileItem).id }));
      return data as ProfileItem;
    }
    return null;
  },

  removeItem: async (id) => {
    set((s) => ({ items: s.items.filter((it) => it.id !== id), selectedId: s.selectedId === id ? null : s.selectedId }));
    await (supabase as any).from('profile_items').delete().eq('id', id);
  },

  bringForward: async (id) => {
    const items = get().items;
    const maxZ = items.reduce((m, it) => Math.max(m, it.z), 0);
    await get().persistItem(id, { z: maxZ + 1 });
  },

  updateProfile: async (patch) => {
    const cur = get().profile;
    if (!cur) return;
    const next = { ...cur, ...patch };
    set({ profile: next });
    await (supabase as any).from('profiles_public').update(patch).eq('handle', cur.handle);
  },
}));

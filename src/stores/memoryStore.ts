import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface Engram {
  id: string;
  user_id: string;
  content: string;
  engram_type: 'episodic' | 'semantic' | 'procedural' | 'belief';
  strength: number;
  stability: number;
  accessibility: number;
  emotional_valence: number;
  emotional_arousal: number;
  surprise_score: number;
  source_context: Record<string, unknown>;
  tags: string[];
  state: 'active' | 'consolidating' | 'dormant' | 'archived';
  last_accessed_at: string;
  access_count: number;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  connection_type: string;
  weight: number;
  created_at: string;
}

export interface Belief {
  id: string;
  user_id: string;
  content: string;
  confidence: number;
  confidence_tier?: string;
  supporting_engram_ids: string[];
  contradicting_engram_ids: string[];
  tags?: string[];
  domain?: string;
  created_at: string;
  updated_at?: string;
}

interface MemoryFilters {
  engram_type: string | null;
  state: string | null;
  sort: 'recency' | 'strength' | 'stability' | 'access_count';
  search: string;
}

interface MemoryState {
  engrams: Engram[];
  connections: Connection[];
  beliefs: Belief[];
  selectedEngram: Engram | null;
  filters: MemoryFilters;
  loading: boolean;
  setSelectedEngram: (engram: Engram | null) => void;
  setFilters: (filters: Partial<MemoryFilters>) => void;
  loadEngrams: (userId: string) => Promise<void>;
  loadConnections: (userId: string) => Promise<void>;
  loadBeliefs: (userId: string) => Promise<void>;
  loadAll: (userId: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  engrams: [],
  connections: [],
  beliefs: [],
  selectedEngram: null,
  loading: false,
  filters: { engram_type: null, state: null, sort: 'recency', search: '' },

  setSelectedEngram: (engram) => set({ selectedEngram: engram }),
  setFilters: (partial) => set({ filters: { ...get().filters, ...partial } }),

  loadEngrams: async (userId) => {
    const { data, error } = await supabase
      .from('engrams')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error && data) set({ engrams: data as Engram[] });
  },

  loadConnections: async (userId) => {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', userId)
      .limit(2000);
    if (!error && data) set({ connections: data as Connection[] });
  },

  loadBeliefs: async (userId) => {
    const { data, error } = await supabase
      .from('beliefs')
      .select('*')
      .eq('user_id', userId)
      .order('confidence', { ascending: false });
    if (!error && data) set({ beliefs: data as Belief[] });
  },

  loadAll: async (userId) => {
    set({ loading: true });
    await Promise.all([
      get().loadEngrams(userId),
      get().loadConnections(userId),
      get().loadBeliefs(userId),
    ]);
    set({ loading: false });
  },
}));

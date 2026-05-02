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

export interface Memory {
  id: string;
  content: string;
  memory_type: string;
  confidence: number;
  confidence_source: string | null;
  emotional_valence: number | null;
  emotional_intensity: number | null;
  detail_level: string | null;
  narrative_thread: string | null;
  tags: string[] | null;
  summary: string | null;
  staleness_risk: string | null;
  estimated_date: string | null;
  needs_confirmation: boolean | null;
  is_deleted: boolean | null;
  is_pinned?: boolean | null;
  created_at: string;
  updated_at: string;
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
  memories: Memory[];
  selectedEngram: Engram | null;
  filters: MemoryFilters;
  loading: boolean;
  setSelectedEngram: (engram: Engram | null) => void;
  setFilters: (filters: Partial<MemoryFilters>) => void;
  setMemories: (memories: Memory[]) => void;
  loadEngrams: (userId: string) => Promise<void>;
  loadConnections: (userId: string) => Promise<void>;
  loadBeliefs: (userId: string) => Promise<void>;
  loadMemories: (userId: string) => Promise<void>;
  loadAll: (userId: string) => Promise<void>;
  upsertEngram: (e: Engram) => void;
  removeEngram: (id: string) => void;
  upsertConnection: (c: Connection) => void;
  removeConnection: (id: string) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  engrams: [],
  connections: [],
  beliefs: [],
  memories: [],
  selectedEngram: null,
  loading: false,
  filters: { engram_type: null, state: null, sort: 'recency', search: '' },

  setSelectedEngram: (engram) => set({ selectedEngram: engram }),
  setFilters: (partial) => set({ filters: { ...get().filters, ...partial } }),
  setMemories: (memories) => set({ memories }),

  loadMemories: async (userId) => {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!error && data) set({ memories: data as Memory[] });
  },

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

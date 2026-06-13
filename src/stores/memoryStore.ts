import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

const ENGRAM_STATES = ['active', 'consolidating', 'dormant', 'archived'] as const;
const ENGRAM_TYPES = ['episodic', 'semantic', 'procedural', 'belief'] as const;

type MemoryLoadLayer = 'memories' | 'engrams' | 'connections' | 'beliefs';

export const ENGRAM_UI_SELECT = [
  'id',
  'user_id',
  'agent_id',
  'content',
  'engram_type',
  'strength',
  'stability',
  'accessibility',
  'emotional_valence',
  'emotional_arousal',
  'surprise_score',
  'source_context',
  'tags',
  'state',
  'last_accessed_at',
  'access_count',
  'created_at',
  'updated_at',
].join(',');

export interface Engram {
  id: string;
  user_id: string;
  agent_id: string;
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
  agent_id: string;
  source_id: string;
  target_id: string;
  connection_type: string;
  weight: number;
  created_at: string;
}

export interface Belief {
  id: string;
  user_id: string;
  agent_id: string;
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
  loadErrors: Partial<Record<MemoryLoadLayer, string>>;
  setSelectedEngram: (engram: Engram | null) => void;
  setFilters: (filters: Partial<MemoryFilters>) => void;
  setMemories: (memories: Memory[]) => void;
  clearLoadErrors: () => void;
  loadEngrams: (userId: string, agentId?: string) => Promise<void>;
  loadConnections: (userId: string, agentId?: string) => Promise<void>;
  loadBeliefs: (userId: string, agentId?: string) => Promise<void>;
  loadMemories: (userId: string, agentId?: string) => Promise<void>;
  loadAll: (userId: string, agentId?: string) => Promise<void>;
  upsertEngram: (e: Engram) => void;
  removeEngram: (id: string) => void;
  upsertConnection: (c: Connection) => void;
  removeConnection: (id: string) => void;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function tagsOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function isEngramState(value: unknown): value is Engram['state'] {
  return typeof value === 'string' && (ENGRAM_STATES as readonly string[]).includes(value);
}

function isEngramType(value: unknown): value is Engram['engram_type'] {
  return typeof value === 'string' && (ENGRAM_TYPES as readonly string[]).includes(value);
}

export function normalizeEngramRow(row: Record<string, unknown>): Engram {
  const now = new Date().toISOString();

  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    agent_id: String(row.agent_id ?? 'luca'),
    content: String(row.content ?? ''),
    engram_type: isEngramType(row.engram_type) ? row.engram_type : 'episodic',
    strength: numberOr(row.strength, 0),
    stability: numberOr(row.stability, 0),
    accessibility: numberOr(row.accessibility, 0),
    emotional_valence: numberOr(row.emotional_valence, 0),
    emotional_arousal: numberOr(row.emotional_arousal, 0),
    surprise_score: numberOr(row.surprise_score, 0),
    source_context: (row.source_context && typeof row.source_context === 'object' && !Array.isArray(row.source_context))
      ? row.source_context as Record<string, unknown>
      : {},
    tags: tagsOrEmpty(row.tags),
    state: isEngramState(row.state) ? row.state : 'active',
    last_accessed_at: stringOr(row.last_accessed_at, stringOr(row.created_at, now)),
    access_count: numberOr(row.access_count, 0),
    created_at: stringOr(row.created_at, now),
    updated_at: stringOr(row.updated_at, stringOr(row.created_at, now)),
  };
}

function formatLoadError(error: { message?: string; code?: string; details?: string; hint?: string } | null): string {
  if (!error) return 'Unknown load failure.';
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(' ');
}

export const useMemoryStore = create<MemoryState>((set, get) => {
  const setLoadError = (layer: MemoryLoadLayer, error: { message?: string; code?: string; details?: string; hint?: string } | null) => {
    const message = formatLoadError(error);
    console.warn(`[memoryStore] ${layer} load failed: ${message}`);
    set((state) => ({ loadErrors: { ...state.loadErrors, [layer]: message } }));
  };

  const clearLoadError = (layer: MemoryLoadLayer) => {
    set((state) => {
      if (!state.loadErrors[layer]) return {};
      const next = { ...state.loadErrors };
      delete next[layer];
      return { loadErrors: next };
    });
  };

  return ({
  engrams: [],
  connections: [],
  beliefs: [],
  memories: [],
  selectedEngram: null,
  loading: false,
  loadErrors: {},
  filters: { engram_type: null, state: null, sort: 'recency', search: '' },

  setSelectedEngram: (engram) => set({ selectedEngram: engram }),
  setFilters: (partial) => set({ filters: { ...get().filters, ...partial } }),
  setMemories: (memories) => set({ memories }),
  clearLoadErrors: () => set({ loadErrors: {} }),

  loadMemories: async (userId, agentId = 'luca') => {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) {
      setLoadError('memories', error);
      return;
    }
    clearLoadError('memories');
    set({ memories: (data ?? []) as Memory[] });
  },

  loadEngrams: async (userId, agentId = 'luca') => {
    const { data, error } = await supabase
      .from('engrams')
      .select(ENGRAM_UI_SELECT)
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      setLoadError('engrams', error);
      return;
    }
    clearLoadError('engrams');
    set({ engrams: ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => normalizeEngramRow(row)) });
  },

  loadConnections: async (userId, agentId = 'luca') => {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .limit(2000);
    if (error) {
      setLoadError('connections', error);
      return;
    }
    clearLoadError('connections');
    set({ connections: (data ?? []) as Connection[] });
  },

  loadBeliefs: async (userId, agentId = 'luca') => {
    const { data, error } = await supabase
      .from('beliefs')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('confidence', { ascending: false })
      .limit(1000);
    if (error) {
      setLoadError('beliefs', error);
      return;
    }
    clearLoadError('beliefs');
    set({ beliefs: (data ?? []) as Belief[] });
  },

  loadAll: async (userId, agentId = 'luca') => {
    set({ loading: true });
    try {
      await Promise.all([
        get().loadMemories(userId, agentId),
        get().loadEngrams(userId, agentId),
        get().loadConnections(userId, agentId),
        get().loadBeliefs(userId, agentId),
      ]);
    } finally {
      set({ loading: false });
    }
  },

  upsertEngram: (e) => {
    const list = get().engrams;
    const i = list.findIndex((x) => x.id === e.id);
    if (i === -1) set({ engrams: [e, ...list] });
    else {
      const next = list.slice();
      next[i] = { ...next[i], ...e };
      set({ engrams: next });
    }
  },
  removeEngram: (id) => set({ engrams: get().engrams.filter((e) => e.id !== id) }),
  upsertConnection: (c) => {
    const list = get().connections;
    const i = list.findIndex((x) => x.id === c.id);
    if (i === -1) set({ connections: [c, ...list] });
    else {
      const next = list.slice();
      next[i] = { ...next[i], ...c };
      set({ connections: next });
    }
  },
  removeConnection: (id) => set({ connections: get().connections.filter((c) => c.id !== id) }),
  });
});

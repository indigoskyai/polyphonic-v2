import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface Modulators {
  arousal: number;
  resolution: number;
  openness: number;
  surprise_threshold: number;
  social_drive: number;
}

interface Emotions {
  valence: number;
  arousal: number;
  dominance: number;
  certainty: number;
  novelty: number;
  social: number;
}

interface Belief {
  text: string;
  strength: number;
}

interface Thought {
  id: string;
  type: string;
  content: string;
  trigger: string | null;
  salience: number;
  source: string;
  created_at: string;
}

interface MemoryEvent {
  id: string;
  type: string;
  content: string;
  salience: number;
  created_at: string;
}

interface MemoryStats {
  total_engrams: number;
  active: number;
  dormant: number;
  archived: number;
  connections: number;
  beliefs_count: number;
}

interface MindEngram {
  id: string;
  content: string;
  engram_type: string;
  strength: number;
  tags: string[];
  source_context: Record<string, unknown>;
  created_at: string;
}

interface CognitiveState {
  modulators: Modulators;
  emotions: Emotions;
  beliefs: Belief[];
  thoughts: Thought[];
  recentEvents: MemoryEvent[];
  dreams: MindEngram[];
  insights: MindEngram[];
  reflections: MindEngram[];
  wanderings: Thought[];
  memoryStats: MemoryStats;
  loaded: boolean;
  load: (userId: string) => Promise<void>;
  loadMindData: (userId: string) => Promise<void>;
  subscribe: (userId: string) => () => void;
}

const defaultModulators: Modulators = {
  arousal: 0.5,
  resolution: 0.5,
  openness: 0.5,
  surprise_threshold: 0.5,
  social_drive: 0.5,
};

const defaultEmotions: Emotions = {
  valence: 0,
  arousal: 0.3,
  dominance: 0.5,
  certainty: 0.5,
  novelty: 0.5,
  social: 0.5,
};

export const useCognitiveStore = create<CognitiveState>((set) => ({
  modulators: defaultModulators,
  emotions: defaultEmotions,
  beliefs: [],
  thoughts: [],
  recentEvents: [],
  dreams: [],
  insights: [],
  reflections: [],
  wanderings: [],
  memoryStats: { total_engrams: 0, active: 0, dormant: 0, archived: 0, connections: 0, beliefs_count: 0 },
  loaded: false,

  load: async (userId: string) => {
    const [cogRes, thoughtsRes, eventsRes] = await Promise.all([
      supabase.from('cognitive_state').select('*').eq('user_id', userId).single(),
      supabase.from('thought_stream').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('memory_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    ]);

    const cog = cogRes.data;
    const mods = cog?.modulators as Record<string, number> | null;
    const emos = cog?.emotions as Record<string, number> | null;
    const beliefs = (cog?.beliefs as Belief[] | null) ?? [];

    set({
      modulators: mods ? { ...defaultModulators, ...mods } : defaultModulators,
      emotions: emos ? { ...defaultEmotions, ...emos } : defaultEmotions,
      beliefs,
      thoughts: (thoughtsRes.data ?? []) as Thought[],
      recentEvents: (eventsRes.data ?? []) as MemoryEvent[],
      loaded: true,
    });
  },

  loadMindData: async (userId: string) => {
    // Load dreams (engrams with dream tags or source_context type)
    const dreamsPromise = supabase
      .from('engrams')
      .select('id, content, engram_type, strength, tags, source_context, created_at')
      .eq('user_id', userId)
      .or('tags.cs.{dream},tags.cs.{consolidation}')
      .order('created_at', { ascending: false })
      .limit(50);

    // Load insights
    const insightsPromise = supabase
      .from('engrams')
      .select('id, content, engram_type, strength, tags, source_context, created_at')
      .eq('user_id', userId)
      .contains('tags', ['insight'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Load reflections
    const reflectionsPromise = supabase
      .from('engrams')
      .select('id, content, engram_type, strength, tags, source_context, created_at')
      .eq('user_id', userId)
      .contains('tags', ['reflection'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Load wanderings (thoughts with type 'wandering' or 'musing')
    const wanderingsPromise = supabase
      .from('thought_stream')
      .select('*')
      .eq('user_id', userId)
      .in('type', ['wandering', 'musing', 'observation'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Memory stats
    const statsPromises = [
      supabase.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('state', 'active'),
      supabase.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('state', 'dormant'),
      supabase.from('engram_archive').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('beliefs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ];

    const [dreamsRes, insightsRes, reflectionsRes, wanderingsRes, ...statsRes] = await Promise.all([
      dreamsPromise, insightsPromise, reflectionsPromise, wanderingsPromise, ...statsPromises,
    ]);

    set({
      dreams: (dreamsRes.data ?? []) as MindEngram[],
      insights: (insightsRes.data ?? []) as MindEngram[],
      reflections: (reflectionsRes.data ?? []) as MindEngram[],
      wanderings: (wanderingsRes.data ?? []) as Thought[],
      memoryStats: {
        total_engrams: statsRes[0].count ?? 0,
        active: statsRes[1].count ?? 0,
        dormant: statsRes[2].count ?? 0,
        archived: statsRes[3].count ?? 0,
        connections: statsRes[4].count ?? 0,
        beliefs_count: statsRes[5].count ?? 0,
      },
    });
  },

  subscribe: (userId: string) => {
    const cogChannel = supabase
      .channel('cognitive-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cognitive_state', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as any;
        if (row) {
          const mods = row.modulators as Record<string, number> | null;
          const emos = row.emotions as Record<string, number> | null;
          const beliefs = (row.beliefs as Belief[] | null) ?? [];
          set({
            modulators: mods ? { ...defaultModulators, ...mods } : defaultModulators,
            emotions: emos ? { ...defaultEmotions, ...emos } : defaultEmotions,
            beliefs,
          });
        }
      })
      .subscribe();

    const thoughtChannel = supabase
      .channel('thought-stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thought_stream', filter: `user_id=eq.${userId}` }, (payload) => {
        const newThought = payload.new as Thought;
        set((s) => ({ thoughts: [newThought, ...s.thoughts].slice(0, 100) }));
      })
      .subscribe();

    const eventChannel = supabase
      .channel('memory-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memory_events', filter: `user_id=eq.${userId}` }, (payload) => {
        const newEvent = payload.new as MemoryEvent;
        set((s) => ({ recentEvents: [newEvent, ...s.recentEvents].slice(0, 50) }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(cogChannel);
      supabase.removeChannel(thoughtChannel);
      supabase.removeChannel(eventChannel);
    };
  },
}));

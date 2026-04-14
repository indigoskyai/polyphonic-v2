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

interface CognitiveState {
  modulators: Modulators;
  emotions: Emotions;
  beliefs: Belief[];
  thoughts: Thought[];
  recentEvents: MemoryEvent[];
  loaded: boolean;
  load: (userId: string) => Promise<void>;
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

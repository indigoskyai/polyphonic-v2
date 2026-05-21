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
  agent_id?: string;
  type: string;
  content: string;
  trigger: string | null;
  salience: number;
  source: string;
  created_at: string;
}

interface MemoryEvent {
  id: string;
  agent_id?: string;
  type: string;
  content: string;
  salience: number;
  created_at: string;
}

interface ActivityEntry {
  id: string;
  agent_id?: string;
  activity_type: string;
  title: string | null;
  summary: string | null;
  content: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

interface EmotionalWeather {
  curiosity: number;
  restlessness: number;
  warmth: number;
  clarity: number;
  creative_flow: number;
  isolation: number;
  mood_summary: string | null;
  updated_at: string | null;
}

interface MemoryStats {
  total_engrams: number;
  active: number;
  dormant: number;
  archived: number;
  connections: number;
  beliefs_count: number;
}

interface JournalEntry {
  id: string;
  agent_id?: string;
  content: string;
  mood: string | null;
  trigger_type: string | null;
  created_at: string;
}

interface MindEngram {
  id: string;
  agent_id?: string;
  content: string;
  engram_type: string;
  strength: number;
  stability?: number | null;
  accessibility?: number | null;
  emotional_arousal?: number | null;
  emotional_valence?: number | null;
  access_count?: number | null;
  surprise_score?: number | null;
  state?: string | null;
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
  activityLog: ActivityEntry[];
  emotionalWeather: EmotionalWeather | null;
  dreams: MindEngram[];
  insights: MindEngram[];
  reflections: MindEngram[];
  wanderings: Thought[];
  journalEntries: JournalEntry[];
  memoryStats: MemoryStats;
  loaded: boolean;
  /** Set of thought IDs that arrived via realtime (so the UI can animate them in then clear the flag). */
  newThoughtIds: Set<string>;
  clearNewThoughtFlag: (id: string) => void;
  load: (userId: string, agentId?: string) => Promise<void>;
  loadMindData: (userId: string, agentId?: string) => Promise<void>;
  subscribe: (userId: string, agentId?: string) => () => void;
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

function rowMatchesAgent(row: { agent_id?: string | null } | null | undefined, agentId: string): boolean {
  return (row?.agent_id || 'luca') === agentId;
}

export const useCognitiveStore = create<CognitiveState>((set) => ({
  modulators: defaultModulators,
  emotions: defaultEmotions,
  beliefs: [],
  thoughts: [],
  recentEvents: [],
  activityLog: [],
  emotionalWeather: null,
  newThoughtIds: new Set<string>(),
  clearNewThoughtFlag: (id: string) => set((s) => {
    if (!s.newThoughtIds.has(id)) return {};
    const next = new Set(s.newThoughtIds);
    next.delete(id);
    return { newThoughtIds: next };
  }),
  dreams: [],
  insights: [],
  reflections: [],
  wanderings: [],
  journalEntries: [],
  memoryStats: { total_engrams: 0, active: 0, dormant: 0, archived: 0, connections: 0, beliefs_count: 0 },
  loaded: false,

  load: async (userId: string, agentId = 'luca') => {
    const settled = await Promise.allSettled([
      supabase.from('cognitive_state').select('*').eq('user_id', userId).eq('agent_id', agentId).maybeSingle(),
      supabase.from('thought_stream').select('*').eq('user_id', userId).eq('agent_id', agentId).order('created_at', { ascending: false }).limit(50),
      supabase.from('memory_events').select('*').eq('user_id', userId).eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20),
      supabase.from('entity_activity_log').select('id, agent_id, activity_type, title, summary, content, source, created_at').eq('user_id', userId).eq('agent_id', agentId).order('created_at', { ascending: false }).limit(40),
      supabase.from('emotional_state').select('*').eq('user_id', userId).eq('agent_id', agentId).maybeSingle(),
    ]);
    const cogRes = settled[0].status === 'fulfilled' ? settled[0].value : { data: null };
    const thoughtsRes = settled[1].status === 'fulfilled' ? settled[1].value : { data: [] };
    const eventsRes = settled[2].status === 'fulfilled' ? settled[2].value : { data: [] };
    const activityRes = settled[3].status === 'fulfilled' ? settled[3].value : { data: [] };
    const weatherRes = settled[4].status === 'fulfilled' ? settled[4].value : { data: null };

    const cog = cogRes.data;
    const mods = cog?.modulators as Record<string, number> | null;
    const emos = cog?.emotions as Record<string, number> | null;
    const w = weatherRes.data as EmotionalWeather | null;

    // Beliefs are sourced from the beliefs table in loadMindData — don't set them here to avoid races.
    set({
      modulators: mods ? { ...defaultModulators, ...mods } : defaultModulators,
      emotions: emos ? { ...defaultEmotions, ...emos } : defaultEmotions,
      thoughts: (thoughtsRes.data ?? []) as Thought[],
      recentEvents: (eventsRes.data ?? []) as MemoryEvent[],
      activityLog: (activityRes.data ?? []) as ActivityEntry[],
      emotionalWeather: w ?? null,
      loaded: true,
    });
  },

  loadMindData: async (userId: string, agentId = 'luca') => {
    // Load dreams (engrams with dream tags or source_context type)
    const dreamsPromise = supabase
      .from('engrams')
      .select('id, agent_id, content, engram_type, strength, stability, accessibility, emotional_arousal, emotional_valence, access_count, surprise_score, state, tags, source_context, created_at')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .or('tags.cs.{dream},tags.cs.{consolidation}')
      .order('created_at', { ascending: false })
      .limit(50);

    // Load insights
    const insightsPromise = supabase
      .from('engrams')
      .select('id, agent_id, content, engram_type, strength, stability, accessibility, emotional_arousal, emotional_valence, access_count, surprise_score, state, tags, source_context, created_at')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .contains('tags', ['insight'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Load reflections
    const reflectionsPromise = supabase
      .from('engrams')
      .select('id, agent_id, content, engram_type, strength, stability, accessibility, emotional_arousal, emotional_valence, access_count, surprise_score, state, tags, source_context, created_at')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .contains('tags', ['reflection'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Load wanderings (thoughts with type 'wandering' or 'musing')
    const wanderingsPromise = supabase
      .from('thought_stream')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .in('type', ['wandering', 'musing', 'observation'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Load journal entries
    const journalPromise = supabase
      .from('journal_entries')
      .select('id, agent_id, content, mood, trigger_type, created_at')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Load beliefs from the beliefs table (the Overview Belief card was reading a stale JSONB column).
    const beliefsTablePromise = supabase
      .from('beliefs')
      .select('id, content, confidence, domain, active')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('active', true)
      .order('confidence', { ascending: false })
      .limit(20);

    // Memory stats
    const statsPromises = [
      supabase.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('agent_id', agentId),
      supabase.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('agent_id', agentId).eq('state', 'active'),
      supabase.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('agent_id', agentId).eq('state', 'dormant'),
      supabase.from('engram_archive').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('agent_id', agentId),
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('agent_id', agentId),
      supabase.from('beliefs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('agent_id', agentId),
    ];

    // Use allSettled so a single failure (e.g. missing journal_entries table) doesn't nuke all mind data.
    const results = await Promise.allSettled([
      dreamsPromise, insightsPromise, reflectionsPromise, wanderingsPromise, journalPromise, beliefsTablePromise, ...statsPromises,
    ]);
    const pick = <T,>(i: number): { data?: T[]; count?: number } => {
      const r = results[i];
      if (r.status === 'fulfilled') return r.value as { data?: T[]; count?: number };
      return {};
    };
    const dreamsRes = pick<MindEngram>(0);
    const insightsRes = pick<MindEngram>(1);
    const reflectionsRes = pick<MindEngram>(2);
    const wanderingsRes = pick<Thought>(3);
    const journalRes = pick<JournalEntry>(4);
    const beliefsTableRes = pick<{ content: string; confidence: number }>(5);

    const beliefsFromTable: Belief[] = (beliefsTableRes.data ?? []).map((b) => ({
      text: b.content,
      strength: b.confidence,
    }));

    set({
      dreams: (dreamsRes.data ?? []) as MindEngram[],
      insights: (insightsRes.data ?? []) as MindEngram[],
      reflections: (reflectionsRes.data ?? []) as MindEngram[],
      wanderings: (wanderingsRes.data ?? []) as Thought[],
      journalEntries: (journalRes.data ?? []) as JournalEntry[],
      // Prefer beliefs from the table (live, authoritative) over whatever stale JSONB was in cognitive_state.
      ...(beliefsFromTable.length > 0 ? { beliefs: beliefsFromTable } : {}),
      memoryStats: {
        total_engrams: pick(6).count ?? 0,
        active: pick(7).count ?? 0,
        dormant: pick(8).count ?? 0,
        archived: pick(9).count ?? 0,
        connections: pick(10).count ?? 0,
        beliefs_count: pick(11).count ?? 0,
      },
    });
  },

  subscribe: (userId: string, agentId = 'luca') => {
    const cogChannel = supabase
      .channel(`cognitive-state:${userId}:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cognitive_state', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as any;
        if (!rowMatchesAgent(row, agentId)) return;
        if (row) {
          const mods = row.modulators as Record<string, number> | null;
          const emos = row.emotions as Record<string, number> | null;
          // Only update modulators/emotions here — beliefs come from the beliefs table (see loadMindData),
          // not from the cognitive_state JSONB column, which has gone stale in this project.
          set({
            modulators: mods ? { ...defaultModulators, ...mods } : defaultModulators,
            emotions: emos ? { ...defaultEmotions, ...emos } : defaultEmotions,
          });
        }
      })
      .subscribe();

    const thoughtChannel = supabase
      .channel(`thought-stream:${userId}:${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thought_stream', filter: `user_id=eq.${userId}` }, (payload) => {
        const newThought = payload.new as Thought;
        if (!rowMatchesAgent(newThought, agentId)) return;
        set((s) => {
          const flagged = new Set(s.newThoughtIds);
          flagged.add(newThought.id);
          return {
            thoughts: [newThought, ...s.thoughts].slice(0, 100),
            newThoughtIds: flagged,
          };
        });
      })
      .subscribe();

    const eventChannel = supabase
      .channel(`memory-events:${userId}:${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memory_events', filter: `user_id=eq.${userId}` }, (payload) => {
        const newEvent = payload.new as MemoryEvent;
        if (!rowMatchesAgent(newEvent, agentId)) return;
        set((s) => ({ recentEvents: [newEvent, ...s.recentEvents].slice(0, 50) }));
      })
      .subscribe();

    const activityChannel = supabase
      .channel(`entity-activity-log:${userId}:${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entity_activity_log', filter: `user_id=eq.${userId}` }, (payload) => {
        const entry = payload.new as ActivityEntry;
        if (!rowMatchesAgent(entry, agentId)) return;
        set((s) => ({ activityLog: [entry, ...s.activityLog].slice(0, 40) }));
      })
      .subscribe();

    const weatherChannel = supabase
      .channel(`emotional-state:${userId}:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emotional_state', filter: `user_id=eq.${userId}` }, (payload) => {
        const w = payload.new as EmotionalWeather;
        if (!rowMatchesAgent(w as EmotionalWeather & { agent_id?: string }, agentId)) return;
        if (w) set({ emotionalWeather: w });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(cogChannel);
      supabase.removeChannel(thoughtChannel);
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(activityChannel);
      supabase.removeChannel(weatherChannel);
    };
  },
}));

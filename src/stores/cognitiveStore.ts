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

export interface Belief {
  id?: string;
  text: string;
  strength: number;
  domain?: string | null;
  confidence_tier?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Thought {
  id: string;
  agent_id?: string;
  type: string;
  content: string;
  trigger: string | null;
  salience: number;
  source: string;
  created_at: string;
}

export interface MemoryEvent {
  id: string;
  agent_id?: string;
  type: string;
  content: string;
  salience: number;
  created_at: string;
}

export interface ActivityEntry {
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

export interface JournalEntry {
  id: string;
  agent_id?: string;
  content: string;
  mood: string | null;
  trigger_type: string | null;
  created_at: string;
}

export interface MindEngram {
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
  scope: { userId: string; agentId: string } | null;
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

const emptyScopedState = {
  modulators: defaultModulators,
  emotions: defaultEmotions,
  beliefs: [] as Belief[],
  thoughts: [] as Thought[],
  recentEvents: [] as MemoryEvent[],
  activityLog: [] as ActivityEntry[],
  emotionalWeather: null as EmotionalWeather | null,
  dreams: [] as MindEngram[],
  insights: [] as MindEngram[],
  reflections: [] as MindEngram[],
  wanderings: [] as Thought[],
  journalEntries: [] as JournalEntry[],
  memoryStats: { total_engrams: 0, active: 0, dormant: 0, archived: 0, connections: 0, beliefs_count: 0 },
};

export const useCognitiveStore = create<CognitiveState>((set, get) => ({
  scope: null,
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
    set((s) => (
      s.scope?.userId === userId && s.scope?.agentId === agentId
        ? { loaded: false }
        : { ...emptyScopedState, scope: { userId, agentId }, loaded: false, newThoughtIds: new Set<string>() }
    ));
    const settled = await Promise.allSettled([
      supabase.from('cognitive_state').select('*').eq('user_id', userId).eq('agent_id', agentId).maybeSingle(),
      supabase.from('thought_stream').select('*').eq('user_id', userId).eq('agent_id', agentId).order('created_at', { ascending: false }).limit(50),
      supabase.from('memory_events').select('*').eq('user_id', userId).eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20),
      supabase.from('entity_activity_log').select('id, agent_id, activity_type, title, summary, content, source, created_at').eq('user_id', userId).eq('agent_id', agentId).order('created_at', { ascending: false }).limit(80),
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

    if (get().scope?.userId !== userId || get().scope?.agentId !== agentId) return;

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
    set((s) => (
      s.scope?.userId === userId && s.scope?.agentId === agentId
        ? {}
        : { ...emptyScopedState, scope: { userId, agentId }, loaded: false, newThoughtIds: new Set<string>() }
    ));
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
      .limit(100);

    // Load beliefs from the beliefs table (the Overview Belief card was reading a stale JSONB column).
    const beliefsTablePromise = supabase
      .from('beliefs')
      .select('id, content, confidence, confidence_tier, domain, active, created_at, updated_at')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('active', true)
      .order('confidence', { ascending: false })
      .limit(80);

    // Memory stats — one RPC instead of six per-table count(*) round-trips.
    const statsPromise = (supabase as any).rpc('cognitive_memory_stats', {
      p_user_id: userId,
      p_agent_id: agentId,
    });

    // Use allSettled so a single failure (e.g. missing journal_entries table) doesn't nuke all mind data.
    const results = await Promise.allSettled([
      dreamsPromise, insightsPromise, reflectionsPromise, wanderingsPromise, journalPromise, beliefsTablePromise, statsPromise,
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
    const beliefsTableRes = pick<{
      id?: string;
      content: string;
      confidence: number;
      confidence_tier?: string | null;
      domain?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    }>(5);
    const statsR = results[6];
    const statsRow = statsR.status === 'fulfilled'
      ? (Array.isArray((statsR.value as any)?.data) ? (statsR.value as any).data[0] : (statsR.value as any)?.data)
      : null;

    const beliefsFromTable: Belief[] = (beliefsTableRes.data ?? []).map((b) => ({
      id: b.id,
      text: b.content,
      strength: b.confidence,
      confidence_tier: b.confidence_tier ?? null,
      domain: b.domain ?? null,
      created_at: b.created_at ?? null,
      updated_at: b.updated_at ?? null,
    }));

    if (get().scope?.userId !== userId || get().scope?.agentId !== agentId) return;

    set({
      dreams: (dreamsRes.data ?? []) as MindEngram[],
      insights: (insightsRes.data ?? []) as MindEngram[],
      reflections: (reflectionsRes.data ?? []) as MindEngram[],
      wanderings: (wanderingsRes.data ?? []) as Thought[],
      journalEntries: (journalRes.data ?? []) as JournalEntry[],
      // Prefer beliefs from the table (live, authoritative) over whatever stale JSONB was in cognitive_state.
      ...(beliefsFromTable.length > 0 ? { beliefs: beliefsFromTable } : {}),
      memoryStats: {
        total_engrams: Number(statsRow?.total_engrams ?? 0),
        active: Number(statsRow?.active ?? 0),
        dormant: Number(statsRow?.dormant ?? 0),
        archived: Number(statsRow?.archived ?? 0),
        connections: Number(statsRow?.connections ?? 0),
        beliefs_count: Number(statsRow?.beliefs_count ?? 0),
      },
    });
  },


  subscribe: (userId: string, agentId = 'luca') => {
    const isCurrentScope = () => get().scope?.userId === userId && get().scope?.agentId === agentId;
    const cogChannel = supabase
      .channel(`cognitive-state:${userId}:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cognitive_state', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as any;
        if (!isCurrentScope()) return;
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
        if (!isCurrentScope()) return;
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
        if (!isCurrentScope()) return;
        if (!rowMatchesAgent(newEvent, agentId)) return;
        set((s) => ({ recentEvents: [newEvent, ...s.recentEvents].slice(0, 50) }));
      })
      .subscribe();

    const activityChannel = supabase
      .channel(`entity-activity-log:${userId}:${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entity_activity_log', filter: `user_id=eq.${userId}` }, (payload) => {
        const entry = payload.new as ActivityEntry;
        if (!isCurrentScope()) return;
        if (!rowMatchesAgent(entry, agentId)) return;
        set((s) => ({ activityLog: [entry, ...s.activityLog].slice(0, 80) }));
      })
      .subscribe();

    const weatherChannel = supabase
      .channel(`emotional-state:${userId}:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emotional_state', filter: `user_id=eq.${userId}` }, (payload) => {
        const w = payload.new as EmotionalWeather;
        if (!isCurrentScope()) return;
        if (!rowMatchesAgent(w as EmotionalWeather & { agent_id?: string }, agentId)) return;
        if (w) set({ emotionalWeather: w });
      })
      .subscribe();

    // Keep engram + belief + connection counts live. Debounced + rate-limited
    // because Mnemos writes can fire dozens of engrams per turn and each one
    // would otherwise trigger a fresh stats round-trip.
    let statsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let lastStatsRefreshAt = 0;
    const STATS_DEBOUNCE_MS = 4000;
    const STATS_MIN_INTERVAL_MS = 15000;
    const refreshMemoryStats = () => {
      if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
      const sinceLast = Date.now() - lastStatsRefreshAt;
      const wait = Math.max(STATS_DEBOUNCE_MS, STATS_MIN_INTERVAL_MS - sinceLast);
      statsRefreshTimer = setTimeout(async () => {
        statsRefreshTimer = null;
        if (!isCurrentScope()) return;
        lastStatsRefreshAt = Date.now();
        const { data, error } = await (supabase as any).rpc('cognitive_memory_stats', {
          p_user_id: userId,
          p_agent_id: agentId,
        });
        if (error || !isCurrentScope()) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        set({
          memoryStats: {
            total_engrams: Number(row.total_engrams ?? 0),
            active: Number(row.active ?? 0),
            dormant: Number(row.dormant ?? 0),
            archived: Number(row.archived ?? 0),
            connections: Number(row.connections ?? 0),
            beliefs_count: Number(row.beliefs_count ?? 0),
          },
        });
      }, wait);
    };


    const onScopedChange = (payload: { new?: { agent_id?: string | null } | null; old?: { agent_id?: string | null } | null }) => {
      const row = (payload.new ?? payload.old) as { agent_id?: string | null } | null;
      if (!isCurrentScope()) return;
      if (!rowMatchesAgent(row, agentId)) return;
      refreshMemoryStats();
    };

    const engramStatsChannel = supabase
      .channel(`engram-stats:${userId}:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'engrams', filter: `user_id=eq.${userId}` }, onScopedChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `user_id=eq.${userId}` }, onScopedChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beliefs', filter: `user_id=eq.${userId}` }, onScopedChange)
      .subscribe();

    // Journal entries also weren't live — they only loaded once via
    // loadMindData, so the Mind view could go quiet for days while Luca was
    // actually writing them in the background.
    const journalChannel = supabase
      .channel(`journal-entries:${userId}:${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${userId}` }, (payload) => {
        const entry = payload.new as JournalEntry;
        if (!isCurrentScope()) return;
        if (!rowMatchesAgent(entry, agentId)) return;
        set((s) => {
          if (s.journalEntries.some((j) => j.id === entry.id)) return {};
          return { journalEntries: [entry, ...s.journalEntries].slice(0, 100) };
        });
      })
      .subscribe();

    return () => {
      if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
      supabase.removeChannel(cogChannel);
      supabase.removeChannel(thoughtChannel);
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(activityChannel);
      supabase.removeChannel(weatherChannel);
      supabase.removeChannel(engramStatsChannel);
      supabase.removeChannel(journalChannel);
    };
  },
}));

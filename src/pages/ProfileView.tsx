import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import ProfileChatPanel from '@/components/ProfileChatPanel';
import {
  Sigil, TraitTrace, InsightPlate, RankedList, ConstellationCloud,
  PhaseDiagram, MagnitudeBars, PlateSection, StatusStrip,
  BurstPlot, JourneyTimeline, RadialChart, TimelineHeatmap, DivergenceBar,
  EmptyState,
  SectionEyebrow, SectionDivider, TabColophon,
  SignalStrip, DiurnalRing, WeeklyMicroBars, ConfidencePulse, SignalCoherence,
  ValenceTrajectory, ThreadArcs,
  MEMORY_TYPE_COLOR,
} from '@/components/profile/viz';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useViewTabStore } from '@/stores/viewTabStore';

type Profile = {
  identity_narrative: string | null;
  personality_dimensions: any;
  communication_patterns: any;
  emotional_landscape: any;
  values_hierarchy: any;
  relational_dynamics: any;
  cognitive_tendencies: any;
  growth_edges: any;
  shadow_patterns: any;
  raw_analysis?: any;
  updated_at: string;
  version: number;
};

type MemoryStats = {
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
  avgSharpness: number;
  topTags: string[];
  topTagsWithCount: Array<{ tag: string; count: number; avgConfidence: number }>;
  arrivals: Array<{ at: string; magnitude: number; memoryType?: string }>;
  // Per-trait normalized scores (0-1) for blind-spot heuristic
  byTagNorm: Record<string, number>;
  // Behavioral rhythm — derived from created_at (in user-local time)
  hourBuckets: number[]; // length 24 — count of memories created at hour h
  dowBuckets: number[]; // length 7 — Sun..Sat
  // Memory-type × hour-of-day cross-tab (for Cognition rhythm heatmap)
  byTypeHour: Record<string, number[]>; // { memory_type: number[24] }
  // Claim health
  confidenceTiers: { low: number; mid: number; high: number };
  // Narrative thread distribution — top threads with their event timestamps
  topThreads: Array<{
    thread: string;
    count: number;
    events: Array<{ at: string; magnitude: number; memoryType?: string }>;
  }>;
  // Per-memory affective points — for Emotions trajectory plot
  affectiveTrajectory: Array<{ at: string; valence: number; intensity: number }>;
};

type EmotionalState = {
  valence?: number; arousal?: number; dominance?: number;
  certainty?: number; social?: number; temporal?: number;
  recorded_at?: string;
};

type EmotionalSeries = {
  current: EmotionalState | null;
  history: Array<EmotionalState & { recorded_at: string }>;
};

type EngramSummary = {
  total: number;
  avgStrength: number;
  avgAccessibility: number;
  byType: Record<string, number>;
};

const TABS = ['Portrait', 'Personality', 'Communication', 'Emotions', 'Values', 'Relationships', 'Cognition', 'Growth', 'Shadow'] as const;
type Tab = typeof TABS[number];

export default function ProfileView() {
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [emotionalSeries, setEmotionalSeries] = useState<EmotionalSeries | null>(null);
  const [engramSummary, setEngramSummary] = useState<EngramSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const activeTab = useViewTabStore((s) => s.profileTab);
  const [chatOpen, setChatOpen] = useState(false);
  const navigate = useNavigate();

  const starterPrompts = useMemo(() => {
    const prompts: string[] = [];
    if (profile?.personality_dimensions?.big_five) {
      const traits = Object.entries(profile.personality_dimensions.big_five) as [string, any][];
      const top = traits.sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0))[0];
      if (top) prompts.push(`Why did you score me high on ${top[0]}?`);
    }
    if (profile?.shadow_patterns?.blind_spots?.length) {
      prompts.push('Which blind spot should I sit with first, and why?');
    }
    if (profile?.values_hierarchy?.ranked_values?.length) {
      const v = profile.values_hierarchy.ranked_values[0]?.value;
      if (v) prompts.push(`What evidence shows that "${v}" is one of my core values?`);
    }
    if (profile?.personality_dimensions?.attachment_style?.primary) {
      prompts.push(`What memories made you conclude my attachment style is ${profile.personality_dimensions.attachment_style.primary}?`);
    }
    prompts.push('What is one thing about me you think I would be surprised to hear?');
    prompts.push('Based on my patterns, what should I focus on this month?');
    return prompts.slice(0, 6);
  }, [profile]);

  async function generateProfile() {
    if (!user) return;
    setGenerating(true);
    setGenError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-deep-analysis`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      if (res.status !== 202 && res.status !== 200) {
        throw new Error(`Unexpected response (${res.status})`);
      }

      // Backend now runs the analysis asynchronously.
      // Poll psychological_profile for completion (cap ~10 min).
      const startedAt = Date.now();
      const baselineUpdatedAt = profile?.updated_at ?? null;
      const MAX_WAIT_MS = 10 * 60 * 1000;
      const POLL_INTERVAL_MS = 8000;

      while (Date.now() - startedAt < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const { data: latest } = await supabase
          .from('psychological_profile')
          .select('updated_at')
          .eq('user_id', user.id)
          .maybeSingle();
        if (latest?.updated_at && latest.updated_at !== baselineUpdatedAt) {
          await loadData();
          return;
        }
      }

      throw new Error('Analysis is still running in the background. Give it a few minutes, then click Refresh.');
    } catch (e: any) {
      setGenError(e.message || 'Profile generation failed');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    if (!user) return;
    setLoading(true);

    const [profileRes, memoriesRes, emotionalRes, engramsRes] = await Promise.allSettled([
      supabase
        .from('psychological_profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('memories')
        .select('memory_type, confidence, sharpness, tags, created_at, narrative_thread, emotional_valence, emotional_intensity')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('mnemos_emotional_state')
        .select('valence, arousal, dominance, certainty, social, temporal, recorded_at')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })
        .limit(180),
      supabase
        .from('engrams')
        .select('engram_type, strength, accessibility, state')
        .eq('user_id', user.id)
        .eq('state', 'active')
        .limit(500),
    ]);

    if (profileRes.status === 'fulfilled' && profileRes.value.data) {
      setProfile(profileRes.value.data as any);
    }

    if (memoriesRes.status === 'fulfilled' && memoriesRes.value.data) {
      const rows = memoriesRes.value.data as any[];
      const byType: Record<string, number> = {};
      let totalConf = 0;
      let totalSharp = 0;
      let sharpCount = 0;
      const tagCounts: Record<string, number> = {};
      const tagConf: Record<string, number> = {};
      const arrivals: Array<{ at: string; magnitude: number; memoryType?: string }> = [];
      const hourBuckets = new Array<number>(24).fill(0);
      const dowBuckets = new Array<number>(7).fill(0);
      const confTiers = { low: 0, mid: 0, high: 0 };
      const threadCounts: Record<string, number> = {};
      const threadEvents: Record<string, Array<{ at: string; magnitude: number; memoryType?: string }>> = {};
      const byTypeHour: Record<string, number[]> = {};
      const affectiveTrajectory: Array<{ at: string; valence: number; intensity: number }> = [];
      for (const m of rows) {
        const type = m.memory_type;
        byType[type] = (byType[type] || 0) + 1;
        const conf = m.confidence ?? 0;
        totalConf += conf;
        if (typeof m.sharpness === 'number') {
          totalSharp += m.sharpness;
          sharpCount += 1;
        }
        if (conf < 0.5) confTiers.low += 1;
        else if (conf < 0.8) confTiers.mid += 1;
        else confTiers.high += 1;
        if (m.tags) for (const t of (m.tags as string[])) {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
          tagConf[t] = (tagConf[t] || 0) + conf;
        }
        if (m.narrative_thread) {
          threadCounts[m.narrative_thread] = (threadCounts[m.narrative_thread] || 0) + 1;
          if (m.created_at) {
            if (!threadEvents[m.narrative_thread]) threadEvents[m.narrative_thread] = [];
            threadEvents[m.narrative_thread].push({
              at: m.created_at,
              magnitude: Math.max(0.1, conf || 0.5),
              memoryType: type,
            });
          }
        }
        if (m.created_at) {
          const dt = new Date(m.created_at);
          if (!isNaN(dt.getTime())) {
            const h = dt.getHours();
            hourBuckets[h] += 1;
            dowBuckets[dt.getDay()] += 1;
            if (type) {
              if (!byTypeHour[type]) byTypeHour[type] = new Array<number>(24).fill(0);
              byTypeHour[type][h] += 1;
            }
          }
          arrivals.push({ at: m.created_at, magnitude: Math.max(0.1, conf || 0.5), memoryType: type });
          // Affective trajectory — only memories with a real valence reading
          if (typeof m.emotional_valence === 'number') {
            affectiveTrajectory.push({
              at: m.created_at,
              valence: m.emotional_valence,
              intensity: typeof m.emotional_intensity === 'number' ? m.emotional_intensity : 0.5,
            });
          }
        }
      }
      const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
      const topTagsWithCount = sortedTags.slice(0, 12).map(([tag, count]) => ({
        tag, count, avgConfidence: tagConf[tag] / count,
      }));
      const topTags = topTagsWithCount.map(t => t.tag);
      const maxTagCount = sortedTags[0]?.[1] || 1;
      const byTagNorm: Record<string, number> = Object.fromEntries(
        sortedTags.map(([t, c]) => [t.toLowerCase(), c / maxTagCount])
      );
      const topThreads = Object.entries(threadCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([thread, count]) => ({
          thread,
          count,
          // Events sorted oldest → newest for left-to-right rendering
          events: (threadEvents[thread] ?? []).slice().sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
          ),
        }));

      // Sort affective points oldest → newest (chronological for trajectory)
      affectiveTrajectory.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      setMemoryStats({
        total: rows.length,
        byType,
        avgConfidence: rows.length ? totalConf / rows.length : 0,
        avgSharpness: sharpCount ? totalSharp / sharpCount : 0,
        topTags,
        topTagsWithCount,
        arrivals,
        byTagNorm,
        hourBuckets,
        dowBuckets,
        byTypeHour,
        confidenceTiers: confTiers,
        topThreads,
        affectiveTrajectory,
      });
    }

    if (emotionalRes.status === 'fulfilled' && emotionalRes.value.data) {
      const rows = emotionalRes.value.data as any[];
      // Most-recent first; keep that order for current, reverse for history (oldest → newest for left-to-right timeline)
      const current = rows[0] ?? null;
      const history = [...rows].reverse();
      setEmotionalSeries({ current, history });
    } else {
      setEmotionalSeries({ current: null, history: [] });
    }

    if (engramsRes.status === 'fulfilled' && engramsRes.value.data) {
      const rows = engramsRes.value.data as any[];
      const byType: Record<string, number> = {};
      let totalStrength = 0, totalAccess = 0;
      for (const e of rows) {
        byType[e.engram_type] = (byType[e.engram_type] || 0) + 1;
        totalStrength += e.strength ?? 0;
        totalAccess += e.accessibility ?? 0;
      }
      setEngramSummary({
        total: rows.length,
        avgStrength: rows.length ? totalStrength / rows.length : 0,
        avgAccessibility: rows.length ? totalAccess / rows.length : 0,
        byType,
      });
    } else {
      setEngramSummary({ total: 0, avgStrength: 0, avgAccessibility: 0, byType: {} });
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        <div className="text-center">
          <div className="text-xs" style={{ fontFamily: 'var(--font-mono)' }}>Loading profile...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    const hasMemories = (memoryStats?.total ?? 0) >= 3;
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        <div className="text-center" style={{ maxWidth: 460 }}>
          <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            {hasMemories ? 'Profile not yet generated' : 'No profile data yet'}
          </div>
          <div className="text-xs mb-5" style={{ color: 'var(--text-ghost)', lineHeight: 1.6 }}>
            {hasMemories ? (
              <>
                You have <span style={{ color: 'var(--text-soft)' }}>{memoryStats?.total}</span> memories ready for analysis.
                Generate your deep psychological profile — a 5-pass analysis (linguistic, psychological, relational,
                values, shadow) using Gemini 2.5 Pro. This takes 2–5 minutes.
              </>
            ) : (
              'Import your conversation data to generate a deep psychological profile.'
            )}
          </div>
          {genError && (
            <div className="text-[11px] mb-3 px-3 py-2 rounded" style={{ background: 'rgba(220,80,80,0.08)', border: '1px solid rgba(220,80,80,0.2)', color: '#e88' }}>
              {genError}
            </div>
          )}
          <div className="flex gap-2 justify-center">
            {hasMemories ? (
              <button
                onClick={generateProfile}
                disabled={generating}
                className="text-xs px-4 py-2 rounded"
                style={{
                  background: generating ? 'var(--bg-surface)' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  color: generating ? 'var(--text-ghost)' : 'var(--bg-deep)',
                  cursor: generating ? 'wait' : 'pointer',
                  opacity: generating ? 0.7 : 1,
                }}
              >
                {generating ? 'Analyzing... (3–6 min)' : 'Generate Profile'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/import')}
                className="text-xs px-4 py-2 rounded"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Import Conversations
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0" style={{ padding: '16px 24px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '0.01em' }}>Psychological Profile</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChatOpen((v) => !v)}
                className="text-[10px] px-3 py-1.5 rounded"
                style={{
                  background: chatOpen ? 'var(--bg-surface)' : 'rgba(244, 240, 232, 0.04)',
                  border: `1px solid ${chatOpen ? 'var(--border)' : 'rgba(244, 243, 240, 0.12)'}`,
                  color: chatOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                title="Chat with the AI about your profile — it can pull memories that informed each insight"
              >
                {chatOpen ? 'Close chat' : 'Ask about profile'}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Profile actions"
                    className="text-[10px] px-2 py-1.5 rounded"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-ghost)',
                      cursor: 'pointer',
                      lineHeight: 1,
                      letterSpacing: '0.1em',
                    }}
                    title="More profile actions"
                  >
                    ⋯
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-[11px]">
                  <DropdownMenuItem
                    onSelect={() => generateProfile()}
                    disabled={generating}
                  >
                    {generating ? 'Regenerating…' : 'Regenerate analysis'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => loadData()}>
                    Refresh data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* Status strip — always visible across tabs */}
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <StatusStrip
              items={[
                { label: 'version', value: `v${profile.version ?? 1}` },
                { label: 'updated', value: profile.updated_at ? new Date(profile.updated_at).toLocaleDateString() : '—' },
                { label: 'memories', value: String(memoryStats?.total ?? 0) },
                { label: 'confidence', value: `${((memoryStats?.avgConfidence ?? 0) * 100).toFixed(0)}%` },
                { label: 'memory types', value: String(Object.keys(memoryStats?.byType ?? {}).length) },
                { label: 'themes', value: String(memoryStats?.topTags.length ?? 0) },
                { label: 'engrams', value: String(engramSummary?.total ?? 0) },
              ]}
            />
          </div>
        </div>

        {/* Content (tabs now handled by sidebar) */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 24px 24px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
          {activeTab === 'Portrait' && <PortraitTab profile={profile} memoryStats={memoryStats} />}
          {activeTab === 'Personality' && <PersonalityTab data={profile.personality_dimensions} />}
          {activeTab === 'Communication' && <CommunicationTab data={profile.communication_patterns} />}
          {activeTab === 'Emotions' && <EmotionsTab data={profile.emotional_landscape} emotionalSeries={emotionalSeries} memoryStats={memoryStats} />}
          {activeTab === 'Values' && <ValuesTab data={profile.values_hierarchy} memoryStats={memoryStats} />}
          {activeTab === 'Relationships' && <RelationshipsTab data={profile.relational_dynamics} />}
          {activeTab === 'Cognition' && <CognitionTab data={profile.cognitive_tendencies} memoryStats={memoryStats} engramSummary={engramSummary} />}
          {activeTab === 'Growth' && <GrowthTab data={profile.growth_edges} />}
          {activeTab === 'Shadow' && <ShadowTab data={profile.shadow_patterns} memoryStats={memoryStats} valuesData={profile.values_hierarchy} />}
        </div>
      </div>

      {chatOpen && <ProfileChatPanel onClose={() => setChatOpen(false)} starterPrompts={starterPrompts} />}
    </div>
  );
}

/* ─── Portrait Tab ─── */
function PortraitTab({ profile, memoryStats }: { profile: Profile; memoryStats: MemoryStats | null }) {
  const memoryTypeData = memoryStats
    ? Object.entries(memoryStats.byType)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value }))
    : [];

  // Journey-of-analysis phases — port of the master_insights 7-phase pattern,
  // mapped to polyphonic's actual analysis pipeline.
  const [activePhase, setActivePhase] = useState(0);
  const raw = profile.raw_analysis ?? {};
  const phases = [
    { key: 'linguistic', label: 'Linguistic', symbol: '∴',
      description: typeof raw.linguistic === 'string' ? raw.linguistic.slice(0, 600) :
        'Analyzes vocabulary, sentence structure, hedging, assertion, and verbal signatures from your messages alone.' },
    { key: 'psychological', label: 'Psychological', symbol: '∇',
      description: typeof raw.psychological === 'string' ? raw.psychological.slice(0, 600) :
        'Scores Big Five traits, attachment style, locus of control, and cognitive style from observed behavior.' },
    { key: 'relational', label: 'Relational', symbol: '△',
      description: typeof raw.relational === 'string' ? raw.relational.slice(0, 600) :
        'Maps key relationships, power dynamics, conflict style, and intimacy comfort.' },
    { key: 'values', label: 'Values', symbol: 'Φ',
      description: typeof raw.values === 'string' ? raw.values.slice(0, 600) :
        'Ranks core values with evidence, distinguishing stated from revealed preferences.' },
    { key: 'shadow', label: 'Shadow', symbol: 'Ψ',
      description: typeof raw.shadow === 'string' ? raw.shadow.slice(0, 600) :
        'Surfaces contradictions, blind spots, avoidance patterns, and questions to sit with.' },
    { key: 'portrait', label: 'Portrait', symbol: '℧',
      description: profile.identity_narrative ?? 'The synthesizing pass that produces the Identity Portrait — a flowing paragraph capturing the essence.' },
    { key: 'integration', label: 'Integration', symbol: '∞',
      description: 'All passes integrate into the structured profile. Future versions will compare drift across regenerations.' },
  ];

  // Build the psychological signature passport stripe
  const bf = profile.personality_dimensions?.big_five;
  const oceanReadout = bf
    ? ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']
        .map(k => {
          const entry = bf[k];
          const v = typeof entry === 'number' ? entry : entry?.score ?? null;
          return v == null ? '——' : String(Math.round(v));
        })
        .join(' · ')
    : null;
  const attachmentLabel = profile.relational_dynamics?.attachment_style?.primary
    ?? profile.personality_dimensions?.attachment_style?.primary;
  const cognitiveStyle = profile.cognitive_tendencies?.thinking_style?.split(/[:.]/)[0]?.trim()
    ?? profile.cognitive_tendencies?.style;

  const signatureItems: Array<{ label: string; value: string }> = [];
  if (oceanReadout) signatureItems.push({ label: 'OCEAN', value: oceanReadout });
  if (attachmentLabel) signatureItems.push({ label: 'attachment', value: String(attachmentLabel).toLowerCase() });
  if (cognitiveStyle) signatureItems.push({ label: 'cognition', value: String(cognitiveStyle).toLowerCase() });
  signatureItems.push({ label: 'profile', value: `v${profile.version ?? 1}` });

  // Pre-compute signal-strip stat values (graceful for sparse data)
  const hourBuckets = memoryStats?.hourBuckets ?? new Array(24).fill(0);
  const dowBuckets = memoryStats?.dowBuckets ?? new Array(7).fill(0);
  const confTiers = memoryStats?.confidenceTiers ?? { low: 0, mid: 0, high: 0 };
  const sharpness = memoryStats?.avgSharpness ?? 0;
  const confidence = memoryStats?.avgConfidence ?? 0;

  return (
    <div>
      {/* ────────── § I. SIGNATURE — Frontispiece ────────── */}
      {(profile.identity_narrative || bf) && (
        <div style={{ paddingTop: 8 }}>
          <SectionEyebrow
            index="§ I"
            label="Signature"
            hint={profile.updated_at ? `synthesized ${new Date(profile.updated_at).toLocaleDateString()}` : undefined}
          />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 420px) 1fr',
            gap: 56,
            alignItems: 'flex-start',
            paddingTop: 8,
            paddingBottom: 28,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <Sigil
                bigFive={bf}
                byType={memoryStats?.byType}
                size={380}
                showLabels={true}
              />
              <div style={{
                fontSize: 9, color: 'rgba(244, 243, 240, 0.32)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
                textTransform: 'uppercase', textAlign: 'center',
                maxWidth: 320, lineHeight: 1.7,
              }}>
                Personality sigil<br />
                <span style={{ opacity: 0.65, letterSpacing: '0.12em' }}>
                  Big Five vertices · outer ticks encode memory taxonomy
                </span>
              </div>
            </div>
            <div style={{ paddingTop: 12 }}>
              <div style={{
                fontSize: 9, color: 'rgba(244, 243, 240, 0.5)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
                textTransform: 'uppercase', marginBottom: 18,
              }}>
                Identity Portrait
              </div>
              {profile.identity_narrative ? (
                <p style={{
                  fontSize: 15, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                  lineHeight: 1.85, margin: 0, letterSpacing: '0.005em',
                }}>
                  "{profile.identity_narrative}"
                </p>
              ) : (
                <p style={{
                  fontSize: 12, color: 'rgba(244, 243, 240, 0.4)',
                  fontStyle: 'italic', fontFamily: 'var(--font-serif)',
                }}>
                  Identity portrait pending — generate to render the narrative.
                </p>
              )}
            </div>
          </div>
          {/* Passport stripe */}
          {signatureItems.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
              gap: 28, padding: '14px 0',
              borderTop: '1px solid rgba(244, 243, 240, 0.10)',
              borderBottom: '1px solid rgba(244, 243, 240, 0.10)',
            }}>
              {signatureItems.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 9, color: 'rgba(244, 243, 240, 0.32)',
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}>{it.label}</span>
                  <span style={{
                    fontSize: 11, color: 'rgba(244, 243, 240, 0.85)',
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                  }}>{it.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <SectionDivider />

      {/* ────────── § II. SIGNAL — Behavioral rhythm ────────── */}
      <SectionEyebrow
        index="§ II"
        label="Signal"
        lede="Behavioral rhythm derived from memory arrival timestamps and claim-health metrics. The instruments fill in as more conversation history is imported."
      />
      <SignalStrip>
        <DiurnalRing buckets={hourBuckets} />
        <WeeklyMicroBars buckets={dowBuckets} />
        <ConfidencePulse tiers={confTiers} />
        <SignalCoherence sharpness={sharpness} confidence={confidence} />
      </SignalStrip>

      <SectionDivider />

      {/* ────────── § III. COMPOSITION — Memory taxonomy + themes ────────── */}
      <SectionEyebrow
        index="§ III"
        label="Composition"
        lede="What the memory corpus is made of, and the themes that recur across it."
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)',
        gap: 56,
        paddingTop: 8,
        paddingBottom: 8,
      }}>
        <div>
          <div style={{
            fontSize: 9, color: 'rgba(244, 243, 240, 0.45)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
            textTransform: 'uppercase', marginBottom: 18,
          }}>
            Memory distribution {memoryStats?.total ? `· ${memoryStats.total}` : ''}
          </div>
          {memoryTypeData.length > 0 ? (
            <MagnitudeBars data={memoryTypeData} height={96} colorByLabel />
          ) : (
            <EmptyState note="No memory taxonomy yet" height={96} />
          )}
        </div>
        <div>
          <div style={{
            fontSize: 9, color: 'rgba(244, 243, 240, 0.45)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
            textTransform: 'uppercase', marginBottom: 18,
          }}>
            Recurring themes {memoryStats?.topTags?.length ? `· ${memoryStats.topTags.length}` : ''}
          </div>
          {memoryStats && memoryStats.topTagsWithCount.length > 0 ? (
            <ConstellationCloud
              items={memoryStats.topTagsWithCount.map(t => ({ label: t.tag, count: t.count }))}
              showCounts
              accent="warm"
            />
          ) : (
            <EmptyState note="Themes will surface as memories accumulate" height={96} />
          )}
        </div>
      </div>

      <SectionDivider />

      {/* ────────── § IV. TEMPORAL — Memory arrivals + narrative threads ────────── */}
      <SectionEyebrow
        index="§ IV"
        label="Temporal"
        lede="When memories arrived, and the threads they form. Hairline height encodes confidence; color encodes the kind of thinking captured. Threads are recurring story-lines the analysis identified — hover or click a lane to focus."
      />
      <div style={{
        fontSize: 9, color: 'rgba(244, 243, 240, 0.45)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
        textTransform: 'uppercase', marginBottom: 12, paddingTop: 4,
      }}>
        Memory arrivals {memoryStats?.arrivals.length ? `· ${memoryStats.arrivals.length}` : ''}
      </div>
      {memoryStats && memoryStats.arrivals.length > 0 ? (
        <BurstPlot events={memoryStats.arrivals} height={120} label="Memory arrivals" />
      ) : (
        <EmptyState note="Awaiting memory arrival history" height={120} />
      )}
      <div style={{
        fontSize: 9, color: 'rgba(244, 243, 240, 0.45)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
        textTransform: 'uppercase', marginTop: 28, marginBottom: 12,
      }}>
        Narrative threads {memoryStats?.topThreads.length ? `· ${memoryStats.topThreads.length}` : ''}
      </div>
      {memoryStats && memoryStats.topThreads.length > 0 ? (
        <ThreadArcs threads={memoryStats.topThreads} />
      ) : (
        <EmptyState note="Threads will surface as memories accumulate" height={120} />
      )}

      <SectionDivider />

      {/* ────────── § V. PROVENANCE — Analysis pipeline ────────── */}
      <SectionEyebrow
        index="§ V"
        label="Provenance"
        lede="The five-pass analysis pipeline that produced the profile above. Click a phase to see what it observed."
      />
      <div style={{ paddingTop: 8 }}>
        <JourneyTimeline phases={phases} activeIndex={activePhase} onSelect={setActivePhase} />
      </div>

      <TabColophon name="Portrait" page={1} />
    </div>
  );
}

/* ─── Personality Tab ─── */
function PersonalityTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="personality dimensions" />;

  // Map attachment style label → phase diagram coords (anxiety × avoidance)
  const attachmentMap: Record<string, { x: number; y: number }> = {
    'secure': { x: 25, y: 75 },
    'anxious-preoccupied': { x: 80, y: 75 },
    'anxious': { x: 80, y: 75 },
    'preoccupied': { x: 80, y: 75 },
    'dismissive-avoidant': { x: 25, y: 25 },
    'dismissive': { x: 25, y: 25 },
    'avoidant': { x: 50, y: 25 },
    'fearful-avoidant': { x: 80, y: 25 },
    'disorganized': { x: 80, y: 25 },
  };
  const attachmentPrimary = (data.attachment_style?.primary ?? '').toLowerCase();
  const attachmentCoords = Object.entries(attachmentMap).find(([k]) => attachmentPrimary.includes(k))?.[1] ?? null;

  return (
    <div>
      {data.big_five && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Traces"
            lede="Big Five projected as oscilloscope traces. Each marker's deflection from the bell-curve mean is the deviation from population baseline."
          />
          <div style={{ paddingTop: 6 }}>
            {Object.entries(data.big_five).map(([trait, info]: [string, any]) => (
              <TraitTrace key={trait} label={trait} value={info?.score ?? 50} max={100} evidence={info?.evidence} />
            ))}
          </div>
        </>
      )}

      {data.attachment_style && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ II"
            label="Attachment"
            lede="Attachment style placed inside the anxiety × closeness phase diagram. The dot is your position; the quadrant labels name the archetype."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 40, alignItems: 'center', padding: '8px 0 12px' }}>
            <PhaseDiagram
              xLabel="Anxiety"
              yLabel="Comfort with Closeness"
              xValue={attachmentCoords?.x ?? 50}
              yValue={attachmentCoords?.y ?? 50}
              regions={[
                { label: 'Secure', x: 0, y: 50, w: 50, h: 50 },
                { label: 'Preoccupied', x: 50, y: 50, w: 50, h: 50 },
                { label: 'Dismissive', x: 0, y: 0, w: 50, h: 50 },
                { label: 'Fearful', x: 50, y: 0, w: 50, h: 50 },
              ]}
              size={260}
            />
            <div>
              <div style={{ fontSize: 18, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 14, textTransform: 'capitalize', letterSpacing: '0.005em' }}>
                {data.attachment_style.primary}
              </div>
              {data.attachment_style.evidence && (
                <p style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.75, margin: 0 }}>
                  {data.attachment_style.evidence}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {(data.cognitive_style || data.locus_of_control) && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ III"
            label="Orientation"
            lede="Where your mind defaults: cognitive style and locus of control patterns observed across the corpus."
          />
          {data.cognitive_style && <InsightPlate label="Cognitive style" text={data.cognitive_style} prominence="lead" />}
          {data.locus_of_control && <InsightPlate label="Locus of control" text={data.locus_of_control} prominence="lead" />}
        </>
      )}

      <TabColophon name="Personality" page={2} />
    </div>
  );
}

/* ─── Communication Tab ─── */
// Heuristic: parse prose dimension text for keyword markers and infer 0-100 scores.
// Returns null when no signal can be inferred.
function inferProseIntensity(text: string | undefined | null): number | null {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();
  // Order matters — check stronger signals first
  if (/\b(extreme|extremely|exceptional|exceptionally|profound|profoundly|extraordinary)\b/.test(t)) return 92;
  if (/\b(very high|very strong|highly|strongly|prolific|remarkably)\b/.test(t)) return 82;
  if (/\b(high|strong|rich|sophisticated|complex|elevated)\b/.test(t)) return 70;
  if (/\b(moderate|moderately|balanced|mixed|some|frequent|regular)\b/.test(t)) return 55;
  if (/\b(low|reserved|sparing|infrequent|cautious|hedged)\b/.test(t)) return 35;
  if (/\b(very low|minimal|rare|seldom|absent)\b/.test(t)) return 18;
  return null;
}

function CommunicationTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="communication patterns" />;

  const commAxes = [
    { key: 'vocabulary_richness', label: 'Vocabulary' },
    { key: 'humor_style', label: 'Humor' },
    { key: 'assertion_strength', label: 'Assertion' },
    { key: 'emotional_vocabulary_range', label: 'Emotion Range' },
    { key: 'hedging_frequency', label: 'Hedging' },
  ];
  const inferred: Record<string, number> = {};
  let any = false;
  for (const a of commAxes) {
    const v = inferProseIntensity(data[a.key]);
    if (v !== null) { inferred[a.key] = v; any = true; }
    else { inferred[a.key] = 50; }
  }

  return (
    <div>
      {any && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Signature"
            lede="Five-axis communication snapshot inferred from prose dimensions below. The hairline polygon is your verbal fingerprint — the shape recurs across exchanges."
            hint="uncalibrated estimate"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 40, alignItems: 'center', padding: '6px 0 14px' }}>
            <RadialChart
              axes={commAxes}
              traces={[{ values: inferred, primary: true }]}
              size={260}
            />
            <p style={{ fontSize: 12.5, color: 'var(--text-body)', lineHeight: 1.75, fontStyle: 'italic', fontFamily: 'var(--font-serif)', margin: 0 }}>
              Each axis maps a prose dimension scored heuristically (extreme/very-high/high/moderate/low/very-low). With richer pipeline scoring this becomes calibrated; for now the shape is directional.
            </p>
          </div>
        </>
      )}

      <SectionDivider />
      <SectionEyebrow
        index="§ II"
        label="Patterns"
        lede="Per-dimension prose readouts: vocabulary, humor, hedging, assertion, emotional range."
      />
      {data.vocabulary_richness && <InsightPlate label="Vocabulary" text={data.vocabulary_richness} />}
      {data.humor_style && <InsightPlate label="Humor" text={data.humor_style} />}
      {data.hedging_frequency && <InsightPlate label="Hedging" text={data.hedging_frequency} />}
      {data.assertion_strength && <InsightPlate label="Assertion" text={data.assertion_strength} />}
      {data.emotional_vocabulary_range && <InsightPlate label="Emotional range" text={data.emotional_vocabulary_range} />}

      {data.unique_signatures?.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ III"
            label="Verbal signatures"
            lede="Phrases or constructs that recur in your speech — the verbal tics that mark your voice."
            hint={`n=${data.unique_signatures.length}`}
          />
          <RankedList items={data.unique_signatures.map((sig: string, i: number) => ({ label: sig, rank: i + 1 }))} />
        </>
      )}

      <TabColophon name="Communication" page={3} />
    </div>
  );
}

/* ─── Emotions Tab ─── */
function EmotionsTab({ data, emotionalSeries, memoryStats }: { data: any; emotionalSeries: EmotionalSeries | null; memoryStats: MemoryStats | null }) {
  // Even with empty data, render emotional series if available
  const hasProseData = data && Object.keys(data).length > 0;
  const hasSeriesData = emotionalSeries && (emotionalSeries.current || emotionalSeries.history.length > 0);
  if (!hasProseData && !hasSeriesData) return <EmptySection label="emotional landscape" />;

  // Map mnemos_emotional_state range (-1 to +1, or 0-1) to 0-100 for radial chart
  const normalize01 = (v: number | undefined | null): number => {
    if (v == null) return 50;
    if (v >= -1 && v <= 1) return Math.round(((v + 1) / 2) * 100);
    if (v >= 0 && v <= 1) return Math.round(v * 100);
    return 50;
  };

  const emotionAxes = [
    { key: 'valence', label: 'Valence' },
    { key: 'arousal', label: 'Arousal' },
    { key: 'dominance', label: 'Dominance' },
    { key: 'certainty', label: 'Certainty' },
    { key: 'social', label: 'Social' },
    { key: 'temporal', label: 'Temporal' },
  ];

  const currentValues = emotionalSeries?.current ? Object.fromEntries(
    emotionAxes.map(a => [a.key, normalize01((emotionalSeries.current as any)[a.key])])
  ) : null;

  // Build heatmap rows from history (most-recent N entries; oldest → newest left-to-right)
  const HISTORY_DAYS = 90;
  const heatmapRows = emotionalSeries?.history.length
    ? emotionAxes.map(a => ({
        label: a.label,
        values: (() => {
          const recent = emotionalSeries.history.slice(-HISTORY_DAYS);
          const values: number[] = recent.map(h => {
            const v = (h as any)[a.key];
            return typeof v === 'number' ? v : 0;
          });
          // Pad left with nulls if we have fewer than HISTORY_DAYS entries
          while (values.length < HISTORY_DAYS) values.unshift(null as any);
          return values;
        })(),
      }))
    : [];

  return (
    <div>
      {(currentValues || heatmapRows.length > 0) && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Current state"
            lede="Snapshot of present affective coordinates against a 90-day timeline. The radial polygon is right now; the heatmap is the past three months."
            hint={emotionalSeries?.history.length ? `n=${emotionalSeries.history.length}` : undefined}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 40, alignItems: 'flex-start', padding: '6px 0 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              {currentValues ? (
                <RadialChart
                  axes={emotionAxes}
                  traces={[{ values: currentValues, primary: true }]}
                  size={260}
                />
              ) : (
                <EmptyState note="No current state recorded" height={220} />
              )}
              <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.32)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>
                Affective signature · now
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.45)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>
                Last {Math.min(HISTORY_DAYS, emotionalSeries?.history.length ?? 0)} entries
              </div>
              <TimelineHeatmap rows={heatmapRows} days={HISTORY_DAYS} height={180} tone="affective" />
            </div>
          </div>
        </>
      )}

      {memoryStats && memoryStats.affectiveTrajectory.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ II"
            label="Affective trajectory"
            lede="Each memory carries its own affective charge. Valence (positive ↔ negative) plotted over arrival time; circle size encodes intensity. The hairline mean traces the underlying mood arc."
            hint={`n=${memoryStats.affectiveTrajectory.length}`}
          />
          <div style={{ paddingTop: 6 }}>
            <ValenceTrajectory events={memoryStats.affectiveTrajectory} />
          </div>
        </>
      )}

      {hasProseData && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ III"
            label="Landscape"
            lede="Baseline mood, range, and how emotion is regulated and expressed."
          />
          {data.baseline_mood && <InsightPlate label="Baseline" text={data.baseline_mood} prominence="lead" />}
          {data.emotional_range && <InsightPlate label="Range" text={data.emotional_range} />}
          {data.regulation_style && <InsightPlate label="Regulation" text={data.regulation_style} />}
          {data.granularity && <InsightPlate label="Granularity" text={data.granularity} />}
        </>
      )}

      {(data?.triggers?.length > 0 || data?.coping_mechanisms?.length > 0) && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ IV"
            label="Triggers + coping"
            lede="What pulls you and what you reach for. Frequency-weighted constellations."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, paddingTop: 4 }}>
            {data?.triggers?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Triggers · {data.triggers.length}
                </div>
                <ConstellationCloud items={data.triggers} accent="cool" />
              </div>
            )}
            {data?.coping_mechanisms?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Coping mechanisms · {data.coping_mechanisms.length}
                </div>
                <ConstellationCloud items={data.coping_mechanisms} accent="warm" />
              </div>
            )}
          </div>
        </>
      )}

      <TabColophon name="Emotions" page={4} />
    </div>
  );
}

/* ─── Values Tab ─── */
// Heuristic match: for a value name like "Justice/Moral Integrity", split into tokens
// and find tags whose lowercased text contains any token. Returns best-match normalized score.
function tagMatchScore(valueName: string, byTagNorm: Record<string, number>): number {
  if (!valueName || !byTagNorm) return 0;
  const tokens = valueName.toLowerCase().split(/[\s/,_-]+/).filter(t => t.length >= 4);
  if (!tokens.length) return 0;
  let best = 0;
  for (const tag of Object.keys(byTagNorm)) {
    for (const tok of tokens) {
      if (tag.includes(tok) || tok.includes(tag)) {
        if (byTagNorm[tag] > best) best = byTagNorm[tag];
        break;
      }
    }
  }
  return best;
}

function ValuesTab({ data, memoryStats }: { data: any; memoryStats: MemoryStats | null }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="values hierarchy" />;

  const ranked = data.ranked_values ?? [];
  // Build divergence items for top-3 values
  const divergenceItems = memoryStats && ranked.length > 0
    ? ranked.slice(0, 3).map((v: any, i: number) => {
        // Stated = inverse rank position (rank 1 = 1.0, rank 2 = 0.66, etc.)
        const stated = ranked.length > 1 ? 1 - (i / Math.min(ranked.length, 5)) : 1;
        const revealed = tagMatchScore(v.value || '', memoryStats.byTagNorm);
        return { label: v.value, stated, revealed };
      })
    : [];

  return (
    <div>
      {ranked.length > 0 && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Hierarchy"
            lede="Top values in ranked order with the evidence that placed them."
            hint={`n=${ranked.length}`}
          />
          <RankedList items={ranked.map((v: any, i: number) => ({
            label: v.value, evidence: v.evidence, rank: v.rank ?? i + 1,
          }))} />
        </>
      )}

      {divergenceItems.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ II"
            label="Stated vs revealed"
            lede="How prominently each top value appears in your tagged memories. Where stated rank diverges from revealed signal, the asterisk flags a potential blind-spot indicator."
          />
          <DivergenceBar items={divergenceItems} />
        </>
      )}

      {(data.stated_vs_revealed || data.decision_framework || data.temporal_orientation) && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ III"
            label="Architecture"
            lede="How values translate into decisions: framework, temporal orientation, gap between aspiration and behavior."
          />
          {data.stated_vs_revealed && <InsightPlate label="Stated vs revealed" text={data.stated_vs_revealed} />}
          {data.decision_framework && <InsightPlate label="Framework" text={data.decision_framework} />}
          {data.temporal_orientation && <InsightPlate label="Temporal orientation" text={data.temporal_orientation} />}
        </>
      )}

      <TabColophon name="Values" page={5} />
    </div>
  );
}

/* ─── Relationships Tab ─── */
function RelationshipsTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="relational dynamics" />;

  return (
    <div>
      {data.key_relationships?.length > 0 && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Key relationships"
            lede="The relational categories that show up most in the corpus, with the dynamic each follows."
            hint={`n=${data.key_relationships.length}`}
          />
          <RankedList items={data.key_relationships.map((r: any, i: number) => ({
            label: r.role, evidence: r.dynamic, rank: i + 1,
          }))} />
        </>
      )}

      <SectionDivider />
      <SectionEyebrow
        index="§ II"
        label="Patterns"
        lede="Conflict style, power orientation, intimacy comfort, and the specific shape of relationship with AI."
      />
      {data.conflict_style && <InsightPlate label="Conflict" text={data.conflict_style} />}
      {data.power_orientation && <InsightPlate label="Power" text={data.power_orientation} />}
      {data.intimacy_comfort && <InsightPlate label="Intimacy" text={data.intimacy_comfort} />}
      {data.ai_relationship_style && <InsightPlate label="AI relationships" text={data.ai_relationship_style} prominence="lead" />}

      <TabColophon name="Relationships" page={6} />
    </div>
  );
}

/* ─── Cognition Tab ─── */
function CognitionTab({ data, memoryStats, engramSummary }: {
  data: any; memoryStats: MemoryStats | null; engramSummary: EngramSummary | null;
}) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="cognitive tendencies" />;

  // Cognitive bandwidth — derived from memory_type distribution
  const counts = memoryStats?.byType ?? {};
  const get = (k: string) => counts[k] ?? 0;
  const max = Math.max(1, ...Object.values(counts));
  // Normalize to 0-100
  const norm = (raw: number) => Math.min(100, Math.round((raw / max) * 100));

  const bandwidthAxes = [
    { key: 'logic', label: 'Logic' },
    { key: 'creativity', label: 'Creativity' },
    { key: 'pattern', label: 'Pattern' },
    { key: 'memory', label: 'Memory' },
    { key: 'integration', label: 'Integration' },
    { key: 'abstract', label: 'Abstract' },
  ];
  const bandwidthValues = {
    logic: norm(get('principle') + get('commitment')),
    creativity: norm(get('synthesis') + get('reflection')),
    pattern: norm(get('relationship') + (engramSummary?.total ? engramSummary.total / 10 : 0)),
    memory: norm(get('fact') + get('moment')),
    integration: norm((get('synthesis') + get('reflection')) * 0.7), // proxy — narrative_thread count would be ideal but not aggregated
    abstract: norm(get('synthesis') + get('reflection') + get('principle') * 0.5),
  };
  const hasBandwidthSignal = Object.values(counts).some(v => v > 0);

  return (
    <div>
      {hasBandwidthSignal && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Bandwidth"
            lede="Six-axis cognitive allocation derived from memory-type distribution. A profile of which mental flavors accumulate most."
            hint="derived signal"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 40, alignItems: 'center', padding: '6px 0 14px' }}>
            <RadialChart
              axes={bandwidthAxes}
              traces={[{ values: bandwidthValues, primary: true }]}
              size={260}
            />
            <p style={{ fontSize: 12.5, color: 'var(--text-body)', lineHeight: 1.75, fontStyle: 'italic', fontFamily: 'var(--font-serif)', margin: 0 }}>
              Logic ← principle + commitment. Creativity ← synthesis + reflection. Pattern ← relationship + engram density. Memory ← fact + moment. Integration weighted from synthesis/reflection. Abstract ← all reflective categories. Each axis normalized to your own corpus max.
            </p>
          </div>
        </>
      )}

      {memoryStats && Object.keys(memoryStats.byTypeHour).length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ II"
            label="Rhythm"
            lede="When each kind of thinking arrives. Memory categories crossed against hour-of-day. Patterns sharpen over time as the corpus grows — peak-creative hours, principle-thinking hours, reflective hours emerge."
            hint={`n=${memoryStats.total}`}
          />
          <div style={{ paddingTop: 6 }}>
            {(() => {
              // Order rows by total count desc so dominant types are at top
              const ordered = Object.entries(memoryStats.byTypeHour)
                .map(([type, vals]) => ({ type, vals, total: vals.reduce((a, b) => a + b, 0) }))
                .sort((a, b) => b.total - a.total);
              // Map each row to its memory_type palette color (RGB-only string for the cell base)
              const heatmapRows = ordered.map(o => {
                const palette = MEMORY_TYPE_COLOR[o.type.toLowerCase()];
                // Extract "R, G, B" from the rgba(...) string
                const rgbMatch = palette?.hue.match(/rgba?\(([^,]+,[^,]+,[^,)]+)/);
                return {
                  label: o.type,
                  values: o.vals,
                  color: rgbMatch ? rgbMatch[1].trim() : undefined,
                };
              });
              return (
                <TimelineHeatmap
                  rows={heatmapRows}
                  days={24}
                  height={Math.max(150, ordered.length * 22)}
                  normalize="row"
                  columnLabel={(h) => `${String(h).padStart(2, '0')}:00`}
                />
              );
            })()}
            {/* Hour-axis labels — 0/6/12/18 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px repeat(24, 1fr)',
              fontSize: 9, color: 'rgba(244, 243, 240, 0.32)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
              marginTop: 4, paddingRight: 12,
            }}>
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} style={{ textAlign: 'center', visibility: h % 6 === 0 ? 'visible' : 'hidden' }}>
                  {String(h).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <SectionDivider />
      <SectionEyebrow
        index="§ III"
        label="Tendencies"
        lede="How thinking proceeds: synthesis style, decision pattern, response under stress."
      />
      {data.thinking_style && <InsightPlate label="Thinking" text={data.thinking_style} prominence="lead" />}
      {data.decision_patterns && <InsightPlate label="Decisions" text={data.decision_patterns} />}
      {data.stress_response && <InsightPlate label="Stress response" text={data.stress_response} />}

      {(data.biases?.length > 0 || data.defense_mechanisms?.length > 0) && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ IV"
            label="Biases + defenses"
            lede="Biases observed in the corpus and the defenses that ride alongside them."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, paddingTop: 4 }}>
            {data.biases?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Cognitive biases · {data.biases.length}
                </div>
                <ConstellationCloud items={data.biases} accent="cool" />
              </div>
            )}
            {data.defense_mechanisms?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Defense mechanisms · {data.defense_mechanisms.length}
                </div>
                <ConstellationCloud items={data.defense_mechanisms} accent="warm" />
              </div>
            )}
          </div>
        </>
      )}

      <TabColophon name="Cognition" page={7} />
    </div>
  );
}

/* ─── Growth Tab ─── */
function GrowthTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="growth edges" />;

  return (
    <div>
      {data.active_growth?.length > 0 && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Active"
            lede="Edges where work is happening now."
            hint={`n=${data.active_growth.length}`}
          />
          <RankedList items={data.active_growth.map((s: string, i: number) => ({ label: s, rank: i + 1 }))} />
        </>
      )}
      {data.emerging_awareness?.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ II"
            label="Emerging"
            lede="Awareness still forming — recognized but not yet integrated."
            hint={`n=${data.emerging_awareness.length}`}
          />
          <RankedList items={data.emerging_awareness.map((s: string, i: number) => ({ label: s, rank: i + 1 }))} />
        </>
      )}
      {data.integration_opportunities?.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ III"
            label="Integration"
            lede="Opportunities to consolidate what's been learned."
            hint={`n=${data.integration_opportunities.length}`}
          />
          <RankedList items={data.integration_opportunities.map((s: string, i: number) => ({ label: s, rank: i + 1 }))} />
        </>
      )}

      <TabColophon name="Growth" page={8} />
    </div>
  );
}

/* ─── Shadow Tab ─── */
function ShadowTab({ data, memoryStats, valuesData }: {
  data: any; memoryStats: MemoryStats | null; valuesData: any;
}) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="shadow patterns" />;

  // For each blind spot prose entry, derive a divergence score by finding tag-keyword
  // overlap between the blind spot and the user's stated top values.
  // Magnitude = how much of the blind spot's vocabulary appears in revealed memory tags
  // vs. how strongly it conflicts with stated top values.
  const blindSpotItems = (data.blind_spots && memoryStats && valuesData?.ranked_values?.length)
    ? (data.blind_spots as string[]).slice(0, 4).map((spot, i) => {
        const stated = 0.5; // baseline — we have no per-spot stated weight, default to mid
        const revealed = tagMatchScore(spot, memoryStats.byTagNorm);
        return { label: spot.length > 80 ? spot.slice(0, 77) + '…' : spot, stated, revealed };
      })
    : [];

  return (
    <div>
      {data.contradictions?.length > 0 && (
        <>
          <SectionEyebrow
            index="§ I"
            label="Contradictions"
            lede="Places where the corpus contradicts itself. Tension is information."
            hint={`n=${data.contradictions.length}`}
          />
          <RankedList items={data.contradictions.map((s: string, i: number) => ({ label: s, rank: i + 1 }))} />
        </>
      )}
      {data.blind_spots?.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ II"
            label="Blind spots"
            lede="What's likely outside your field of view — observed by the analysis but unlikely to feel true to you yet."
            hint={`n=${data.blind_spots.length}`}
          />
          <RankedList items={data.blind_spots.map((s: string, i: number) => ({ label: s, rank: i + 1 }))} />
        </>
      )}
      {blindSpotItems.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ III"
            label="Signal map"
            lede="Where each blind spot's revealed memory signal diverges from baseline — a quantitative companion to the prose above."
          />
          <DivergenceBar items={blindSpotItems} />
        </>
      )}
      {(data.avoidance_patterns?.length > 0 || data.compensatory_behaviors?.length > 0) && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ IV"
            label="Avoidance + compensation"
            lede="What you turn from, and what you reach for instead."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, paddingTop: 4 }}>
            {data.avoidance_patterns?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Avoidance · {data.avoidance_patterns.length}
                </div>
                <ConstellationCloud items={data.avoidance_patterns} weighted={false} accent="cool" />
              </div>
            )}
            {data.compensatory_behaviors?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(244, 243, 240, 0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Compensatory · {data.compensatory_behaviors.length}
                </div>
                <ConstellationCloud items={data.compensatory_behaviors} weighted={false} accent="warm" />
              </div>
            )}
          </div>
        </>
      )}
      {data.unasked_questions?.length > 0 && (
        <>
          <SectionDivider />
          <SectionEyebrow
            index="§ V"
            label="Questions to sit with"
            lede="Open questions surfaced by the analysis. Not answers — invitations."
            hint={`n=${data.unasked_questions.length}`}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 4 }}>
            {data.unasked_questions.map((q: string, i: number) => (
              <p key={i} style={{ fontSize: 15, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', fontStyle: 'italic', lineHeight: 1.75, margin: 0, paddingLeft: 16, borderLeft: '1px solid rgba(244, 243, 240, 0.22)' }}>
                "{q}"
              </p>
            ))}
          </div>
        </>
      )}

      <TabColophon name="Shadow" page={9} />
    </div>
  );
}

/* ─── Reusable Components ─── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 20px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
      <div className="text-[10px] uppercase font-medium mb-3" style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}>{title}</div>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center" style={{ padding: '14px 12px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
      <div className="text-lg font-light" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}

function DimensionBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3 mb-2">
      <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 120, textTransform: 'capitalize' }}>{label.replace(/_/g, ' ')}</span>
      <div style={{ flex: 1, height: 4, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--luca)', opacity: 0.5, borderRadius: 2, transition: 'width 800ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 28, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function InsightCard({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ padding: '14px 18px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
      <div className="text-[10px] uppercase font-medium mb-2" style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}>{label}</div>
      <div className="text-[12px]" style={{ color: 'var(--text-soft)', lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
          {item}
        </span>
      ))}
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="text-[11px] flex items-start gap-2" style={{ color: 'var(--text-soft)' }}>
          <span style={{ color, opacity: 0.6, marginTop: 4, fontSize: 6 }}>●</span>
          <span style={{ lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-[11px]" style={{ color: 'var(--text-ghost)' }}>
        No {label} data available yet. Import conversations to generate insights.
      </div>
    </div>
  );
}

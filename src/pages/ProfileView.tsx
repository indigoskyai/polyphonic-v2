import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

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
  updated_at: string;
  version: number;
};

type MemoryStats = {
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
  topTags: string[];
};

const TABS = ['Portrait', 'Personality', 'Communication', 'Emotions', 'Values', 'Relationships', 'Cognition', 'Growth', 'Shadow'] as const;
type Tab = typeof TABS[number];

export default function ProfileView() {
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Portrait');
  const navigate = useNavigate();

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
      await loadData();
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

    const [profileRes, memoriesRes] = await Promise.all([
      supabase
        .from('psychological_profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('memories')
        .select('memory_type, confidence, tags')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .limit(1000),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data as any);
    }

    if (memoriesRes.data) {
      const byType: Record<string, number> = {};
      let totalConf = 0;
      const tagCounts: Record<string, number> = {};
      for (const m of memoriesRes.data) {
        byType[m.memory_type] = (byType[m.memory_type] || 0) + 1;
        totalConf += m.confidence;
        if (m.tags) for (const t of (m.tags as string[])) {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
      }
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([t]) => t);

      setMemoryStats({
        total: memoriesRes.data.length,
        byType,
        avgConfidence: memoriesRes.data.length ? totalConf / memoriesRes.data.length : 0,
        topTags,
      });
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
                {generating ? 'Analyzing... (2–5 min)' : 'Generate Profile'}
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: '16px 24px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 className="text-sm font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '0.01em' }}>Psychological Profile</h1>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
            v{profile.version} · updated {new Date(profile.updated_at).toLocaleDateString()} · {memoryStats?.total || 0} memories analyzed
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateProfile}
            disabled={generating}
            className="text-[10px] px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: generating ? 'var(--text-ghost)' : 'var(--text-tertiary)', cursor: generating ? 'wait' : 'pointer' }}
            title="Re-run the 5-pass deep analysis on your latest memories"
          >
            {generating ? 'Regenerating...' : 'Regenerate'}
          </button>
          <button
            onClick={loadData}
            className="text-[10px] px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 shrink-0 overflow-x-auto" style={{ padding: '8px 24px', scrollbarWidth: 'none' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="text-[11px] px-3 py-1.5 rounded whitespace-nowrap"
            style={{
              background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-ghost)',
              border: activeTab === tab ? '1px solid var(--border)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '8px 24px 24px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        {activeTab === 'Portrait' && <PortraitTab profile={profile} memoryStats={memoryStats} />}
        {activeTab === 'Personality' && <PersonalityTab data={profile.personality_dimensions} />}
        {activeTab === 'Communication' && <CommunicationTab data={profile.communication_patterns} />}
        {activeTab === 'Emotions' && <EmotionsTab data={profile.emotional_landscape} />}
        {activeTab === 'Values' && <ValuesTab data={profile.values_hierarchy} />}
        {activeTab === 'Relationships' && <RelationshipsTab data={profile.relational_dynamics} />}
        {activeTab === 'Cognition' && <CognitionTab data={profile.cognitive_tendencies} />}
        {activeTab === 'Growth' && <GrowthTab data={profile.growth_edges} />}
        {activeTab === 'Shadow' && <ShadowTab data={profile.shadow_patterns} />}
      </div>
    </div>
  );
}

/* ─── Portrait Tab ─── */
function PortraitTab({ profile, memoryStats }: { profile: Profile; memoryStats: MemoryStats | null }) {
  return (
    <div className="space-y-6">
      {/* Identity Narrative */}
      {profile.identity_narrative && (
        <div style={{ padding: '20px 24px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <div className="text-[10px] uppercase font-medium mb-3" style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}>Identity Portrait</div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-body)', fontStyle: 'italic', lineHeight: '1.8' }}>
            "{profile.identity_narrative}"
          </p>
        </div>
      )}

      {/* Quick Stats Grid */}
      {memoryStats && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard label="Memories" value={memoryStats.total} />
          <StatCard label="Avg Confidence" value={`${(memoryStats.avgConfidence * 100).toFixed(0)}%`} />
          <StatCard label="Memory Types" value={Object.keys(memoryStats.byType).length} />
          <StatCard label="Tags Tracked" value={memoryStats.topTags.length} />
        </div>
      )}

      {/* Memory Type Breakdown */}
      {memoryStats && Object.keys(memoryStats.byType).length > 0 && (
        <Card title="Memory Distribution">
          {Object.entries(memoryStats.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex items-center gap-3 mb-2">
                <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 90, textTransform: 'capitalize' }}>{type}</span>
                <div style={{ flex: 1, height: 3, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(count / memoryStats.total) * 100}%`, height: '100%', background: 'var(--luca)', opacity: 0.4, borderRadius: 2, transition: 'width 600ms ease' }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 28, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
        </Card>
      )}

      {/* Top Tags */}
      {memoryStats && memoryStats.topTags.length > 0 && (
        <Card title="Recurring Themes">
          <div className="flex flex-wrap gap-1.5">
            {memoryStats.topTags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Big Five Quick View */}
      {profile.personality_dimensions?.big_five && (
        <Card title="Big Five — At a Glance">
          {Object.entries(profile.personality_dimensions.big_five).map(([trait, data]: [string, any]) => (
            <DimensionBar key={trait} label={trait} value={data?.score ?? 50} max={100} />
          ))}
        </Card>
      )}
    </div>
  );
}

/* ─── Personality Tab ─── */
function PersonalityTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="personality dimensions" />;

  return (
    <div className="space-y-6">
      {/* Big Five */}
      {data.big_five && (
        <Card title="Big Five Personality Dimensions">
          {Object.entries(data.big_five).map(([trait, info]: [string, any]) => (
            <div key={trait} className="mb-4">
              <DimensionBar label={trait} value={info?.score ?? 50} max={100} />
              {info?.evidence && (
                <div className="text-[11px] mt-1 pl-1" style={{ color: 'var(--text-ghost)', lineHeight: 1.5 }}>
                  {info.evidence}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Attachment Style */}
      {data.attachment_style && (
        <Card title="Attachment Style">
          <div className="text-[13px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {data.attachment_style.primary}
          </div>
          {data.attachment_style.evidence && (
            <div className="text-[11px]" style={{ color: 'var(--text-ghost)', lineHeight: 1.6 }}>
              {data.attachment_style.evidence}
            </div>
          )}
        </Card>
      )}

      {/* Other dimensions */}
      {data.cognitive_style && <InsightCard label="Cognitive Style" text={data.cognitive_style} />}
      {data.locus_of_control && <InsightCard label="Locus of Control" text={data.locus_of_control} />}
    </div>
  );
}

/* ─── Communication Tab ─── */
function CommunicationTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="communication patterns" />;

  return (
    <div className="space-y-4">
      {data.vocabulary_richness && <InsightCard label="Vocabulary Richness" text={data.vocabulary_richness} />}
      {data.humor_style && <InsightCard label="Humor Style" text={data.humor_style} />}
      {data.hedging_frequency && <InsightCard label="Hedging Frequency" text={data.hedging_frequency} />}
      {data.assertion_strength && <InsightCard label="Assertion Strength" text={data.assertion_strength} />}
      {data.emotional_vocabulary_range && <InsightCard label="Emotional Vocabulary Range" text={data.emotional_vocabulary_range} />}
      {data.unique_signatures?.length > 0 && (
        <Card title="Unique Verbal Signatures">
          <ul className="space-y-1.5">
            {data.unique_signatures.map((sig: string, i: number) => (
              <li key={i} className="text-[11px] flex items-start gap-2" style={{ color: 'var(--text-soft)' }}>
                <span style={{ color: 'var(--luca)', opacity: 0.5, marginTop: 2 }}>·</span>
                <span style={{ lineHeight: 1.5 }}>{sig}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ─── Emotions Tab ─── */
function EmotionsTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="emotional landscape" />;

  return (
    <div className="space-y-4">
      {data.baseline_mood && <InsightCard label="Baseline Mood" text={data.baseline_mood} />}
      {data.emotional_range && <InsightCard label="Emotional Range" text={data.emotional_range} />}
      {data.regulation_style && <InsightCard label="Regulation Style" text={data.regulation_style} />}
      {data.granularity && <InsightCard label="Emotional Granularity" text={data.granularity} />}
      {data.triggers?.length > 0 && (
        <Card title="Emotional Triggers">
          <TagList items={data.triggers} />
        </Card>
      )}
      {data.coping_mechanisms?.length > 0 && (
        <Card title="Coping Mechanisms">
          <TagList items={data.coping_mechanisms} />
        </Card>
      )}
    </div>
  );
}

/* ─── Values Tab ─── */
function ValuesTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="values hierarchy" />;

  return (
    <div className="space-y-4">
      {data.ranked_values?.length > 0 && (
        <Card title="Values Hierarchy">
          {data.ranked_values.map((v: any, i: number) => (
            <div key={i} className="mb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-whisper)', width: 16 }}>#{v.rank || i + 1}</span>
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{v.value}</span>
              </div>
              {v.evidence && (
                <div className="text-[11px] pl-6" style={{ color: 'var(--text-ghost)', lineHeight: 1.5 }}>{v.evidence}</div>
              )}
            </div>
          ))}
        </Card>
      )}
      {data.stated_vs_revealed && <InsightCard label="Stated vs Revealed Preferences" text={data.stated_vs_revealed} />}
      {data.decision_framework && <InsightCard label="Decision Framework" text={data.decision_framework} />}
      {data.temporal_orientation && <InsightCard label="Temporal Orientation" text={data.temporal_orientation} />}
    </div>
  );
}

/* ─── Relationships Tab ─── */
function RelationshipsTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="relational dynamics" />;

  return (
    <div className="space-y-4">
      {data.key_relationships?.length > 0 && (
        <Card title="Key Relationships">
          {data.key_relationships.map((r: any, i: number) => (
            <div key={i} className="mb-3 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px]" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-ghost)' }}>
                {(r.role || '?')[0].toUpperCase()}
              </div>
              <div>
                <div className="text-[11px] font-medium" style={{ color: 'var(--text-soft)', textTransform: 'capitalize' }}>{r.role}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-ghost)', lineHeight: 1.5 }}>{r.dynamic}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
      {data.conflict_style && <InsightCard label="Conflict Style" text={data.conflict_style} />}
      {data.power_orientation && <InsightCard label="Power Orientation" text={data.power_orientation} />}
      {data.intimacy_comfort && <InsightCard label="Intimacy Comfort" text={data.intimacy_comfort} />}
      {data.ai_relationship_style && <InsightCard label="AI Relationship Style" text={data.ai_relationship_style} />}
    </div>
  );
}

/* ─── Cognition Tab ─── */
function CognitionTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="cognitive tendencies" />;

  return (
    <div className="space-y-4">
      {data.thinking_style && <InsightCard label="Thinking Style" text={data.thinking_style} />}
      {data.decision_patterns && <InsightCard label="Decision Patterns" text={data.decision_patterns} />}
      {data.stress_response && <InsightCard label="Stress Response" text={data.stress_response} />}
      {data.biases?.length > 0 && (
        <Card title="Cognitive Biases Observed">
          <TagList items={data.biases} />
        </Card>
      )}
      {data.defense_mechanisms?.length > 0 && (
        <Card title="Defense Mechanisms">
          <TagList items={data.defense_mechanisms} />
        </Card>
      )}
    </div>
  );
}

/* ─── Growth Tab ─── */
function GrowthTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="growth edges" />;

  return (
    <div className="space-y-4">
      {data.active_growth?.length > 0 && (
        <Card title="Active Growth Areas">
          <BulletList items={data.active_growth} color="var(--guardian)" />
        </Card>
      )}
      {data.emerging_awareness?.length > 0 && (
        <Card title="Emerging Awareness">
          <BulletList items={data.emerging_awareness} color="var(--luca)" />
        </Card>
      )}
      {data.integration_opportunities?.length > 0 && (
        <Card title="Integration Opportunities">
          <BulletList items={data.integration_opportunities} color="var(--text-soft)" />
        </Card>
      )}
    </div>
  );
}

/* ─── Shadow Tab ─── */
function ShadowTab({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <EmptySection label="shadow patterns" />;

  return (
    <div className="space-y-4">
      {data.contradictions?.length > 0 && (
        <Card title="Contradictions">
          <BulletList items={data.contradictions} color="#ad5b5b" />
        </Card>
      )}
      {data.blind_spots?.length > 0 && (
        <Card title="Blind Spots">
          <BulletList items={data.blind_spots} color="var(--luca)" />
        </Card>
      )}
      {data.avoidance_patterns?.length > 0 && (
        <Card title="Avoidance Patterns">
          <BulletList items={data.avoidance_patterns} color="var(--text-soft)" />
        </Card>
      )}
      {data.compensatory_behaviors?.length > 0 && (
        <Card title="Compensatory Behaviors">
          <BulletList items={data.compensatory_behaviors} color="var(--guardian)" />
        </Card>
      )}
      {data.unasked_questions?.length > 0 && (
        <Card title="Questions to Sit With">
          <ul className="space-y-2">
            {data.unasked_questions.map((q: string, i: number) => (
              <li key={i} className="text-[12px] italic" style={{ color: 'var(--text-body)', lineHeight: 1.6 }}>
                "{q}"
              </li>
            ))}
          </ul>
        </Card>
      )}
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

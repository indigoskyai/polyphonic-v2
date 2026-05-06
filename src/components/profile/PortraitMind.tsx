/**
 * PortraitMind — Psychological Portrait rendered in the Luca's Mind design language.
 * Reuses the m-* design system classes (folio, hero, panels, grid).
 *
 * Sections:
 *  · Folio strip
 *  · Hero (eyebrow chips + title + lede derived from profile)
 *  · Personality Signature (Big Five radar + readout)        [real]
 *  · Memory Pulse (4 stat cells + 24h arrival sparkline)     [real]
 *  · Identity Portrait (full-width narrative card)           [real]
 *  · Composition (memory taxonomy magnitude bars)            [real]
 *  · Themes (recurring tags)                                 [real]
 */
import { useMemo } from 'react';
import PersonalitySignatureRadar from './PersonalitySignatureRadar';
import MemoryPulseChart from '@/components/mind/MemoryPulseChart';
import { profileText } from '@/lib/profileData';

type Profile = {
  identity_narrative: string | null;
  personality_dimensions: any;
  relational_dynamics: any;
  cognitive_tendencies: any;
  values_hierarchy: any;
  updated_at: string;
  version: number;
};

type MemoryStats = {
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
  avgSharpness: number;
  topTagsWithCount: Array<{ tag: string; count: number; avgConfidence: number }>;
  arrivals: Array<{ at: string; magnitude: number; memoryType?: string }>;
  hourBuckets: number[];
  confidenceTiers: { low: number; mid: number; high: number };
};

type EngramSummary = {
  total: number;
  avgStrength: number;
  avgAccessibility: number;
  byType: Record<string, number>;
};

interface Props {
  profile: Profile;
  memoryStats: MemoryStats | null;
  engramSummary: EngramSummary | null;
}

function score(entry: any): number {
  if (typeof entry === 'number') return entry;
  if (entry && typeof entry === 'object' && typeof entry.score === 'number') return entry.score;
  return 50;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

function timeAgoShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function qualLabel(v: number): string {
  if (v >= 0.66) return 'high';
  if (v >= 0.33) return 'moderate';
  return 'low';
}

/** Build a 96-bucket sparkline from hourBuckets (24) by linear interpolation. */
function buildPulseSeries(hourBuckets: number[]): number[] {
  const max = Math.max(1, ...hourBuckets);
  const norm = hourBuckets.map((c) => c / max);
  const out: number[] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 95) * 23;
    const a = Math.floor(t);
    const b = Math.min(23, a + 1);
    const f = t - a;
    out.push(Math.max(0.04, norm[a] * (1 - f) + norm[b] * f));
  }
  return out;
}

export default function PortraitMind({ profile, memoryStats, engramSummary }: Props) {
  const bf = profile.personality_dimensions?.big_five;

  const traits = useMemo(() => {
    return {
      openness: score(bf?.openness) / 100,
      conscientiousness: score(bf?.conscientiousness) / 100,
      extraversion: score(bf?.extraversion) / 100,
      agreeableness: score(bf?.agreeableness) / 100,
      neuroticism: score(bf?.neuroticism) / 100,
    };
  }, [bf]);

  const attachmentLabel: string | undefined =
    profileText(profile.relational_dynamics?.attachment_style?.primary)
    || profileText(profile.personality_dimensions?.attachment_style?.primary)
    || undefined;
  const cognitiveStyle: string | undefined =
    profileText(profile.cognitive_tendencies?.thinking_style).split(/[:.]/)[0]?.trim()
    || profileText(profile.cognitive_tendencies?.style)
    || undefined;

  const dominantTrait = useMemo(() => {
    const entries = Object.entries(traits) as Array<[keyof typeof traits, number]>;
    return entries.sort((a, b) => b[1] - a[1])[0];
  }, [traits]);

  // Memory pulse stats
  const totalMem = memoryStats?.total ?? 0;
  const engramCount = engramSummary?.total ?? 0;
  const themesCount = memoryStats?.topTagsWithCount.length ?? 0;
  const avgConf = memoryStats?.avgConfidence ?? 0;

  const pulseSeries = useMemo(
    () => buildPulseSeries(memoryStats?.hourBuckets ?? new Array(24).fill(0)),
    [memoryStats?.hourBuckets],
  );

  const memoryTypeData = useMemo(() => {
    if (!memoryStats) return [];
    const max = Math.max(1, ...Object.values(memoryStats.byType));
    return Object.entries(memoryStats.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value, pct: value / max }));
  }, [memoryStats]);

  const themes = memoryStats?.topTagsWithCount.slice(0, 12) ?? [];
  const themeMax = Math.max(1, ...themes.map((t) => t.count));

  return (
    <main className="m-main">
      {/* Folio */}
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> luca</span>
          <span>view · <span className="v">profile</span></span>
          <span>portrait · v{profile.version ?? 1}</span>
        </div>
        <div className="r2-folio-right">
          <span>synced · <span className="v">{timeAgoShort(profile.updated_at)}</span></span>
          <span>{fmtClock()}</span>
        </div>
      </div>

      {/* Hero */}
      <div className="m-hero">
        <div className="m-hero-eye">
          <span className="num"># 05</span>
          <span>·</span>
          <span className="v">Psychological portrait</span>
          <span>·</span>
          <span>v{profile.version ?? 1}</span>
          <span>·</span>
          <span className="live">profile current</span>
        </div>
        <h1 className="m-hero-title">Your portrait</h1>
        <p className="m-hero-sub">
          <span className="accent">
            {dominantTrait ? `${capitalize(dominantTrait[0])} ${qualLabel(dominantTrait[1])}.` : 'Signature forming.'}
          </span>{' '}
          {totalMem} memories synthesized into {engramCount} engrams.
          {attachmentLabel ? ` Attachment reads ${String(attachmentLabel).toLowerCase()}.` : ''}
          {cognitiveStyle ? ` Cognition is ${String(cognitiveStyle).toLowerCase()}.` : ''}
        </p>
      </div>

      <div className="m-grid">
        {/* Personality Signature */}
        <div className="m-panel m-p-state">
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">i</span> Personality signature</div>
            <div className="m-panel-aside">5 traits · <span className="v">big five</span></div>
          </div>
          <div className="m-state-body">
            <div className="m-state-svg-wrap">
              <PersonalitySignatureRadar values={traits} />
            </div>
            <div className="m-state-readout">
              <p className="m-state-whisper">
                <span className="qual">{capitalize(dominantTrait?.[0] ?? 'openness')} {qualLabel(dominantTrait?.[1] ?? 0.5)}</span>
                {attachmentLabel && <>, <span className="qual">{String(attachmentLabel).toLowerCase()}</span></>}
                {cognitiveStyle && <>, {String(cognitiveStyle).toLowerCase()}</>}.
              </p>
              <div className="m-state-row"><span>Openness</span><span className="v">{traits.openness.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Conscientious</span><span className="v">{traits.conscientiousness.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Extraversion</span><span className="v">{traits.extraversion.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Agreeableness</span><span className="v">{traits.agreeableness.toFixed(2)}</span></div>
              <div className="m-state-row"><span>Neuroticism</span><span className="v">{traits.neuroticism.toFixed(2)}</span></div>
              <div className="m-state-row" style={{ paddingTop: 8, borderTop: '1px solid var(--hairline)', marginTop: 4 }}>
                <span>Profile</span><span className="m-state-tick">v{profile.version ?? 1}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Memory Pulse */}
        <div className="m-panel m-p-pulse">
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">ii</span> Memory corpus</div>
            <div className="m-panel-aside">activity · <span className="v">last 24h</span></div>
          </div>
          <div className="m-pulse-body">
            <div className="m-pulse-stats">
              <div className="m-pulse-stat">
                <div className="m-pulse-num">
                  {totalMem >= 1000 ? <>{(totalMem / 1000).toFixed(1)}<span className="unit">k</span></> : totalMem}
                </div>
                <div className="m-pulse-label">Memories</div>
              </div>
              <div className="m-pulse-stat">
                <div className="m-pulse-num">{engramCount}</div>
                <div className="m-pulse-label">Engrams</div>
              </div>
              <div className="m-pulse-stat">
                <div className="m-pulse-num">{themesCount}</div>
                <div className="m-pulse-label">Themes</div>
              </div>
              <div className="m-pulse-stat">
                <div className="m-pulse-num">{Math.round(avgConf * 100)}<span className="unit">%</span></div>
                <div className="m-pulse-label">Confidence</div>
              </div>
            </div>
            <div className="m-pulse-eye">Memory arrivals over 24h · diurnal rhythm</div>
            <div className="m-pulse-svg-wrap">
              <MemoryPulseChart values={pulseSeries} />
            </div>
            <div className="m-pulse-foot">
              <span>Sharpness · <span className="v">{(memoryStats?.avgSharpness ?? 0).toFixed(2)}</span></span>
              <span>High-conf · <span className="v">{memoryStats?.confidenceTiers.high ?? 0}</span></span>
              <span>Engram strength · <span className="v">{(engramSummary?.avgStrength ?? 0).toFixed(2)}</span></span>
            </div>
          </div>
        </div>

        {/* Identity Portrait — full width */}
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">iii</span> Identity portrait</div>
            <div className="m-panel-aside">synthesized · <span className="v">{timeAgoShort(profile.updated_at)}</span></div>
          </div>
          {profile.identity_narrative ? (
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.7,
              color: 'var(--text-primary)',
              letterSpacing: 'var(--track-body)',
              margin: 0,
              maxWidth: 920,
            }}>
              {profile.identity_narrative}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-ghost)', fontStyle: 'italic', margin: 0 }}>
              Identity portrait pending — generate to render the narrative.
            </p>
          )}
        </div>

        {/* Composition — memory taxonomy */}
        <div className="m-panel" style={{ gridColumn: 'span 7' }}>
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">iv</span> Memory composition</div>
            <div className="m-panel-aside"><span className="v">{Object.keys(memoryStats?.byType ?? {}).length}</span> types</div>
          </div>
          {memoryTypeData.length === 0 ? (
            <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-ghost)' }}>No taxonomy yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {memoryTypeData.map((row) => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 48px', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-soft)',
                    letterSpacing: 'var(--track-meta)',
                    textTransform: 'uppercase',
                  }}>{row.label}</div>
                  <div style={{ position: 'relative', height: 6, background: 'var(--hairline)', borderRadius: 2 }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${row.pct * 100}%`,
                      background: 'rgba(244, 243, 240, 0.55)',
                      borderRadius: 2,
                    }} />
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Themes */}
        <div className="m-panel" style={{ gridColumn: 'span 5' }}>
          <div className="m-panel-head">
            <div className="m-panel-eye"><span className="num">v</span> Recurring themes</div>
            <div className="m-panel-aside"><span className="v">{themes.length}</span> top</div>
          </div>
          {themes.length === 0 ? (
            <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-ghost)' }}>Themes will surface as memories accumulate.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
              {themes.map((t) => {
                const intensity = 0.4 + (t.count / themeMax) * 0.55;
                return (
                  <span
                    key={t.tag}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10 + (t.count / themeMax) * 4,
                      color: `rgba(244, 243, 240, ${intensity})`,
                      letterSpacing: '0.04em',
                      padding: '4px 9px',
                      border: '1px solid var(--hairline)',
                      borderRadius: 999,
                    }}
                  >
                    {t.tag}
                    <span style={{
                      marginLeft: 6,
                      color: 'var(--text-whisper)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{t.count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

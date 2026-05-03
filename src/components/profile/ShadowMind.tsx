/**
 * ShadowMind — Shadow tab in the Luca's Mind design language.
 * Reads from psychological_profile.shadow_patterns (JSONB) +
 * memoryStats.byTagNorm + values_hierarchy for divergence signal.
 */
import { useMemo } from 'react';
import ProfileMindShell, { timeAgoShort } from './ProfileMindShell';
import { QuoteCard, PanelHead, Empty, TagCloud, DivergenceRow } from './mindViz';

type Data = {
  contradictions?: string[];
  blind_spots?: string[];
  avoidance_patterns?: string[];
  compensatory_behaviors?: string[];
  unasked_questions?: string[];
  [k: string]: any;
};

type MemoryStats = { byTagNorm: Record<string, number>; [k: string]: any };

interface Props {
  data: Data | null | undefined;
  memoryStats: MemoryStats | null;
  updatedAt?: string;
  version?: number;
}

function tagMatchScore(spot: string, byTagNorm: Record<string, number>): number {
  if (!spot || !byTagNorm) return 0;
  const tokens = spot.toLowerCase().split(/[\s/,_\-.]+/).filter(t => t.length >= 4);
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

function shorten(s: string, n = 80) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

export default function ShadowMind({ data, memoryStats, updatedAt, version }: Props) {
  const contradictions = data?.contradictions ?? [];
  const blindSpots = data?.blind_spots ?? [];
  const avoidance = data?.avoidance_patterns ?? [];
  const compensatory = data?.compensatory_behaviors ?? [];
  const questions = data?.unasked_questions ?? [];

  const divergenceItems = useMemo(() => {
    if (!memoryStats || !blindSpots.length) return [];
    return blindSpots.slice(0, 4).map(spot => ({
      label: shorten(spot, 60),
      stated: 0.5,
      revealed: tagMatchScore(spot, memoryStats.byTagNorm),
    }));
  }, [blindSpots, memoryStats]);

  const meanDelta = divergenceItems.length
    ? divergenceItems.reduce((s, d) => s + (d.revealed - d.stated), 0) / divergenceItems.length
    : 0;

  const total = contradictions.length + blindSpots.length + avoidance.length + compensatory.length + questions.length;

  return (
    <ProfileMindShell
      num="13"
      eyebrow="Shadow"
      title="What sits in the dark"
      version={version}
      updatedAt={updatedAt}
      sub={
        total
          ? <><span className="accent">Tension is information.</span> Contradictions, blind spots, avoidances, and the questions still unasked.</>
          : <>Shadow material forming.</>
      }
    >
      {/* i — Contradictions */}
      <div className="m-panel" style={{ gridColumn: 'span 6' }}>
        <PanelHead num="i" label="Contradictions" aside={<><span className="v">{contradictions.length}</span></>} />
        {contradictions.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            {contradictions.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'baseline' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
                  fontVariantNumeric: 'tabular-nums', paddingTop: 2,
                }}>{String(i + 1).padStart(2, '0')}.</div>
                <QuoteCard body={c} />
              </div>
            ))}
          </div>
        ) : (
          <Empty note="No contradictions surfaced." />
        )}
      </div>

      {/* ii — Blind spots */}
      <div className="m-panel" style={{ gridColumn: 'span 6' }}>
        <PanelHead num="ii" label="Blind spots" aside={<><span className="v">{blindSpots.length}</span></>} />
        {blindSpots.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            {blindSpots.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'baseline' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
                  fontVariantNumeric: 'tabular-nums', paddingTop: 2,
                }}>{String(i + 1).padStart(2, '0')}.</div>
                <QuoteCard body={s} />
              </div>
            ))}
          </div>
        ) : (
          <Empty note="No blind spots flagged yet." />
        )}
      </div>

      {/* iii — Signal map */}
      {divergenceItems.length > 0 && (
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <PanelHead
            num="iii"
            label="Signal map"
            aside={<>μΔ · <span className="v">{(meanDelta >= 0 ? '+' : '−') + Math.abs(meanDelta).toFixed(2)}</span></>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
            {divergenceItems.map((d, i) => (
              <DivergenceRow key={i} label={d.label} stated={d.stated} revealed={d.revealed} />
            ))}
            <div style={{
              marginTop: 10,
              fontFamily: 'var(--font-mono)', fontSize: 8,
              color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
              textTransform: 'uppercase',
            }}>
              Stated baseline · revealed from tagged memory frequency
            </div>
          </div>
        </div>
      )}

      {/* iv — Avoidance */}
      <div className="m-panel" style={{ gridColumn: 'span 6' }}>
        <PanelHead num="iv" label="Avoidance" aside={<><span className="v">{avoidance.length}</span></>} />
        {avoidance.length ? (
          <TagCloud items={avoidance.map(s => ({ label: shorten(s, 40) }))} />
        ) : (
          <Empty note="No avoidance patterns." />
        )}
      </div>

      {/* v — Compensatory */}
      <div className="m-panel" style={{ gridColumn: 'span 6' }}>
        <PanelHead num="v" label="Compensatory" aside={<><span className="v">{compensatory.length}</span></>} />
        {compensatory.length ? (
          <TagCloud items={compensatory.map(s => ({ label: shorten(s, 40) }))} />
        ) : (
          <Empty note="No compensatory behaviors." />
        )}
      </div>

      {/* vi — Questions */}
      {questions.length > 0 && (
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <PanelHead num="vi" label="Questions to sit with" aside={<>updated · <span className="v">{timeAgoShort(updatedAt)}</span></>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {questions.map((q, i) => (
              <QuoteCard key={i} eyebrow={`Q · ${String(i + 1).padStart(2, '0')}`} body={`"${q}"`} />
            ))}
          </div>
        </div>
      )}
    </ProfileMindShell>
  );
}

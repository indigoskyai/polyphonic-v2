/**
 * ValuesMind — Values tab in the Luca's Mind design language.
 * Reads from psychological_profile.values_hierarchy + memoryStats.byTagNorm.
 */
import { useMemo } from 'react';
import ProfileMindShell, { timeAgoShort } from './ProfileMindShell';
import { QuoteCard, PanelHead, Empty, DivergenceRow } from './mindViz';

type RankedValue = { value: string; rank?: number; evidence?: string };

type ValuesData = {
  ranked_values?: RankedValue[];
  stated_vs_revealed?: string;
  decision_framework?: string;
  temporal_orientation?: string;
  [k: string]: any;
};

type MemoryStats = {
  byTagNorm: Record<string, number>;
  [k: string]: any;
};

interface Props {
  data: ValuesData | null | undefined;
  memoryStats: MemoryStats | null;
  updatedAt?: string;
  version?: number;
}

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

export default function ValuesMind({ data, memoryStats, updatedAt, version }: Props) {
  const ranked: RankedValue[] = data?.ranked_values ?? [];
  const top = ranked[0]?.value;

  const divergenceItems = useMemo(() => {
    if (!memoryStats || !ranked.length) return [];
    return ranked.slice(0, 3).map((v, i) => {
      const stated = ranked.length > 1 ? 1 - (i / Math.min(ranked.length, 5)) : 1;
      const revealed = tagMatchScore(v.value || '', memoryStats.byTagNorm);
      return { label: v.value, stated, revealed };
    });
  }, [ranked, memoryStats]);

  const meanDelta = divergenceItems.length
    ? divergenceItems.reduce((s, d) => s + (d.revealed - d.stated), 0) / divergenceItems.length
    : 0;

  return (
    <ProfileMindShell
      num="09"
      eyebrow="Values"
      title="What you hold"
      version={version}
      updatedAt={updatedAt}
      sub={
        ranked.length
          ? <><span className="accent">{top}</span> tops a hierarchy of {ranked.length}.{' '}Stated rank measured against revealed memory signal.</>
          : <>Values hierarchy forming as evidence accumulates.</>
      }
    >
      {/* i — Hierarchy */}
      <div className="m-panel" style={{ gridColumn: 'span 7' }}>
        <PanelHead num="i" label="Hierarchy" aside={<><span className="v">{ranked.length}</span> ranked</>} />
        {ranked.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {ranked.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'baseline' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
                  fontVariantNumeric: 'tabular-nums', paddingTop: 2,
                }}>
                  {String(v.rank ?? i + 1).padStart(2, '0')}.
                </div>
                <QuoteCard eyebrow={v.value} body={v.evidence ?? '—'} />
              </div>
            ))}
          </div>
        ) : (
          <Empty note="No ranked values yet." />
        )}
      </div>

      {/* ii — Stated vs revealed */}
      <div className="m-panel" style={{ gridColumn: 'span 5' }}>
        <PanelHead
          num="ii"
          label="Stated vs revealed"
          aside={<>μΔ · <span className="v">{(meanDelta >= 0 ? '+' : '−') + Math.abs(meanDelta).toFixed(2)}</span></>}
        />
        {divergenceItems.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
            {divergenceItems.map(d => (
              <DivergenceRow key={d.label} label={d.label} stated={d.stated} revealed={d.revealed} />
            ))}
            <div style={{
              marginTop: 10,
              fontFamily: 'var(--font-mono)', fontSize: 8,
              color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
              textTransform: 'uppercase',
            }}>
              Stated from rank · revealed from tagged memory frequency
            </div>
          </div>
        ) : (
          <Empty note="Need memory signal to compare." />
        )}
      </div>

      {/* iii — Decision architecture */}
      {(data?.stated_vs_revealed || data?.decision_framework || data?.temporal_orientation) && (
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <PanelHead num="iii" label="Decision architecture" aside={<>updated · <span className="v">{timeAgoShort(updatedAt)}</span></>} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, paddingTop: 4 }}>
            {data?.stated_vs_revealed && <QuoteCard eyebrow="Stated vs revealed" body={data.stated_vs_revealed} />}
            {data?.decision_framework && <QuoteCard eyebrow="Framework" body={data.decision_framework} />}
            {data?.temporal_orientation && <QuoteCard eyebrow="Temporal orientation" body={data.temporal_orientation} />}
          </div>
        </div>
      )}
    </ProfileMindShell>
  );
}

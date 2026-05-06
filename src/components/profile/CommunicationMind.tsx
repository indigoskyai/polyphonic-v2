/**
 * CommunicationMind — Communication tab in the Luca's Mind design language.
 * Reads from psychological_profile.communication_patterns (JSONB).
 */
import { useMemo } from 'react';
import ProfileMindShell, { timeAgoShort } from './ProfileMindShell';
import { TraitBar, TagCloud, QuoteCard, RadarMini, PanelHead, Empty, inferIntensity, qualLabel } from './mindViz';
import { asProfileRecord, profileTagItems, profileText } from '@/lib/profileData';

type Data = {
  vocabulary_richness?: string;
  humor_style?: string;
  hedging_frequency?: string;
  assertion_strength?: string;
  emotional_vocabulary_range?: string;
  unique_signatures?: string[];
  [k: string]: any;
};

const AXES = [
  { key: 'vocabulary_richness', label: 'Vocab' },
  { key: 'humor_style', label: 'Humor' },
  { key: 'assertion_strength', label: 'Assertion' },
  { key: 'emotional_vocabulary_range', label: 'Emotion' },
  { key: 'hedging_frequency', label: 'Hedging' },
];

interface Props { data: Data | null | undefined; updatedAt?: string; version?: number; }

export default function CommunicationMind({ data, updatedAt, version }: Props) {
  const record = useMemo(() => asProfileRecord(data), [data]);
  const signatures = useMemo(() => profileTagItems(record.unique_signatures), [record]);

  const inferred = useMemo(() => {
    const out: Record<string, number> = {};
    let any = false;
    for (const a of AXES) {
      const v = inferIntensity(profileText(record[a.key]));
      out[a.key] = v ?? 0.5;
      if (v !== null) any = true;
    }
    return { values: out, any };
  }, [record]);

  const dominant = useMemo(() => {
    const sorted = Object.entries(inferred.values).sort((a, b) => b[1] - a[1]);
    return sorted[0];
  }, [inferred]);

  const dominantLabel = AXES.find(a => a.key === dominant?.[0])?.label ?? '—';

  return (
    <ProfileMindShell
      num="06"
      eyebrow="Communication"
      title="How you speak"
      version={version}
      updatedAt={updatedAt}
      sub={
        <>
          <span className="accent">{dominantLabel} reads {qualLabel(dominant?.[1] ?? 0.5)}.</span>{' '}
          Five-axis verbal fingerprint inferred from prose dimensions.
        </>
      }
    >
      {/* Style signature */}
      <div className="m-panel m-p-state">
        <PanelHead num="i" label="Style signature" aside={<>5 axes · <span className="v">verbal</span></>} />
        <div className="m-state-body">
          <div className="m-state-svg-wrap">
            <RadarMini
              axes={AXES.map(a => ({ key: a.key, label: a.label }))}
              values={inferred.values}
            />
          </div>
          <div className="m-state-readout">
            <p className="m-state-whisper">
              <span className="qual">{dominantLabel} {qualLabel(dominant?.[1] ?? 0.5)}</span>.{' '}
              Inferred heuristically from prose dimensions — directional, not calibrated.
            </p>
            {AXES.map(a => (
              <div key={a.key} className="m-state-row">
                <span>{a.label}</span><span className="v">{(inferred.values[a.key]).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Patterns — prose readouts as TraitBars + extracts */}
      <div className="m-panel" style={{ gridColumn: 'span 7' }}>
        <PanelHead num="ii" label="Patterns" aside={<><span className="v">{AXES.filter(a => profileText(record[a.key])).length}</span> dimensions</>} />
        {AXES.every(a => !profileText(record[a.key])) ? (
          <Empty note="Communication patterns forming." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AXES.map(a => profileText(record[a.key]) ? (
              <TraitBar key={a.key} label={a.label} value={inferred.values[a.key]} />
            ) : null)}
          </div>
        )}
      </div>

      {/* Verbal signatures cloud */}
      <div className="m-panel" style={{ gridColumn: 'span 5' }}>
        <PanelHead num="iii" label="Verbal signatures" aside={<><span className="v">{signatures.length}</span> phrases</>} />
        {signatures.length ? (
          <TagCloud items={signatures} />
        ) : (
          <Empty note="Verbal tics not yet surfaced." />
        )}
      </div>

      {/* Sample voice — first prose dimension full-width */}
      {profileText(record.vocabulary_richness) && (
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <PanelHead num="iv" label="Voice excerpt" aside={<>vocabulary · <span className="v">{timeAgoShort(updatedAt)}</span></>} />
          <QuoteCard eyebrow="Vocabulary" body={profileText(record.vocabulary_richness)} />
          {profileText(record.assertion_strength) && (
            <div style={{ marginTop: 14 }}>
              <QuoteCard eyebrow="Assertion" body={profileText(record.assertion_strength)} />
            </div>
          )}
        </div>
      )}
    </ProfileMindShell>
  );
}

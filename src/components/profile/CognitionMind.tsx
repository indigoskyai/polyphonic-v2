/**
 * CognitionMind — Cognition tab in the Luca's Mind design language.
 * Reads from psychological_profile.cognitive_tendencies + memoryStats.byType.
 */
import { useMemo } from 'react';
import ProfileMindShell from './ProfileMindShell';
import { TraitBar, MagnitudeRow, TagCloud, QuoteCard, RadarMini, PanelHead, Empty, qualLabel } from './mindViz';
import { asProfileRecord, profileNumberRecord, profileTagItems, profileText } from '@/lib/profileData';

type Data = {
  thinking_style?: string;
  decision_patterns?: string;
  stress_response?: string;
  biases?: string[];
  defense_mechanisms?: string[];
  [k: string]: any;
};

interface Props {
  data: Data | null | undefined;
  byType: Record<string, number> | undefined;
  engramTotal: number | undefined;
  updatedAt?: string;
  version?: number;
}

export default function CognitionMind({ data, byType, engramTotal, updatedAt, version }: Props) {
  const record = useMemo(() => asProfileRecord(data), [data]);
  const counts = useMemo(() => profileNumberRecord(byType), [byType]);
  const get = (k: string) => counts[k] ?? 0;
  const max = Math.max(1, ...Object.values(counts));
  const norm = (raw: number) => Math.min(1, raw / max);

  const bandwidth = useMemo(() => ({
    logic: norm(get('principle') + get('commitment')),
    creativity: norm(get('synthesis') + get('reflection')),
    pattern: norm(get('relationship') + ((engramTotal ?? 0) / 10)),
    memory: norm(get('fact') + get('moment')),
    integration: norm((get('synthesis') + get('reflection')) * 0.7),
    abstract: norm(get('synthesis') + get('reflection') + get('principle') * 0.5),
  }), [counts, engramTotal]);

  const axes = [
    { key: 'logic', label: 'Logic' },
    { key: 'creativity', label: 'Creativity' },
    { key: 'pattern', label: 'Pattern' },
    { key: 'memory', label: 'Memory' },
    { key: 'integration', label: 'Integration' },
    { key: 'abstract', label: 'Abstract' },
  ];

  const dominant = useMemo(() => {
    const entries = Object.entries(bandwidth);
    return entries.sort((a, b) => b[1] - a[1])[0];
  }, [bandwidth]);
  const dominantLabel = axes.find(a => a.key === dominant?.[0])?.label ?? '—';
  const styleSnippet = profileText(record.thinking_style).split(/[:.]/)[0]?.trim();

  const hasSignal = Object.values(counts).some(v => v > 0);
  const biases = profileTagItems(record.biases);
  const defenses = profileTagItems(record.defense_mechanisms);

  return (
    <ProfileMindShell
      num="10"
      eyebrow="Cognition"
      title="How you think"
      version={version}
      updatedAt={updatedAt}
      sub={
        <>
          <span className="accent">{dominantLabel} {qualLabel(dominant?.[1] ?? 0.5)}.</span>{' '}
          {styleSnippet ? `Cognitive style reads ${styleSnippet.toLowerCase()}.` : 'Profile derived from memory composition.'}
        </>
      }
    >
      {/* Cognitive bandwidth radar */}
      <div className="m-panel m-p-state">
        <PanelHead num="i" label="Cognitive bandwidth" aside={<>6 axes · <span className="v">derived</span></>} />
        <div className="m-state-body">
          <div className="m-state-svg-wrap">
            {hasSignal ? (
              <RadarMini axes={axes} values={bandwidth} />
            ) : (
              <Empty note="Bandwidth forming as memories accumulate." />
            )}
          </div>
          <div className="m-state-readout">
            <p className="m-state-whisper">
              <span className="qual">{dominantLabel} dominant</span>. Each axis normalized to your corpus max.
            </p>
            {axes.map(a => (
              <div key={a.key} className="m-state-row">
                <span>{a.label}</span><span className="v">{bandwidth[a.key as keyof typeof bandwidth].toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tendencies — prose excerpts */}
      <div className="m-panel" style={{ gridColumn: 'span 7' }}>
        <PanelHead num="ii" label="Tendencies" aside={<>thinking · decisions · stress</>} />
        {!profileText(record.thinking_style) && !profileText(record.decision_patterns) && !profileText(record.stress_response) ? (
          <Empty note="Cognitive tendencies forming." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profileText(record.thinking_style) && <QuoteCard eyebrow="Thinking" body={profileText(record.thinking_style)} />}
            {profileText(record.decision_patterns) && <QuoteCard eyebrow="Decisions" body={profileText(record.decision_patterns)} />}
            {profileText(record.stress_response) && <QuoteCard eyebrow="Stress response" body={profileText(record.stress_response)} />}
          </div>
        )}
      </div>

      {/* Memory taxonomy as MagnitudeRows */}
      <div className="m-panel" style={{ gridColumn: 'span 5' }}>
        <PanelHead num="iii" label="Mental allocation" aside={<><span className="v">{Object.keys(counts).length}</span> types</>} />
        {!hasSignal ? (
          <Empty note="No taxonomy yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => (
              <MagnitudeRow key={label} label={label} value={value} max={max} />
            ))}
          </div>
        )}
      </div>

      {/* Biases */}
      <div className="m-panel" style={{ gridColumn: 'span 6' }}>
        <PanelHead num="iv" label="Cognitive biases" aside={<><span className="v">{biases.length}</span> observed</>} />
        {biases.length ? (
          <TagCloud items={biases} />
        ) : (
          <Empty note="Biases not yet identified." />
        )}
      </div>

      {/* Defenses */}
      <div className="m-panel" style={{ gridColumn: 'span 6' }}>
        <PanelHead num="v" label="Defense mechanisms" aside={<><span className="v">{defenses.length}</span> patterns</>} />
        {defenses.length ? (
          <TagCloud items={defenses} />
        ) : (
          <Empty note="Defenses not yet surfaced." />
        )}
      </div>
    </ProfileMindShell>
  );
}

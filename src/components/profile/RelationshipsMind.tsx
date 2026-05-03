/**
 * RelationshipsMind — Relationships tab in the Luca's Mind design language.
 * Reads from psychological_profile.relational_dynamics (JSONB).
 */
import ProfileMindShell, { timeAgoShort } from './ProfileMindShell';
import { QuoteCard, PanelHead, Empty } from './mindViz';

type KeyRelationship = { role?: string; dynamic?: string };

type Data = {
  key_relationships?: KeyRelationship[];
  conflict_style?: string;
  power_orientation?: string;
  intimacy_comfort?: string;
  ai_relationship_style?: string;
  [k: string]: any;
};

interface Props { data: Data | null | undefined; updatedAt?: string; version?: number; }

const DIMS: Array<{ key: keyof Data; label: string }> = [
  { key: 'conflict_style', label: 'Conflict' },
  { key: 'power_orientation', label: 'Power' },
  { key: 'intimacy_comfort', label: 'Intimacy' },
  { key: 'ai_relationship_style', label: 'AI relationships' },
];

export default function RelationshipsMind({ data, updatedAt, version }: Props) {
  const rels: KeyRelationship[] = data?.key_relationships ?? [];
  const dimsPresent = DIMS.filter(d => typeof data?.[d.key] === 'string' && data[d.key]);

  return (
    <ProfileMindShell
      num="11"
      eyebrow="Relationships"
      title="How you bond"
      version={version}
      updatedAt={updatedAt}
      sub={
        rels.length
          ? <><span className="accent">{rels.length} relational categories</span> with distinct dynamics. {dimsPresent.length} cross-cutting patterns observed.</>
          : <>Relational map forming.</>
      }
    >
      {/* i — Key relationships */}
      <div className="m-panel" style={{ gridColumn: 'span 7' }}>
        <PanelHead num="i" label="Key relationships" aside={<><span className="v">{rels.length}</span> roles</>} />
        {rels.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {rels.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'baseline' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
                  fontVariantNumeric: 'tabular-nums', paddingTop: 2,
                }}>
                  {String(i + 1).padStart(2, '0')}.
                </div>
                <QuoteCard eyebrow={r.role ?? '—'} body={r.dynamic ?? '—'} />
              </div>
            ))}
          </div>
        ) : (
          <Empty note="No relational categories yet." />
        )}
      </div>

      {/* ii — Patterns */}
      <div className="m-panel" style={{ gridColumn: 'span 5' }}>
        <PanelHead num="ii" label="Patterns" aside={<><span className="v">{dimsPresent.length}</span> dimensions</>} />
        {dimsPresent.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {dimsPresent.map(d => (
              <QuoteCard key={String(d.key)} eyebrow={d.label} body={String(data![d.key])} />
            ))}
          </div>
        ) : (
          <Empty note="Cross-cutting patterns forming." />
        )}
      </div>

      {data?.ai_relationship_style && (
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <PanelHead num="iii" label="Relationship with AI" aside={<>updated · <span className="v">{timeAgoShort(updatedAt)}</span></>} />
          <QuoteCard eyebrow="Stance" body={data.ai_relationship_style} />
        </div>
      )}
    </ProfileMindShell>
  );
}

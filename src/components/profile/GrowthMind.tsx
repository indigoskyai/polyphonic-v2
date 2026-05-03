/**
 * GrowthMind — Growth tab in the Luca's Mind design language.
 * Reads from psychological_profile.growth_edges (JSONB).
 */
import ProfileMindShell, { timeAgoShort } from './ProfileMindShell';
import { QuoteCard, PanelHead, Empty, MagnitudeRow } from './mindViz';

type Data = {
  active_growth?: string[];
  emerging_awareness?: string[];
  integration_opportunities?: string[];
  [k: string]: any;
};

interface Props { data: Data | null | undefined; updatedAt?: string; version?: number; }

function RankedColumn({ items }: { items: string[] }) {
  if (!items?.length) return <Empty note="Nothing here yet." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
      {items.map((s, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'baseline' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-whisper)', letterSpacing: 'var(--track-meta)',
            fontVariantNumeric: 'tabular-nums', paddingTop: 2,
          }}>
            {String(i + 1).padStart(2, '0')}.
          </div>
          <QuoteCard body={s} />
        </div>
      ))}
    </div>
  );
}

export default function GrowthMind({ data, updatedAt, version }: Props) {
  const active = data?.active_growth ?? [];
  const emerging = data?.emerging_awareness ?? [];
  const integration = data?.integration_opportunities ?? [];
  const total = active.length + emerging.length + integration.length;
  const max = Math.max(1, active.length, emerging.length, integration.length);

  return (
    <ProfileMindShell
      num="12"
      eyebrow="Growth"
      title="Where you're stretching"
      version={version}
      updatedAt={updatedAt}
      sub={
        total
          ? <><span className="accent">{total} edges in motion</span>. Active work, emerging awareness, and integration opportunities tracked separately.</>
          : <>Growth edges forming as the corpus deepens.</>
      }
    >
      {/* i — Distribution */}
      {total > 0 && (
        <div className="m-panel" style={{ gridColumn: 'span 12' }}>
          <PanelHead num="i" label="Distribution" aside={<>updated · <span className="v">{timeAgoShort(updatedAt)}</span></>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
            <MagnitudeRow label="Active" value={active.length} max={max} />
            <MagnitudeRow label="Emerging" value={emerging.length} max={max} />
            <MagnitudeRow label="Integration" value={integration.length} max={max} />
          </div>
        </div>
      )}

      <div className="m-panel" style={{ gridColumn: 'span 4' }}>
        <PanelHead num="ii" label="Active" aside={<><span className="v">{active.length}</span></>} />
        <RankedColumn items={active} />
      </div>
      <div className="m-panel" style={{ gridColumn: 'span 4' }}>
        <PanelHead num="iii" label="Emerging" aside={<><span className="v">{emerging.length}</span></>} />
        <RankedColumn items={emerging} />
      </div>
      <div className="m-panel" style={{ gridColumn: 'span 4' }}>
        <PanelHead num="iv" label="Integration" aside={<><span className="v">{integration.length}</span></>} />
        <RankedColumn items={integration} />
      </div>
    </ProfileMindShell>
  );
}

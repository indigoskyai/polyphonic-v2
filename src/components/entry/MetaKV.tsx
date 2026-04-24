import type { ReactNode } from 'react';

/** Key-value row for detail panels — mockup `.md-meta-row` pattern. */
export default function MetaKV({ k, v, accent }: { k: string; v: ReactNode; accent?: 'red' | 'amber' | 'green' }) {
  const valueColor =
    accent === 'red' ? 'var(--red-accent)' :
    accent === 'amber' ? 'var(--amber-accent)' :
    accent === 'green' ? 'var(--green-accent)' :
    'var(--text-body)';
  return (
    <div
      className="flex items-center"
      style={{
        justifyContent: 'space-between',
        padding: '4px 0',
        fontSize: 11,
        gap: 12,
      }}
    >
      <span
        style={{
          color: 'var(--text-soft)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: 'var(--track-mono)',
          flexShrink: 0,
        }}
      >
        {k}
      </span>
      <span
        style={{
          color: valueColor,
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 'var(--track-mono)',
          textAlign: 'right',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {v}
      </span>
    </div>
  );
}

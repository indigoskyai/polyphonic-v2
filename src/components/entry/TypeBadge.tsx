/** Small uppercase mono badge for entry type (REFLECTION, FACT, INSIGHT, etc). */
export default function TypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: 'var(--track-mono)',
        textTransform: 'uppercase',
        color: 'var(--text-ghost)',
        background: 'var(--bg-surface)',
        padding: '1px 6px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </span>
  );
}

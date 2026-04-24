/** Inline mono telemetry row — `key: value · key: value · key: value`. */
export type TelemetryItem = { k: string; v: string | number; accent?: 'red' | 'amber' | 'green' };

export default function Telemetry({ items }: { items: TelemetryItem[] }) {
  const rendered = items.filter((i) => i.v !== '' && i.v !== null && i.v !== undefined);
  if (rendered.length === 0) return null;
  return (
    <div
      className="flex items-center flex-wrap"
      style={{
        gap: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 'var(--track-mono)',
      }}
    >
      {rendered.map((it, i) => {
        const valueColor =
          it.accent === 'red' ? 'var(--red-accent)' :
          it.accent === 'amber' ? 'var(--amber-accent)' :
          it.accent === 'green' ? 'var(--green-accent)' :
          'var(--text-body)';
        return (
          <span key={i} style={{ display: 'inline-flex', gap: 4 }}>
            <span style={{ color: 'var(--text-ghost)' }}>{it.k}:</span>
            <span style={{ color: valueColor, fontVariantNumeric: 'tabular-nums' }}>{it.v}</span>
          </span>
        );
      })}
    </div>
  );
}

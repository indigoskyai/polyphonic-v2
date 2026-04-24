/** Mono numeric chip for 0.00-1.00 values (salience, confidence, strength). */
export default function ScoreChip({ value, decimals = 2 }: { value: number | null | undefined; decimals?: number }) {
  if (value == null || Number.isNaN(value)) return null;
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-whisper)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 'var(--track-mono)',
      }}
    >
      {value.toFixed(decimals)}
    </span>
  );
}

import { timeAgo } from '@/lib/time';

/** Mono time-ago chip — "12m", "3h", "5d". */
export default function TimeAgoChip({ date }: { date: string | Date | null | undefined }) {
  if (!date) return null;
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-whisper)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 'var(--track-mono)',
        whiteSpace: 'nowrap',
      }}
    >
      {timeAgo(date)}
    </span>
  );
}

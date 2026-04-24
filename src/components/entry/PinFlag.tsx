/** Amber pin flag — only renders when pinned. */
export default function PinFlag({ pinned }: { pinned: boolean | null | undefined }) {
  if (!pinned) return null;
  return (
    <span
      aria-label="pinned"
      style={{
        color: 'var(--amber-accent)',
        fontSize: 10,
        lineHeight: 1,
      }}
    >
      ⚐
    </span>
  );
}

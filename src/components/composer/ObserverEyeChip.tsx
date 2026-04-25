import { Eye } from 'lucide-react';
import { useObserverStore } from '@/stores/observerStore';

interface ObserverEyeChipProps {
  threadId: string | null;
  open: boolean;
  onToggle: () => void;
}

/**
 * Composer chip that toggles the Observer alcove (slides up from the
 * composer). The Observer is NOT a selectable agent — it lives behind
 * this dedicated button and watches the conversation in the background.
 */
export function ObserverEyeChip({ threadId, open, onToggle }: ObserverEyeChipProps) {
  const notes = useObserverStore((s) =>
    threadId ? s.notesByThread[threadId] : undefined
  );
  const count = notes?.length ?? 0;

  return (
    <button
      type="button"
      className={`agent-pill${open ? ' targeted' : ''}`}
      title="Observer (⌘J) — open to ask about this conversation"
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: open ? 'var(--text-body)' : 'var(--text-soft)',
      }}
    >
      <Eye size={12} />
      <span>observer</span>
      {count > 0 && (
        <span
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-whisper)',
            letterSpacing: 'var(--track-meta)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default ObserverEyeChip;

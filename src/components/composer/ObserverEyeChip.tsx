import { Eye } from 'lucide-react';
import { useDrawerStore } from '@/stores/drawerStore';
import { useObserverStore } from '@/stores/observerStore';

interface ObserverEyeChipProps {
  threadId: string | null;
}

export function ObserverEyeChip({ threadId }: ObserverEyeChipProps) {
  const { active, open, close } = useDrawerStore();
  const notes = useObserverStore((s) =>
    threadId ? s.notesByThread[threadId] : undefined
  );
  const isOpen = active === 'observer';
  const count = notes?.length ?? 0;

  if (!threadId) return null;

  return (
    <button
      type="button"
      className={`pill pill-icon ${isOpen ? 'pill-active' : ''}`}
      title="Observer notes (⌘J)"
      onClick={() => (isOpen ? close() : open('observer', { threadId }))}
    >
      <Eye size={14} />
      {count > 0 && <span className="pill-count">{count}</span>}
    </button>
  );
}

export default ObserverEyeChip;

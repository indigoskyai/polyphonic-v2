import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import type { Thread } from '@/stores/threadStore';
import { useThreadStore } from '@/stores/threadStore';
import ThreadRowMenu from './ThreadRowMenu';
import ThreadDeleteDialog from './ThreadDeleteDialog';

interface Props {
  thread: Thread;
  active: boolean;
  onClick: () => void;
}

export default function ThreadRow({ thread, active, onClick }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(thread.title || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateThreadTitle = useThreadStore((s) => s.updateThreadTitle);

  useEffect(() => {
    if (renaming) {
      setDraft(thread.title || '');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [renaming, thread.title]);

  const heat = thread.heat || 'warm';
  const opacityMap: Record<string, number> = { hot: 1, warm: 0.82, cool: 0.54, ghost: 0.32 };

  const commitRename = async () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === thread.title) return;
    try {
      await updateThreadTitle(thread.id, next);
    } catch {
      /* keep silent — toast already wired in menu actions */
    }
  };

  return (
    <>
      <div
        className="thread-row group flex items-center gap-2.5 cursor-pointer"
        style={{
          padding: '7px 12px',
          borderRadius: 8,
          background: active ? 'var(--overlay-active)' : undefined,
          opacity: active ? 1 : opacityMap[heat] || 0.82,
          transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-normal) var(--ease-out)',
          position: 'relative',
        }}
        onClick={() => {
          if (!renaming) onClick();
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--overlay-hover)';
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget as HTMLDivElement).style.background = '';
        }}
      >
        {/* Leading dot removed — text-only thread rows like ChatGPT/Claude. */}
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            aria-label="Rename thread"
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setRenaming(false);
              }
            }}
            onBlur={() => void commitRename()}
            className="flex-1 outline-none"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              color: 'var(--text-primary)',
              background: 'var(--surface-input, transparent)',
              border: '1px solid var(--border-faint)',
              borderRadius: 4,
              padding: '2px 6px',
              minWidth: 0,
            }}
          />
        ) : (
          <span
            className="flex-1 truncate"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: active ? 'var(--weight-medium)' : 'var(--weight-book)',
              letterSpacing: 'var(--track-body)',
              color: active ? 'var(--text-primary)' : 'var(--text-body)',
            }}
          >
            {thread.title || 'New conversation'}
          </span>
        )}

        {thread.starred && !renaming && (
          <Star size={11} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} fill="currentColor" />
        )}

        {!renaming && (
          <span className="thread-row__actions shrink-0">
            <ThreadRowMenu
              thread={thread}
              onRename={() => setRenaming(true)}
              onRequestDelete={() => setConfirmDelete(true)}
            />
          </span>
        )}
      </div>

      <ThreadDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        thread={thread}
      />
    </>
  );
}

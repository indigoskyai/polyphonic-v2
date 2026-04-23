import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThreadStore, Thread } from '@/stores/threadStore';
import { useSidebarStore } from '@/stores/sidebarStore';

export default function Sidebar() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { threads, currentThreadId, loadThreads } = useThreadStore();
  const visible = useSidebarStore((s) => s.visible);

  useEffect(() => { loadThreads(); }, []);

  const filteredThreads = search
    ? threads.filter((t) => t.title?.toLowerCase().includes(search.toLowerCase()))
    : threads;
  const pinnedThreads = filteredThreads.filter((t) => t.pinned);
  const recentThreads = filteredThreads.filter((t) => !t.pinned);

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      style={{
        width: visible ? 'var(--sidebar-width)' : 0,
        minWidth: visible ? 'var(--sidebar-width)' : 0,
        marginRight: visible ? 0 : 'calc(-1 * var(--inset-gap))',
        opacity: visible ? 1 : 0,
        background: 'var(--canvas)',
        border: visible ? '1px solid var(--border-faint)' : '1px solid transparent',
        borderRadius: 'var(--radius-inset)',
        transition: visible
          ? 'width 560ms var(--ease-premium), min-width 560ms var(--ease-premium), margin-right 560ms var(--ease-premium), opacity 320ms var(--ease-out) 200ms, border-color 320ms var(--ease-out) 200ms'
          : 'width 560ms var(--ease-premium), min-width 560ms var(--ease-premium), margin-right 560ms var(--ease-premium), opacity 240ms var(--ease-out), border-color 240ms var(--ease-out)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="flex flex-col"
        style={{ width: 'var(--sidebar-width)', height: '100%' }}
      >
      {/* Header */}
      <div className="flex items-center" style={{ padding: '14px 16px 10px', minHeight: 44 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 'var(--track-folio)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
          }}
        >
          § 01
        </div>
      </div>
      <div style={{ padding: '0 16px 10px' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: 'var(--track-display)',
          }}
        >
          Threads
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 8px 8px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads..."
          className="w-full outline-none"
          style={{
            height: 30,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid var(--border-faint)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 10px',
          }}
        />
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        {pinnedThreads.length > 0 && (
          <>
            <SectionLabel>Pinned</SectionLabel>
            {pinnedThreads.map((t) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={t.id === currentThreadId}
                onClick={() => navigate(`/chat/${t.id}`)}
              />
            ))}
          </>
        )}
        <SectionLabel>Recent</SectionLabel>
        {recentThreads.map((t) => (
          <ThreadItem
            key={t.id}
            thread={t}
            active={t.id === currentThreadId}
            onClick={() => navigate(`/chat/${t.id}`)}
          />
        ))}
      </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: 'var(--track-folio)',
        color: 'var(--text-ghost)',
        padding: '12px 8px 6px',
      }}
    >
      {children}
    </div>
  );
}

function ThreadItem({ thread, active, onClick }: { thread: Thread; active: boolean; onClick: () => void }) {
  const heat = thread.heat || 'warm';
  const opacityMap: Record<string, number> = { hot: 1, warm: 0.72, cool: 0.48, ghost: 0.3 };
  return (
    <div
      className="flex items-center gap-2 cursor-pointer"
      style={{
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--overlay-active)' : undefined,
        opacity: active ? 1 : opacityMap[heat] || 0.72,
        transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-normal) var(--ease-out)',
      }}
      onClick={onClick}
    >
      <div className="w-1 h-1 rounded-full shrink-0" style={{ background: active ? 'var(--luca-full)' : 'var(--text-tertiary)' }} />
      <span
        className="text-xs flex-1 truncate"
        style={{
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: 400,
        }}
      >
        {thread.title || 'New conversation'}
      </span>
    </div>
  );
}

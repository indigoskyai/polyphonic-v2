import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThreadStore, Thread } from '@/stores/threadStore';
import SidebarHeader from './SidebarHeader';

export default function SidebarChat() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { threads, currentThreadId, loadThreads } = useThreadStore();

  useEffect(() => { loadThreads(); }, []);

  const filteredThreads = search
    ? threads.filter((t) => t.title?.toLowerCase().includes(search.toLowerCase()))
    : threads;
  const pinnedThreads = filteredThreads.filter((t) => t.pinned);
  const recentThreads = filteredThreads.filter((t) => !t.pinned);

  return (
    <>
      <SidebarHeader folio="§ 01" title="Threads" />

      {/* Search */}
      <div style={{ padding: '0 8px 8px' }}>
        <input
          aria-label="Search threads"
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
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: 'var(--track-meta)',
        color: 'var(--text-ghost)',
        padding: '14px 8px 6px',
      }}
    >
      {children}
    </div>
  );
}

function ThreadItem({ thread, active, onClick }: { thread: Thread; active: boolean; onClick: () => void }) {
  const heat = thread.heat || 'warm';
  const opacityMap: Record<string, number> = { hot: 1, warm: 0.82, cool: 0.54, ghost: 0.32 };
  return (
    <div
      className="flex items-center gap-2.5 cursor-pointer"
      style={{
        padding: '7px 10px',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--overlay-active)' : undefined,
        opacity: active ? 1 : opacityMap[heat] || 0.82,
        transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-normal) var(--ease-out)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--overlay-hover)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = ''; }}
    >
      <div className="w-1 h-1 rounded-full shrink-0" style={{ background: active ? 'var(--luca-full)' : 'var(--text-tertiary)' }} />
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          fontWeight: 400,
          letterSpacing: 'var(--track-body)',
          color: active ? 'var(--text-primary)' : 'var(--text-body)',
        }}
      >
        {thread.title || 'New conversation'}
      </span>
    </div>
  );
}

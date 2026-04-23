import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThreadStore, Thread } from '@/stores/threadStore';
import { useSettingsModalStore } from '@/stores/settingsModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRailStore } from '@/stores/railStore';

export default function ThreadsPanel() {
  const expanded = useRailStore((s) => s.expanded);
  const setExpanded = useRailStore((s) => s.setExpanded);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { threads, currentThreadId, createThread } = useThreadStore();
  const openSettings = useSettingsModalStore((s) => s.openSettings);

  const handleNewThread = async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const id = await createThread(user.id);
    navigate(`/chat/${id}`);
    setExpanded(false);
  };

  const filteredThreads = search
    ? threads.filter((t) => t.title?.toLowerCase().includes(search.toLowerCase()))
    : threads;
  const pinnedThreads = filteredThreads.filter((t) => t.pinned);
  const recentThreads = filteredThreads.filter((t) => !t.pinned);

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      style={{
        width: expanded ? 'var(--sidebar-width)' : 0,
        minWidth: expanded ? 'var(--sidebar-width)' : 0,
        marginLeft: expanded ? 'var(--chrome-gap)' : 0,
        marginBottom: 'var(--chrome-gap)',
        opacity: expanded ? 1 : 0,
        background: 'var(--bg-deep)',
        border: expanded ? '1px solid var(--border-subtle)' : '1px solid transparent',
        borderRadius: 'var(--inset-radius)',
        transition:
          'width var(--dur-slow) var(--ease-premium), min-width var(--dur-slow) var(--ease-premium), margin-left var(--dur-slow) var(--ease-premium), opacity var(--dur-normal) var(--ease-out)',
        pointerEvents: expanded ? 'auto' : 'none',
      }}
    >
      <div style={{ width: 'var(--sidebar-width)', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '12px 16px', minHeight: 44 }}>
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/chat')}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              L
            </div>
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
              Luca
            </span>
          </div>
          <button
            className="p-1 rounded flex items-center justify-center"
            style={{ color: 'var(--text-tertiary)', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setExpanded(false)}
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M11 7H3M5 3L1 7l4 4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 8px', marginBottom: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads..."
            className="w-full outline-none"
            style={{
              height: 32,
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 10px',
            }}
          />
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 8 }}>
          {pinnedThreads.length > 0 && (
            <div style={{ paddingBottom: 4, marginBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
              <div
                className="text-[10px] font-medium uppercase"
                style={{ letterSpacing: '0.06em', color: 'var(--text-ghost)', padding: '4px 12px 2px' }}
              >
                Pinned
              </div>
              {pinnedThreads.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  active={t.id === currentThreadId}
                  onClick={() => {
                    navigate(`/chat/${t.id}`);
                    setExpanded(false);
                  }}
                />
              ))}
            </div>
          )}
          <div
            className="text-[10px] font-medium uppercase"
            style={{ letterSpacing: '0.06em', color: 'var(--text-ghost)', padding: '4px 12px 2px' }}
          >
            Recent
          </div>
          {recentThreads.map((t) => (
            <ThreadItem
              key={t.id}
              thread={t}
              active={t.id === currentThreadId}
              onClick={() => {
                navigate(`/chat/${t.id}`);
                setExpanded(false);
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-0.5" style={{ padding: 8, borderTop: '1px solid var(--border-subtle)' }}>
          <SidebarAction label="New thread" icon="+" onClick={handleNewThread} />
          <SidebarAction label="Memory" icon="◉" onClick={() => { navigate('/memory'); setExpanded(false); }} />
          <SidebarAction label="Mind" icon="◎" onClick={() => { navigate('/mind'); setExpanded(false); }} />
          <SidebarAction label="Import" icon="↑" onClick={() => { navigate('/import'); setExpanded(false); }} />
          <SidebarAction label="Profile" icon="◉" onClick={() => { navigate('/profile'); setExpanded(false); }} />
          <SidebarAction label="Settings" icon="⚙" onClick={() => { openSettings(); setExpanded(false); }} />
        </div>
      </div>
    </div>
  );
}

function ThreadItem({ thread, active, onClick }: { thread: Thread; active: boolean; onClick: () => void }) {
  const heat = thread.heat || 'warm';
  const opacityMap: Record<string, number> = { hot: 1, warm: 0.72, cool: 0.48, ghost: 0.3 };
  return (
    <div
      className="flex items-center gap-2 rounded cursor-pointer mb-px"
      style={{
        padding: '6px 12px',
        background: active ? 'var(--bg-surface)' : undefined,
        opacity: active ? 1 : opacityMap[heat] || 0.72,
        transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-normal) var(--ease-out)',
      }}
      onClick={onClick}
    >
      <div className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--luca)' }} />
      <span
        className="text-xs flex-1 truncate"
        style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 400 }}
      >
        {thread.title || 'New conversation'}
      </span>
    </div>
  );
}

function SidebarAction({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded cursor-pointer"
      style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)', transition: 'all var(--dur-fast) var(--ease-out)' }}
      onClick={onClick}
    >
      <span style={{ width: 14, textAlign: 'center', fontSize: 14 }}>{icon}</span>
      {label}
    </div>
  );
}

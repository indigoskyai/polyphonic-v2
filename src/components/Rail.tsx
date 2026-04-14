import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThreadStore, Thread } from '@/stores/threadStore';
import { useSettingsModalStore } from '@/stores/settingsModalStore';

export default function Rail() {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { threads, currentThreadId, loadThreads, createThread, setCurrentThread } = useThreadStore();

  useEffect(() => { loadThreads(); }, []);

  const openSettings = useSettingsModalStore((s) => s.openSettings);
  const settingsOpen = useSettingsModalStore((s) => s.open);

  const activeView = location.pathname.startsWith('/chat') ? 'chat'
    : location.pathname.startsWith('/memory') ? 'memory'
    : location.pathname.startsWith('/mind') ? 'mind'
    : location.pathname.startsWith('/dashboard') ? 'mind'
    : 'chat';

  const handleNewThread = async () => {
    const { useAuthStore } = await import('@/stores/authStore');
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
    <>
      {/* Overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-[15]"
          style={{ background: 'rgba(0,0,0,0.34)', transition: 'opacity var(--dur-normal) var(--ease-out)' }}
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        className="flex-shrink-0 h-full relative overflow-hidden z-10"
        style={{
          width: expanded ? 'var(--sidebar-width)' : 'var(--rail-width)',
          minWidth: expanded ? 'var(--sidebar-width)' : 'var(--rail-width)',
          background: 'var(--bg-deep)',
          borderRight: '1px solid var(--border-subtle)',
          transition: 'width var(--dur-slow) var(--ease-premium), min-width var(--dur-slow) var(--ease-premium)',
          zIndex: expanded ? 20 : 10,
        }}
      >
        {/* Collapsed rail */}
        <div
          className="flex flex-col items-center h-full"
          style={{
            padding: '44px 0 16px',
            gap: 4,
            width: 'var(--rail-width)',
            opacity: expanded ? 0 : 1,
            pointerEvents: expanded ? 'none' : 'auto',
            transition: 'opacity 100ms var(--ease-out)',
          }}
        >
          {/* Logo */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer mb-4 relative alive"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', transition: 'all var(--dur-fast) var(--ease-out)' }}
            onClick={() => setExpanded(true)}
          >
            L
          </div>


          {/* Thread dots */}
          <div className="flex flex-col items-center gap-0.5 flex-1 w-full px-2 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none' }}>
            {threads.slice(0, 10).map((t) => (
              <div
                key={t.id}
                className={`w-8 h-8 min-w-[32px] min-h-[32px] rounded flex items-center justify-center cursor-pointer shrink-0 ${t.id === currentThreadId ? 'active' : ''}`}
                style={{ color: t.id === currentThreadId ? 'var(--text-primary)' : 'var(--text-tertiary)', background: t.id === currentThreadId ? 'var(--bg-surface)' : undefined, transition: 'all var(--dur-fast) var(--ease-out)', fontSize: 12 }}
                onClick={() => { navigate(`/chat/${t.id}`); }}
              >
                <div className="w-[5px] h-[5px] rounded-full" style={{ background: 'currentColor', animation: t.id === currentThreadId ? undefined : 'pulse-thread 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>

          <div className="flex-1" />

          {/* Divider */}
          <div className="shrink-0" style={{ width: 20, height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

          {/* Nav icons */}
          <NavIcon icon="chat" active={activeView === 'chat'} onClick={() => navigate('/chat')} />
          <NavIcon icon="memory" active={activeView === 'memory'} onClick={() => navigate('/memory')} />
          <NavIcon icon="mind" active={activeView === 'mind'} onClick={() => navigate('/mind')} />
          <NavIcon icon="settings" active={settingsOpen} onClick={openSettings} />

          {/* New thread */}
          <div
            className="w-8 h-8 rounded flex items-center justify-center cursor-pointer shrink-0 mt-2"
            style={{ color: 'var(--text-tertiary)', fontSize: 16, fontWeight: 300, transition: 'all var(--dur-fast) var(--ease-out)' }}
            onClick={handleNewThread}
          >+</div>

          {/* Toggle */}
          <div
            className="w-8 h-8 rounded flex items-center justify-center cursor-pointer shrink-0 mb-1"
            style={{ color: 'var(--text-tertiary)', opacity: 0.4, transition: 'opacity 150ms ease' }}
            onClick={() => setExpanded(true)}
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 7h8M9 3l4 4-4 4"/></svg>
          </div>
        </div>

        {/* Expanded sidebar */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            opacity: expanded ? 1 : 0,
            pointerEvents: expanded ? 'auto' : 'none',
            transition: expanded ? 'opacity 200ms var(--ease-out) 150ms' : 'opacity 150ms var(--ease-out) 100ms',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between" style={{ padding: '12px 16px', minHeight: 44 }}>
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/chat')}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                L
              </div>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Luca</span>
            </div>
            <button
              className="p-1 rounded flex items-center justify-center"
              style={{ color: 'var(--text-tertiary)', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setExpanded(false)}
            >
              <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11 7H3M5 3L1 7l4 4"/></svg>
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
                <div className="text-[10px] font-medium uppercase" style={{ letterSpacing: '0.06em', color: 'var(--text-ghost)', padding: '4px 12px 2px' }}>Pinned</div>
                {pinnedThreads.map((t) => <ThreadItem key={t.id} thread={t} active={t.id === currentThreadId} onClick={() => { navigate(`/chat/${t.id}`); setExpanded(false); }} />)}
              </div>
            )}
            <div className="text-[10px] font-medium uppercase" style={{ letterSpacing: '0.06em', color: 'var(--text-ghost)', padding: '4px 12px 2px' }}>Recent</div>
            {recentThreads.map((t) => <ThreadItem key={t.id} thread={t} active={t.id === currentThreadId} onClick={() => { navigate(`/chat/${t.id}`); setExpanded(false); }} />)}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-0.5" style={{ padding: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <SidebarAction label="New thread" icon="+" onClick={handleNewThread} />
            <SidebarAction label="Memory" icon="◉" onClick={() => { navigate('/memory'); setExpanded(false); }} />
            <SidebarAction label="Mind" icon="◎" onClick={() => { navigate('/mind'); setExpanded(false); }} />
            <SidebarAction label="Settings" icon="⚙" onClick={() => { openSettings(); setExpanded(false); }} />
          </div>
        </div>
      </div>
    </>
  );
}

function NavIcon({ icon, active, onClick }: { icon: string; active: boolean; onClick: () => void }) {
  return (
    <div
      className="w-8 h-8 rounded flex items-center justify-center cursor-pointer shrink-0"
      style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', background: active ? 'var(--bg-surface)' : undefined, transition: 'all var(--dur-fast) var(--ease-out)' }}
      onClick={onClick}
    >
      {icon === 'chat' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M2 3h10v7H5L2 12V3z"/></svg>}
      {icon === 'memory' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><circle cx={3} cy={4} r={1.2}/><circle cx={11} cy={4} r={1.2}/><circle cx={4} cy={11} r={1.2}/><circle cx={10} cy={10} r={1.2}/><path d="M5 6.2L3.8 4.8M9 6.2l1.2-1.4M5.5 8.5l-1 1.8M8.5 8.5l1 1"/></svg>}
      {icon === 'mind' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><ellipse cx={7} cy={7} rx={5} ry={4}/><path d="M7 3c1.5 0 3 .8 3 2s-1.5 2-3 2-3-.8-3-2 1.5-2 3-2z"/><circle cx={7} cy={7} r={0.8} fill="currentColor"/></svg>}
      {icon === 'settings' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4"/></svg>}
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
      <span className="text-xs flex-1 truncate" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 400 }}>
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

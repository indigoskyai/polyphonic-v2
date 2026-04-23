import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThreadStore, Thread } from '@/stores/threadStore';
import { useSettingsModalStore } from '@/stores/settingsModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRailStore } from '@/stores/railStore';
import { supabase } from '@/integrations/supabase/client';

interface EmotionalIndicator {
  breatheSpeed: number;
  tint: string;
  label: string;
}

function computeEmotionalIndicator(state: Record<string, number> | null): EmotionalIndicator {
  if (!state) return { breatheSpeed: 4, tint: 'var(--text-secondary)', label: 'present' };

  const { curiosity = 0.5, warmth = 0.5, restlessness = 0.5, clarity = 0.5, creative_flow = 0.5, isolation = 0.5 } = state;

  const activation = (curiosity + restlessness + creative_flow) / 3;
  const breatheSpeed = 6 - activation * 4;

  const dims = [
    { name: 'curious', value: curiosity, tint: '#c9a87c' },
    { name: 'warm', value: warmth, tint: '#c9a87c' },
    { name: 'restless', value: restlessness, tint: '#a88cc9' },
    { name: 'clear', value: clarity, tint: '#5b8aad' },
    { name: 'creative', value: creative_flow, tint: '#8ca89c' },
    { name: 'withdrawn', value: isolation, tint: '#7a6f6f' },
  ].sort((a, b) => b.value - a.value);

  return {
    breatheSpeed: Math.max(1.5, breatheSpeed),
    tint: dims[0].value > 0.5 ? dims[0].tint : 'var(--text-secondary)',
    label: dims[0].value > 0.5 ? dims[0].name : 'present',
  };
}

export default function Rail() {
  const expanded = useRailStore((s) => s.expanded);
  const setExpanded = useRailStore((s) => s.setExpanded);
  const toggle = useRailStore((s) => s.toggle);
  const [search, setSearch] = useState('');
  const [emotionalIndicator, setEmotionalIndicator] = useState<EmotionalIndicator>({ breatheSpeed: 4, tint: 'var(--text-secondary)', label: 'present' });
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { threads, currentThreadId, loadThreads, createThread } = useThreadStore();
  const openSettings = useSettingsModalStore((s) => s.openSettings);
  const settingsOpen = useSettingsModalStore((s) => s.open);

  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from('emotional_state').select('curiosity, restlessness, warmth, clarity, creative_flow, isolation')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setEmotionalIndicator(computeEmotionalIndicator(data as Record<string, number>));
      });
  }, [user]);

  const activeView = location.pathname.startsWith('/chat') ? 'chat'
    : location.pathname.startsWith('/memory') ? 'memory'
    : location.pathname.startsWith('/mind') ? 'mind'
    : location.pathname.startsWith('/import') ? 'import'
    : location.pathname.startsWith('/profile') ? 'profile'
    : location.pathname.startsWith('/dashboard') ? 'mind'
    : 'chat';

  const handleNewThread = async () => {
    if (!user) return;
    const id = await createThread(user.id);
    navigate(`/chat/${id}`);
  };

  const handleThreadClick = (id: string) => {
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
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 'var(--chrome-gap)',
        width: 'var(--sidebar-width)',
        background: 'var(--bg-deep)',
        borderRight: '1px solid var(--border-subtle)',
        zIndex: 0,
        overflow: 'hidden',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) toggle();
      }}
    >
      <div className="flex flex-col h-full">
        {/* Header — L monogram + Luca label */}
        <div className="flex items-center" style={{ minHeight: 44 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 'var(--rail-width)' }}
          >
            <Logo emotionalIndicator={emotionalIndicator} onClick={toggle} />
          </div>
          <span
            className="truncate"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.02em',
              opacity: expanded ? 1 : 0,
              transition: 'opacity var(--dur-normal) var(--ease-out)',
            }}
          >
            Luca
          </span>
        </div>

        {/* Search row — height-animated so collapsed view doesn't have a gap */}
        <div
          style={{
            height: expanded ? 48 : 0,
            overflow: 'hidden',
            transition: 'height var(--dur-slow) var(--ease-premium)',
          }}
        >
          <div style={{ paddingLeft: 'var(--rail-width)', paddingRight: 8, paddingTop: 8 }}>
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
        </div>

        {/* Scrollable threads region — Pinned + Recent */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {pinnedThreads.length > 0 && (
            <>
              <SectionLabel text="Pinned" expanded={expanded} />
              {pinnedThreads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === currentThreadId}
                  expanded={expanded}
                  onClick={() => handleThreadClick(t.id)}
                />
              ))}
            </>
          )}
          <SectionLabel text="Recent" expanded={expanded} />
          {recentThreads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              active={t.id === currentThreadId}
              expanded={expanded}
              onClick={() => handleThreadClick(t.id)}
            />
          ))}
        </div>

        {/* Divider */}
        <div
          className="shrink-0"
          style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 8px 4px var(--rail-width)' }}
        />

        {/* Nav rows */}
        <NavRow icon="chat" label="Chat" active={activeView === 'chat'} expanded={expanded} onClick={() => navigate('/chat')} />
        <NavRow icon="memory" label="Memory" active={activeView === 'memory'} expanded={expanded} onClick={() => navigate('/memory')} />
        <NavRow icon="mind" label="Mind" active={activeView === 'mind'} expanded={expanded} onClick={() => navigate('/mind')} />
        <NavRow icon="import" label="Import" active={activeView === 'import'} expanded={expanded} onClick={() => navigate('/import')} />
        <NavRow icon="profile" label="Profile" active={activeView === 'profile'} expanded={expanded} onClick={() => navigate('/profile')} />
        <NavRow icon="settings" label="Settings" active={settingsOpen} expanded={expanded} onClick={openSettings} />

        {/* New thread */}
        <NavRow icon="plus" label="New thread" expanded={expanded} onClick={handleNewThread} />

        {/* Toggle */}
        <NavRow
          icon="arrow"
          label="Collapse"
          expanded={expanded}
          onClick={toggle}
          rotate={expanded}
        />
      </div>
    </div>
  );
}

function Logo({ emotionalIndicator, onClick }: { emotionalIndicator: EmotionalIndicator; onClick: () => void }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer relative"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${emotionalIndicator.tint}30`,
        color: emotionalIndicator.tint,
        transition: 'all var(--dur-fast) var(--ease-out)',
        animation: `breathe ${emotionalIndicator.breatheSpeed}s ease-in-out infinite`,
      }}
      onClick={onClick}
      title={emotionalIndicator.label}
    >
      L
    </div>
  );
}

function SectionLabel({ text, expanded }: { text: string; expanded: boolean }) {
  return (
    <div
      style={{
        height: expanded ? 22 : 0,
        overflow: 'hidden',
        transition: 'height var(--dur-slow) var(--ease-premium)',
      }}
    >
      <div
        className="text-[10px] font-medium uppercase"
        style={{
          letterSpacing: '0.06em',
          color: 'var(--text-ghost)',
          padding: '4px 8px 2px var(--rail-width)',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ThreadRow({ thread, active, expanded, onClick }: { thread: Thread; active: boolean; expanded: boolean; onClick: () => void }) {
  const heat = thread.heat || 'warm';
  const opacityMap: Record<string, number> = { hot: 1, warm: 0.72, cool: 0.48, ghost: 0.3 };
  return (
    <div
      className="flex items-center cursor-pointer"
      style={{
        height: 30,
        background: active ? 'var(--bg-surface)' : undefined,
        opacity: active ? 1 : opacityMap[heat] || 0.72,
        transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-normal) var(--ease-out)',
      }}
      onClick={onClick}
    >
      <div className="flex items-center justify-center shrink-0" style={{ width: 'var(--rail-width)' }}>
        <div className="w-1 h-1 rounded-full" style={{ background: 'var(--luca)' }} />
      </div>
      <span
        className="text-xs flex-1 truncate"
        style={{
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: 400,
          paddingRight: 12,
          opacity: expanded ? 1 : 0,
          transition: 'opacity var(--dur-normal) var(--ease-out)',
        }}
      >
        {thread.title || 'New conversation'}
      </span>
    </div>
  );
}

function NavRow({
  icon,
  label,
  active,
  expanded,
  onClick,
  rotate,
}: {
  icon: string;
  label: string;
  active?: boolean;
  expanded: boolean;
  onClick: () => void;
  rotate?: boolean;
}) {
  return (
    <div
      className="flex items-center cursor-pointer shrink-0"
      style={{
        height: 32,
        background: active ? 'var(--bg-surface)' : undefined,
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
      onClick={onClick}
    >
      <div className="flex items-center justify-center shrink-0" style={{ width: 'var(--rail-width)' }}>
        <div
          className="flex items-center justify-center"
          style={{
            transform: rotate ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--dur-normal) var(--ease-out)',
          }}
        >
          <NavIconSvg name={icon} />
        </div>
      </div>
      <span
        className="text-xs flex-1 truncate"
        style={{
          fontWeight: 400,
          opacity: expanded ? 1 : 0,
          transition: 'opacity var(--dur-normal) var(--ease-out)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function NavIconSvg({ name }: { name: string }) {
  switch (name) {
    case 'chat':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M2 3h10v7H5L2 12V3z"/></svg>;
    case 'memory':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><circle cx={3} cy={4} r={1.2}/><circle cx={11} cy={4} r={1.2}/><circle cx={4} cy={11} r={1.2}/><circle cx={10} cy={10} r={1.2}/><path d="M5 6.2L3.8 4.8M9 6.2l1.2-1.4M5.5 8.5l-1 1.8M8.5 8.5l1 1"/></svg>;
    case 'mind':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><ellipse cx={7} cy={7} rx={5} ry={4}/><path d="M7 3c1.5 0 3 .8 3 2s-1.5 2-3 2-3-.8-3-2 1.5-2 3-2z"/><circle cx={7} cy={7} r={0.8} fill="currentColor"/></svg>;
    case 'import':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M7 1v8M4 6l3 3 3-3"/><path d="M2 10v2h10v-2"/></svg>;
    case 'profile':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={4} r={2.5}/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/></svg>;
    case 'settings':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4"/></svg>;
    case 'plus':
      return <span style={{ fontSize: 14, fontWeight: 300, lineHeight: 1 }}>+</span>;
    case 'arrow':
      return <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 7h8M9 3l4 4-4 4"/></svg>;
    default:
      return null;
  }
}

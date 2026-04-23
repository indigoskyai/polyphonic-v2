import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
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
  const toggle = useRailStore((s) => s.toggle);
  const setExpanded = useRailStore((s) => s.setExpanded);
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

  return (
    <div
      className="flex-shrink-0 h-full flex flex-col items-center"
      style={{
        width: 'var(--rail-width)',
        minWidth: 'var(--rail-width)',
        padding: '12px 0 16px',
        gap: 4,
        background: 'transparent',
        zIndex: 10,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) toggle();
      }}
    >
      {/* Logo — emotional indicator */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer mb-4 relative"
        style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${emotionalIndicator.tint}30`,
          color: emotionalIndicator.tint,
          transition: 'all var(--dur-fast) var(--ease-out)',
          animation: `breathe ${emotionalIndicator.breatheSpeed}s ease-in-out infinite`,
        }}
        onClick={toggle}
        title={emotionalIndicator.label}
      >
        L
      </div>

      {/* Middle region — fades out when panel is expanded (everything here is
          already surfaced inside the ThreadsPanel) */}
      <div
        className="flex flex-col items-center w-full"
        style={{
          flex: 1,
          gap: 4,
          minHeight: 0,
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? 'none' : 'auto',
          transition: 'opacity var(--dur-normal) var(--ease-out)',
        }}
      >
        {/* Thread dots */}
        <div
          className="flex flex-col items-center gap-0.5 flex-1 w-full px-2 overflow-y-auto overflow-x-hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {threads.slice(0, 10).map((t) => (
            <div
              key={t.id}
              className={`w-8 h-8 min-w-[32px] min-h-[32px] rounded flex items-center justify-center cursor-pointer shrink-0 ${t.id === currentThreadId ? 'active' : ''}`}
              style={{
                color: t.id === currentThreadId ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: t.id === currentThreadId ? 'var(--bg-surface)' : undefined,
                transition: 'all var(--dur-fast) var(--ease-out)',
                fontSize: 12,
              }}
              onClick={() => { navigate(`/chat/${t.id}`); }}
            >
              <div
                className="w-[5px] h-[5px] rounded-full"
                style={{
                  background: 'currentColor',
                  animation: t.id === currentThreadId ? undefined : 'pulse-thread 1.5s ease-in-out infinite',
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex-1 w-full" onClick={() => setExpanded(true)} />

        {/* Divider */}
        <div className="shrink-0" style={{ width: 20, height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

        {/* Nav icons */}
        <NavIcon icon="chat" active={activeView === 'chat'} onClick={() => navigate('/chat')} />
        <NavIcon icon="memory" active={activeView === 'memory'} onClick={() => navigate('/memory')} />
        <NavIcon icon="mind" active={activeView === 'mind'} onClick={() => navigate('/mind')} />
        <NavIcon icon="import" active={activeView === 'import'} onClick={() => navigate('/import')} />
        <NavIcon icon="profile" active={activeView === 'profile'} onClick={() => navigate('/profile')} />
        <NavIcon icon="settings" active={settingsOpen} onClick={openSettings} />

        {/* New thread */}
        <div
          className="w-8 h-8 rounded flex items-center justify-center cursor-pointer shrink-0 mt-2"
          style={{ color: 'var(--text-tertiary)', fontSize: 16, fontWeight: 300, transition: 'all var(--dur-fast) var(--ease-out)' }}
          onClick={handleNewThread}
        >
          +
        </div>
      </div>

      {/* Toggle — always visible, rotates 180° when expanded so it reads as
          "collapse" instead of "expand" */}
      <div
        className="w-8 h-8 rounded flex items-center justify-center cursor-pointer shrink-0 mb-1"
        style={{
          color: 'var(--text-tertiary)',
          opacity: 0.4,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'opacity 150ms ease, transform var(--dur-normal) var(--ease-out)',
        }}
        onClick={toggle}
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 7h8M9 3l4 4-4 4" />
        </svg>
      </div>
    </div>
  );
}

function NavIcon({ icon, active, onClick }: { icon: string; active: boolean; onClick: () => void }) {
  return (
    <div
      className="w-8 h-8 rounded flex items-center justify-center cursor-pointer shrink-0"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        background: active ? 'var(--bg-surface)' : undefined,
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
      onClick={onClick}
    >
      {icon === 'chat' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M2 3h10v7H5L2 12V3z"/></svg>}
      {icon === 'memory' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><circle cx={3} cy={4} r={1.2}/><circle cx={11} cy={4} r={1.2}/><circle cx={4} cy={11} r={1.2}/><circle cx={10} cy={10} r={1.2}/><path d="M5 6.2L3.8 4.8M9 6.2l1.2-1.4M5.5 8.5l-1 1.8M8.5 8.5l1 1"/></svg>}
      {icon === 'mind' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><ellipse cx={7} cy={7} rx={5} ry={4}/><path d="M7 3c1.5 0 3 .8 3 2s-1.5 2-3 2-3-.8-3-2 1.5-2 3-2z"/><circle cx={7} cy={7} r={0.8} fill="currentColor"/></svg>}
      {icon === 'import' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M7 1v8M4 6l3 3 3-3"/><path d="M2 10v2h10v-2"/></svg>}
      {icon === 'profile' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={4} r={2.5}/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/></svg>}
      {icon === 'settings' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4"/></svg>}
    </div>
  );
}

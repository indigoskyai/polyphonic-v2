import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
import { useAuthStore } from '@/stores/authStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';

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
  const [emotionalIndicator, setEmotionalIndicator] = useState<EmotionalIndicator>({ breatheSpeed: 4, tint: 'var(--text-secondary)', label: 'present' });
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { createThread } = useThreadStore();
  const settingsOpen = location.pathname.startsWith('/settings');
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const openDrawer = useDrawerStore((s) => s.open);
  const activeDrawer = useDrawerStore((s) => s.active);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);

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
      className="flex-shrink-0 flex flex-col items-center"
      style={{
        width: 'var(--rail-width)',
        minWidth: 'var(--rail-width)',
        padding: '12px 0 12px',
        gap: 4,
        background: 'transparent',
      }}
    >
      {/* Identity — click to toggle sidebar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer relative"
        style={{
          background: 'var(--overlay-hover)',
          border: `1px solid ${emotionalIndicator.tint}30`,
          color: emotionalIndicator.tint,
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 15,
          lineHeight: 1,
          paddingTop: 1,
          transition: 'all var(--dur-fast) var(--ease-out)',
          animation: `breathe ${emotionalIndicator.breatheSpeed}s ease-in-out infinite`,
        }}
        onClick={toggleSidebar}
        title={emotionalIndicator.label}
      >
        L
      </div>

      {/* Spacer */}
      <div className="flex-1 w-full" />

      {/* Nav icons */}
      <NavIcon icon="chat" active={activeView === 'chat'} onClick={() => navigate('/chat')} />
      <NavIcon icon="memory" active={activeView === 'memory'} onClick={() => navigate('/memory')} />
      <NavIcon icon="mind" active={activeView === 'mind'} onClick={() => navigate('/mind')} />
      <NavIcon icon="import" active={activeView === 'import'} onClick={() => navigate('/import')} />
      <NavIcon icon="profile" active={activeView === 'profile'} onClick={() => navigate('/profile')} />

      {/* Notifications bell */}
      <button
        type="button"
        className="rail-bell shrink-0"
        data-active={activeDrawer === 'notifications' ? 'true' : undefined}
        onClick={() => openDrawer('notifications')}
        title="Activity"
        aria-label={`Activity${pendingCount > 0 ? ` — ${pendingCount} pending` : ''}`}
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6a4 4 0 1 1 8 0v2.2l1 1.6H2l1-1.6z" />
          <path d="M5.7 11.4a1.5 1.5 0 0 0 2.6 0" />
        </svg>
        {pendingCount > 0 && <span className="rail-bell__dot" aria-hidden="true" />}
      </button>

      {/* Divider */}
      <div className="shrink-0" style={{ width: 20, height: 1, background: 'var(--border-faint)', margin: '4px 0' }} />

      {/* New thread */}
      <div
        className="w-6 h-6 rounded flex items-center justify-center cursor-pointer shrink-0"
        style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 300, transition: 'all var(--dur-fast) var(--ease-out)' }}
        onClick={handleNewThread}
        title="New thread"
      >
        +
      </div>

      {/* Settings */}
      <NavIcon icon="settings" active={settingsOpen} onClick={() => navigate('/settings/agents')} />



    </div>
  );
}

function NavIcon({ icon, active, onClick }: { icon: string; active: boolean; onClick: () => void }) {
  return (
    <div
      className="w-6 h-6 rounded flex items-center justify-center cursor-pointer shrink-0"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        background: active ? 'var(--overlay-active)' : undefined,
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
      onClick={onClick}
    >
      {icon === 'chat' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M2 3h10v7H5L2 12V3z"/></svg>}
      {icon === 'memory' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={7} r={2}/><circle cx={3} cy={4} r={1.2}/><circle cx={11} cy={4} r={1.2}/><circle cx={4} cy={11} r={1.2}/><circle cx={10} cy={10} r={1.2}/><path d="M5 6.2L3.8 4.8M9 6.2l1.2-1.4M5.5 8.5l-1 1.8M8.5 8.5l1 1"/></svg>}
      {icon === 'mind' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><ellipse cx={7} cy={7} rx={5} ry={4}/><path d="M7 3c1.5 0 3 .8 3 2s-1.5 2-3 2-3-.8-3-2 1.5-2 3-2z"/><circle cx={7} cy={7} r={0.8} fill="currentColor"/></svg>}
      {icon === 'import' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M7 1v8M4 6l3 3 3-3"/><path d="M2 10v2h10v-2"/></svg>}
      {icon === 'profile' && <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={7} cy={4} r={2.5}/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/></svg>}
      {icon === 'settings' && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>}
    </div>
  );
}

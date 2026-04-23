import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const toggle = useRailStore((s) => s.toggle);
  const [emotionalIndicator, setEmotionalIndicator] = useState<EmotionalIndicator>({ breatheSpeed: 4, tint: 'var(--text-secondary)', label: 'present' });
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { createThread } = useThreadStore();
  const openSettings = useSettingsModalStore((s) => s.openSettings);
  const settingsOpen = useSettingsModalStore((s) => s.open);

  useEffect(() => {
    if (!user) return;
    supabase.from('emotional_state').select('curiosity, restlessness, warmth, clarity, creative_flow, isolation')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setEmotionalIndicator(computeEmotionalIndicator(data as Record<string, number>));
      });
  }, [user]);

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
      {/* L — identity + toggle */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer relative"
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

      {/* Spacer — clickable empty area also toggles */}
      <div className="flex-1 w-full" onClick={toggle} />

      {/* New thread */}
      <div
        className="w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
        style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 300, transition: 'all var(--dur-fast) var(--ease-out)' }}
        onClick={handleNewThread}
        title="New thread"
      >
        +
      </div>

      {/* Settings */}
      <div
        className="w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
        style={{
          color: settingsOpen ? 'var(--text-primary)' : 'var(--text-tertiary)',
          background: settingsOpen ? 'var(--bg-surface)' : undefined,
          transition: 'all var(--dur-fast) var(--ease-out)',
        }}
        onClick={openSettings}
        title="Settings"
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx={7} cy={7} r={2} />
          <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4" />
        </svg>
      </div>
    </div>
  );
}

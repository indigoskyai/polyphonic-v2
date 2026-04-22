import { useMemo, useState } from 'react';
import ConstellationCanvas from './ConstellationCanvas';
import EvidencePanel from './EvidencePanel';
import ClimateRibbon from './ClimateRibbon';
import ProfileChatPanel from '@/components/ProfileChatPanel';
import CurrentsGrid from './widgets/CurrentsGrid';
import CompassToday from './CompassToday';
import { useProfileLayoutStore } from './profileLayoutStore';

interface Props {
  profile: any;
  onSwitchToClassic: () => void;
  onRegenerate: () => void;
  onRefresh: () => void;
  generating: boolean;
  memoryCount: number;
}

export default function InnerCosmos({
  profile,
  onSwitchToClassic,
  onRegenerate,
  onRefresh,
  generating,
  memoryCount,
}: Props) {
  const { selected } = useProfileLayoutStore();
  const [chatOpen, setChatOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);

  const starterPrompts = useMemo(() => {
    const out: string[] = [];
    const bf = profile?.personality_dimensions?.big_five;
    if (bf) {
      const top = (Object.entries(bf) as [string, any][])
        .sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0))[0];
      if (top) out.push(`Why did you score me high on ${top[0]}?`);
    }
    if (profile?.shadow_patterns?.blind_spots?.length) {
      out.push('Which blind spot should I sit with first, and why?');
    }
    out.push('What is one thing about me you think I would be surprised to hear?');
    return out;
  }, [profile]);

  const promptsForPanel = seedPrompt ? [seedPrompt, ...starterPrompts] : starterPrompts;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <h1 className="text-sm font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
              Inner Cosmos
            </h1>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
              v{profile?.version ?? 1} · {memoryCount} memories woven into the field
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSeedPrompt(null); setChatOpen((v) => !v); }}
              className="text-[10px] px-3 py-1.5 rounded"
              style={{
                background: chatOpen ? 'var(--bg-surface)' : 'transparent',
                border: `1px solid ${chatOpen ? 'var(--border)' : 'var(--border-subtle)'}`,
                color: chatOpen ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {chatOpen ? 'Close chat' : 'Ask about profile'}
            </button>
            <button
              onClick={onRegenerate}
              disabled={generating}
              className="text-[10px] px-3 py-1.5 rounded"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: generating ? 'var(--text-ghost)' : 'var(--text-tertiary)',
                cursor: generating ? 'wait' : 'pointer',
              }}
              title="Re-run the deep analysis on your latest memories"
            >
              {generating ? 'Regenerating…' : 'Regenerate'}
            </button>
            <button
              onClick={onRefresh}
              className="text-[10px] px-3 py-1.5 rounded"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            >
              Refresh
            </button>
            <button
              onClick={onSwitchToClassic}
              className="text-[10px] px-3 py-1.5 rounded"
              style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-ghost)', cursor: 'pointer' }}
              title="Switch to the classic tabbed view"
            >
              Classic view
            </button>
          </div>
        </div>

        {/* Constellation canvas */}
        <div className="flex-1 min-h-0 relative">
          <ConstellationCanvas
            profile={profile}
            identityNarrative={profile?.identity_narrative}
          />
        </div>

        {/* Climate ribbon — emotional weather + time cursor */}
        <ClimateRibbon />

        {/* Currents — modular widget grid */}
        <CurrentsGrid />

        {/* Compass — daily pulse: edge / question / pattern */}
        <CompassToday
          onAskInChat={(p) => {
            setSeedPrompt(p);
            setChatOpen(true);
          }}
        />
      </div>

      {/* Right rails — evidence first; chat overlays on top when opened */}
      {selected && !chatOpen && (
        <EvidencePanel
          onAskInChat={(p) => { setSeedPrompt(p); setChatOpen(true); }}
        />
      )}
      {chatOpen && (
        <ProfileChatPanel
          onClose={() => setChatOpen(false)}
          starterPrompts={promptsForPanel}
        />
      )}
    </div>
  );
}

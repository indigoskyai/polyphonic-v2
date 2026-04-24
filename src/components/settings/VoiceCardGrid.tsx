import React from 'react';
import { Pill, EmptyState } from '@/components/ui/luca';
import type { Voice } from '@/stores/agentSettingsStore';

interface Props {
  voices: Voice[];
  agentId: string;
}

export default function VoiceCardGrid({ voices, agentId }: Props) {
  if (voices.length === 0) {
    return <EmptyState text="No voice configured" hint="Attach a TTS voice to this agent." />;
  }
  return (
    <div className="voice-grid">
      {voices.map((v) => (
        <div key={v.id} className="voice-card">
          <header className="vc-header">
            <span className={`vc-dot`} style={{ background: `var(--${agentId}-full, var(--text-tertiary))` }} aria-hidden="true" />
            <span className="vc-name">{v.provider}</span>
          </header>
          <div className="vc-field">
            <div className="vc-label">voice</div>
            <div className="vc-value">{v.voiceId}</div>
          </div>
          <div className="vc-field">
            <div className="vc-label">rate · pitch</div>
            <div className="vc-value">{v.rate.toFixed(2)} · {v.pitch.toFixed(2)}</div>
          </div>
          <div className="vc-test">
            <Pill size="xs" variant="ghost">Test voice</Pill>
          </div>
        </div>
      ))}
    </div>
  );
}

import React from 'react';
import type { AgentKey, AgentMode } from '@/stores/groupSessionStore';
import Waveform from './Waveform';

interface Props {
  agent: AgentKey;
  mode: AgentMode;
}

export default function AgentCard({ agent, mode }: Props) {
  return (
    <div className="agent-card" data-agent={agent} data-mode={mode}>
      <div className="agent-halo" aria-hidden="true" />
      <div className="agent-portrait">
        <span className="agent-glyph">{agent[0]}</span>
      </div>
      <div className="agent-name">{agent}</div>
      {mode === 'speaking' && <Waveform agent={agent} />}
    </div>
  );
}

import React from 'react';
import { Pill } from '@/components/ui/luca';

interface Props {
  agent: string;
  onWake: () => void;
  onSwap: () => void;
}

export default function AgentOfflinePrompt({ agent, onWake, onSwap }: Props) {
  return (
    <div className="agent-offline" role="alert">
      <div className="agent-offline-dot" aria-hidden="true" />
      <div className="agent-offline-title">{agent} is offline</div>
      <div className="agent-offline-sub">Wake them up or hand off to another agent.</div>
      <div className="agent-offline-actions">
        <Pill variant="primary" size="sm" onClick={onWake}>Wake</Pill>
        <Pill variant="ghost" size="sm" onClick={onSwap}>Use another agent</Pill>
      </div>
    </div>
  );
}

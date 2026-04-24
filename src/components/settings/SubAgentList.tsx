import React from 'react';
import { ToggleSwitch, EmptyState } from '@/components/ui/luca';
import type { SubAgent } from '@/stores/agentSettingsStore';

interface Props {
  subagents: SubAgent[];
  onChange: (next: SubAgent[]) => void;
}

export default function SubAgentList({ subagents, onChange }: Props) {
  if (subagents.length === 0) {
    return <EmptyState text="No sub-agents" hint="Spawn dedicated sub-agents under this orchestrator." />;
  }
  return (
    <div className="subagent-list">
      {subagents.map((s) => (
        <div key={s.id} className="subagent-row">
          <span className="sa-name">
            <span className="sa-name-dot" aria-hidden="true" />
            {s.name}
          </span>
          <span className="sa-desc">{s.description}</span>
          <span className="sa-model">{s.model}</span>
          <ToggleSwitch
            checked={s.on}
            onChange={(v) => onChange(subagents.map((x) => (x.id === s.id ? { ...x, on: v } : x)))}
          />
        </div>
      ))}
    </div>
  );
}

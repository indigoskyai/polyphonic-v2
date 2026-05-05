import React from 'react';
import SubAgentIndicator from './SubAgentIndicator';
import { useSubAgentStore, type SubAgent } from '@/stores/subAgentStore';

interface Props {
  parentAgent: string;
  threadId?: string | null;
}

export default function SubAgentRow({ parentAgent, threadId }: Props) {
  const agents = useSubAgentStore((s) => s.agents);
  const openOverlay = useSubAgentStore((s) => s.openOverlay);

  const list: SubAgent[] = Object.values(agents)
    .filter((a) => a.parentAgent === parentAgent && (!threadId || a.threadId === threadId))
    .sort((a, b) => a.family.localeCompare(b.family));

  if (list.length === 0) return null;

  return (
    <div className="sa-row" role="group" aria-label={`${parentAgent} sub-agents`}>
      {list.map((agent, i) => (
        <span key={agent.id} style={{ animationDelay: `${i * 120}ms` } as React.CSSProperties}>
          <SubAgentIndicator agent={agent} onClick={() => openOverlay(parentAgent, agent.id)} />
        </span>
      ))}
    </div>
  );
}

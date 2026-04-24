import React from 'react';
import AgentCard from './AgentCard';
import QueueIndicator from './QueueIndicator';
import { useGroupSessionStore, type AgentKey } from '@/stores/groupSessionStore';

const ORDER: AgentKey[] = ['luca', 'vektor', 'anima'];

export default function Stage() {
  const slots = useGroupSessionStore((s) => s.slots);
  return (
    <div className="group-stage">
      {ORDER.map((key) => (
        <AgentCard key={key} agent={key} mode={slots[key].mode} />
      ))}
      <QueueIndicator />
    </div>
  );
}

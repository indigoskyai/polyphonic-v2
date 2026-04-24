import React from 'react';
import { useGroupSessionStore } from '@/stores/groupSessionStore';

export default function QueueIndicator() {
  const queue = useGroupSessionStore((s) => s.queue);
  if (queue.length === 0) return null;
  return (
    <div className="queue-indicator" role="list" aria-label="Speaker queue">
      <div className="queue-title">Next up</div>
      {queue.map((agent, i) => (
        <div
          key={agent}
          className="queue-row"
          data-agent={agent}
          data-next={i === 0 ? 'true' : undefined}
          role="listitem"
        >
          <span className="queue-dot" aria-hidden="true" />
          <span>{agent}</span>
        </div>
      ))}
    </div>
  );
}

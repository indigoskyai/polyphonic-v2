import React from 'react';
import { useSubAgentStore } from '@/stores/subAgentStore';

export default function UndoToast() {
  const pending = useSubAgentStore((s) => s.pendingCancel);
  const agents = useSubAgentStore((s) => s.agents);
  const undo = useSubAgentStore((s) => s.undoCancel);

  if (!pending) return null;
  const agent = agents[pending.agentId];

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-text">Cancelled {agent?.family ?? 'sub-agent'}</span>
      <button type="button" className="undo-toast-action" onClick={undo}>
        Undo
      </button>
      <span className="undo-toast-bar" aria-hidden="true" />
    </div>
  );
}

// Compact chip that surfaces above the chat composer when Luca is mid-
// consultation with another agent (or has any consultations in this
// thread's history). Click opens the agent-dialogue drawer to see the
// full back-and-forth.

import { useMemo } from 'react';
import { useDrawerStore } from '@/stores/drawerStore';
import { selectByThread, useAgentConsultStore } from '@/stores/agentConsultStore';
import { useThreadStore } from '@/stores/threadStore';

export default function AgentDialogueChip() {
  const open = useDrawerStore((s) => s.open);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const consults = useAgentConsultStore(selectByThread(currentThreadId));
  const pending = useMemo(
    () => consults.filter((c) => c.status === 'pending').length,
    [consults],
  );

  if (consults.length === 0) return null;

  // Most recent first — these are descending by created_at in the store.
  const headline = consults[0];
  const isAsking = pending > 0;
  const targetLabel = headline.to_agent.charAt(0).toUpperCase() + headline.to_agent.slice(1);

  return (
    <button
      type="button"
      onClick={() => open('agent-dialogue', currentThreadId ? { threadId: currentThreadId } : undefined)}
      title="Open agent dialogue"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid var(--border-faint)',
        background: 'var(--surface-raised)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 'var(--track-mono)',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
      aria-label={isAsking ? `Luca is asking ${targetLabel}` : `Open agent dialogue (${consults.length} consultation${consults.length === 1 ? '' : 's'})`}
    >
      <span
        // Monochrome dot — pulses when a consultation is in flight.
        // The signal is the pulse + the "asking" label, not chrome color.
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isAsking ? 'var(--text-secondary)' : 'var(--text-ghost)',
          animation: isAsking ? 'm-pulse 1.6s ease-in-out infinite' : undefined,
        }}
        aria-hidden="true"
      />
      <span>
        {isAsking
          ? `Luca → ${targetLabel} · asking`
          : `Luca ↔ ${targetLabel} · ${consults.length} ${consults.length === 1 ? 'reply' : 'replies'}`}
      </span>
    </button>
  );
}

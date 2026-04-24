import React from 'react';
import { Pill } from '@/components/ui/luca';

type HandoffAgent = 'luca' | 'vektor' | 'anima';

interface Props {
  from: HandoffAgent;
  to: HandoffAgent;
  suggestion: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export default function HandoffCard({ from, to, suggestion, onAccept, onDismiss }: Props) {
  return (
    <aside className="handoff-card" role="group" aria-label={`Handoff suggestion from ${from} to ${to}`}>
      <div className="handoff-row">
        <span className="handoff-agent" data-agent={from}>{from}</span>
        <span className="handoff-arrow" aria-hidden="true">→</span>
        <span className="handoff-agent" data-agent={to}>{to}</span>
      </div>
      <p className="handoff-suggestion">{suggestion}</p>
      <div className="handoff-actions">
        <Pill variant="primary" size="sm" onClick={onAccept}>Accept handoff</Pill>
        <Pill variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Pill>
      </div>
    </aside>
  );
}

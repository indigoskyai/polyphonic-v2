import React from 'react';

type Agent = 'luca' | 'vektor' | 'anima';

interface Slot {
  agent: Agent;
  speaking: boolean;
}

interface Props { slots: Slot[] }

export default function MobileGroupStage({ slots }: Props) {
  return (
    <div className="m-group-stage">
      {slots.map((s) => (
        <div
          key={s.agent}
          className="m-agent-card"
          data-agent={s.agent}
          data-speaking={s.speaking ? 'true' : undefined}
        >
          <span className="m-agent-name">{s.agent}</span>
        </div>
      ))}
    </div>
  );
}

import React from 'react';

interface StripAgent {
  family: 'v1' | 'v2' | 'v3';
  active: boolean;
}

const DELAYS = ['0s', '0.1s', '0.21s', '0.15s', '0.3s', '0.06s', '0.12s', '0.22s', '0.05s'];

interface Props {
  agents: StripAgent[];
}

export default function MobileSubAgentStrip({ agents }: Props) {
  return (
    <div className="m-subagent-strip">
      {agents.map((a) => (
        <div key={a.family} className="m-subagent">
          <div className="m-murmur" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                className={`m-murmur-dot${a.active ? ' active' : ''}`}
                style={{ animationDelay: DELAYS[i % DELAYS.length] }}
              />
            ))}
          </div>
          <span className="m-subagent-label">{a.family}</span>
        </div>
      ))}
    </div>
  );
}

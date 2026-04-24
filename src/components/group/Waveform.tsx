import React from 'react';
import type { AgentKey } from '@/stores/groupSessionStore';

interface Props { agent: AgentKey }

const BAR_HEIGHTS = [6, 10, 7, 11, 5, 8];
const BAR_DELAYS = ['0s', '0.1s', '0.2s', '0.3s', '0.15s', '0.25s'];

export default function Waveform({ agent }: Props) {
  return (
    <div className="waveform" data-agent={agent} aria-hidden="true">
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="wf-bar"
          style={{ height: `${h}px`, animationDelay: BAR_DELAYS[i] }}
        />
      ))}
    </div>
  );
}

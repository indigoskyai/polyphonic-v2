import React, { useMemo } from 'react';
import { Tooltip } from '@/components/ui/luca';
import type { SubAgent } from '@/stores/subAgentStore';

interface Props {
  agent: SubAgent;
  onClick: () => void;
}

const SLOW_DUR = [3.7, 4.1, 4.3, 4.7, 5.3, 5.9];
const FAST_DUR = [1.1, 1.3, 1.7, 1.9];
const SLOW_DEL = [0, 0.13, 0.21, 0.31, 0.43, 0.59];
const FAST_DEL = [0, 0.07, 0.11, 0.17, 0.23];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export default function SubAgentIndicator({ agent, onClick }: Props) {
  const dotStyles = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => {
      const h = hash(`${agent.id}-${i}`);
      return {
        '--d-slow': `${SLOW_DUR[h % SLOW_DUR.length]}s`,
        '--d-fast': `${FAST_DUR[(h >> 3) % FAST_DUR.length]}s`,
        '--delay-slow': `${SLOW_DEL[(h >> 6) % SLOW_DEL.length]}s`,
        '--delay-fast': `${FAST_DEL[(h >> 9) % FAST_DEL.length]}s`,
      } as React.CSSProperties;
    });
  }, [agent.id]);

  return (
    <Tooltip content={agent.task} side="top">
      <button
        type="button"
        className="sa-indicator"
        data-state={agent.state}
        data-family={agent.family}
        onClick={onClick}
        aria-label={`${agent.family} · ${agent.task}`}
      >
        <span className="sa-dots" aria-hidden="true">
          {dotStyles.map((style, i) => (
            <span key={i} className="sa-dot" style={style} />
          ))}
        </span>
        <span className="sa-label">{agent.family}</span>
      </button>
    </Tooltip>
  );
}

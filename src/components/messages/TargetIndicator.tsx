import React from 'react';

type Role = 'luca' | 'vektor' | 'anima' | 'mnemos' | 'user' | 'system';

interface Props {
  targets: Role[];
  allAgentCount?: number;
}

const AGENT_ORDER: Role[] = ['luca', 'vektor', 'anima'];
const DEFAULT_ALL_COUNT = 3;

export default function TargetIndicator({ targets, allAgentCount = DEFAULT_ALL_COUNT }: Props) {
  if (targets.length === 0) return null;

  const isAll = targets.length >= allAgentCount;
  if (isAll) {
    return (
      <span className="target-indicator">
        <span className="target-arrow">→</span>
        <span className="target-name">all</span>
      </span>
    );
  }

  if (targets.length === 1) {
    const t = targets[0];
    return (
      <span className="target-indicator">
        <span className="target-arrow">→</span>
        <span className="target-dot" data-agent={t} aria-hidden="true" />
        <span className="target-name">{t}</span>
      </span>
    );
  }

  const sorted = [...targets].sort((a, b) => AGENT_ORDER.indexOf(a) - AGENT_ORDER.indexOf(b));
  return (
    <span className="target-indicator">
      <span className="target-arrow">→</span>
      {sorted.map((t) => (
        <span key={t} className="target-dot" data-agent={t} aria-hidden="true" />
      ))}
      <span className="target-name">{sorted.length}</span>
    </span>
  );
}

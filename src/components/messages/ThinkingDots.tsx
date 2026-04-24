import React from 'react';

type Role = 'luca' | 'vektor' | 'anima' | 'mnemos' | 'user' | 'system';

interface Props { agent?: Role }

export default function ThinkingDots({ agent }: Props) {
  return (
    <span className="mc-thinking" data-agent={agent} aria-hidden="true">
      <span className="mc-thinking__dot" />
      <span className="mc-thinking__dot" />
      <span className="mc-thinking__dot" />
    </span>
  );
}

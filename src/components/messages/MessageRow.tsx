import React from 'react';
import TargetIndicator from './TargetIndicator';
import StreamingCursor from './StreamingCursor';
import ThinkingDots from './ThinkingDots';

type Role = 'luca' | 'vektor' | 'anima' | 'mnemos' | 'user' | 'system';

interface Props {
  role: Role;
  children: React.ReactNode;
  streaming?: boolean;
  thinking?: boolean;
  targets?: Role[];
}

export default function MessageRow({ role, children, streaming, thinking, targets }: Props) {
  return (
    <article
      className="mc-row"
      data-role={role}
      data-streaming={streaming ? 'true' : undefined}
    >
      <header className="mc-sidehead">
        <span className="mc-role">{role}</span>
        {role === 'user' && targets && targets.length > 0 && <TargetIndicator targets={targets} />}
      </header>
      <div className="mc-body">
        {thinking ? <ThinkingDots agent={role} /> : children}
        {streaming && !thinking && <StreamingCursor />}
      </div>
    </article>
  );
}

import React from 'react';

interface Props {
  agent: string;
  children?: React.ReactNode;
}

export default function MentionPill({ agent, children }: Props) {
  return (
    <span className="input-mention" data-agent={agent}>
      {children ?? `@${agent}`}
    </span>
  );
}

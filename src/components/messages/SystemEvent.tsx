import React from 'react';

interface Props { children: React.ReactNode }

export default function SystemEvent({ children }: Props) {
  return <div className="system-event" role="status">{children}</div>;
}

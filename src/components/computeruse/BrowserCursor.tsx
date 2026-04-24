import React from 'react';

interface Props {
  x: number;
  y: number;
}

export default function BrowserCursor({ x, y }: Props) {
  return (
    <div
      className="bc-cursor"
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-hidden="true"
    />
  );
}

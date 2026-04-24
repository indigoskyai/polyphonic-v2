import React from 'react';

interface Props {
  values: number[];
}

export default function Sparkline({ values }: Props) {
  const max = Math.max(1, ...values);
  return (
    <div className="obs-sparkline" aria-hidden="true">
      {values.length === 0 ? (
        <div className="bar" style={{ height: 2 }} />
      ) : (
        values.map((v, i) => (
          <div key={i} className="bar" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
        ))
      )}
    </div>
  );
}

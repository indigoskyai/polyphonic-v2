import React from 'react';

interface BootScreenProps {
  label?: string;
}

export default function BootScreen({ label = 'loading' }: BootScreenProps) {
  return (
    <div className="boot-screen" role="status" aria-label="Loading">
      <div className="boot-screen__dot" aria-hidden="true" />
      <div className="boot-screen__label">{label}</div>
    </div>
  );
}

export { BootScreen };

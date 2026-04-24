import React from 'react';

interface Props { children: React.ReactNode }

export default function PhoneFrame({ children }: Props) {
  return (
    <div className="phone-frame">
      <div className="phone-notch" aria-hidden="true" />
      {children}
    </div>
  );
}

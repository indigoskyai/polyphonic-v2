import React from 'react';
import { useMobileShellStore } from '@/stores/mobileShellStore';

interface Props { title: string }

export default function MobileHeader({ title }: Props) {
  const openDrawer = useMobileShellStore((s) => s.openDrawer);
  return (
    <div className="m-header">
      <button type="button" className="m-menu-btn" onClick={openDrawer} aria-label="Open menu">
        <svg viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.8}>
          <path d="M2 4h11M2 7.5h11M2 11h11" />
        </svg>
      </button>
      <span className="m-title">{title}</span>
      <span style={{ width: 28 }} aria-hidden="true" />
    </div>
  );
}

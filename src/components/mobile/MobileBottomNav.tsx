import React from 'react';
import { useMobileShellStore, type MobileTab } from '@/stores/mobileShellStore';

const TABS: { value: MobileTab; label: string; path: string }[] = [
  { value: 'chat', label: 'Chat', path: 'M3 3h14v10H7l-4 4V3z' },
  { value: 'memory', label: 'Memory', path: 'M10 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { value: 'agents', label: 'Agents', path: 'M4 8l2 4h8l2-4M10 2v6' },
  { value: 'settings', label: 'Settings', path: 'M10 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM10 3v1M10 16v1M3 10h1M16 10h1M5.2 5.2l0.7 0.7M14.1 14.1l0.7 0.7M14.8 5.2l-0.7 0.7M5.9 14.1l-0.7 0.7' },
];

export default function MobileBottomNav() {
  const tab = useMobileShellStore((s) => s.tab);
  const setTab = useMobileShellStore((s) => s.setTab);
  return (
    <div className="m-bottom-nav" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={tab === t.value}
          className="m-nav-item"
          data-active={tab === t.value ? 'true' : undefined}
          onClick={() => setTab(t.value)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={t.path} />
          </svg>
          <span className="m-nav-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

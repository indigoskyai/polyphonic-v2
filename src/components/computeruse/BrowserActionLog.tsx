import React from 'react';
import type { BrowserAction } from '@/stores/browserSessionStore';

interface Props {
  actions: BrowserAction[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function BrowserActionLog({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="bc-log">
        <div className="bc-log-row" style={{ color: 'var(--text-ghost)', fontSize: 11 }}>
          <span />
          <span />
          <span>Awaiting actions…</span>
          <span />
        </div>
      </div>
    );
  }
  return (
    <div className="bc-log">
      {actions.slice(-10).map((a) => (
        <div key={a.id} className="bc-log-row">
          <span className={`bc-log-status ${a.status}`}>{a.status}</span>
          <span aria-hidden="true">·</span>
          <span className="bc-log-text">{a.text}</span>
          <span className="bc-log-ts">{formatTime(a.ts)}</span>
        </div>
      ))}
    </div>
  );
}

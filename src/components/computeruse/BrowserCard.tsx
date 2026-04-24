import React from 'react';
import BrowserCursor from './BrowserCursor';
import BrowserActionLog from './BrowserActionLog';
import type { BrowserSession } from '@/stores/browserSessionStore';

interface Props {
  session: BrowserSession;
}

export default function BrowserCard({ session }: Props) {
  return (
    <div className="browser-card" role="group" aria-label={`Browser session — ${session.url}`}>
      <header className="bc-header">
        <span className={`bc-status-dot ${session.status}`} aria-hidden="true" />
        <span className="bc-status-label">{session.status}</span>
        <span className="bc-spacer" />
        <span className="bc-meta">{session.agent}</span>
      </header>
      <div className="bc-url">
        <span className="bc-url-dots" aria-hidden="true">
          <span className="bc-url-dot" />
          <span className="bc-url-dot" />
          <span className="bc-url-dot" />
        </span>
        <span className="bc-url-text">{session.url}</span>
      </div>
      <div className="bc-viewport">
        <BrowserCursor x={session.cursor.x} y={session.cursor.y} />
      </div>
      <BrowserActionLog actions={session.actions} />
      <footer className="bc-footer">
        {session.actions.length} action{session.actions.length === 1 ? '' : 's'}
      </footer>
    </div>
  );
}

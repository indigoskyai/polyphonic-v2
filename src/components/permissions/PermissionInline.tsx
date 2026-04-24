import React, { useState } from 'react';
import { Pill } from '@/components/ui/luca';

type Agent = 'luca' | 'vektor' | 'anima';

interface Props {
  agent: Agent;
  title: string;
  body: React.ReactNode;
  details?: string;
  onApprove: (remember: boolean) => void;
  onDeny: () => void;
}

export default function PermissionInline({ agent, title, body, details, onApprove, onDeny }: Props) {
  const [remember, setRemember] = useState(false);

  return (
    <div className="perm-inline" role="alertdialog" aria-label={title}>
      <header className="perm-inline-header">
        <span className={`perm-inline-agent-dot ${agent}`} aria-hidden="true" />
        <svg className="perm-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 17h.01" />
        </svg>
        <span className="perm-inline-title">{title}</span>
      </header>
      <div className="perm-inline-body">{body}</div>
      {details && <div className="perm-inline-details">{details}</div>}
      <div className="perm-inline-actions">
        <label
          className={`perm-inline-remember${remember ? ' checked' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            setRemember((r) => !r);
          }}
        >
          <span className="checkbox" aria-hidden="true" />
          <span>Remember for this thread</span>
        </label>
        <Pill variant="ghost" size="sm" onClick={onDeny}>Deny</Pill>
        <Pill variant="primary" size="sm" onClick={() => onApprove(remember)}>Approve</Pill>
      </div>
    </div>
  );
}

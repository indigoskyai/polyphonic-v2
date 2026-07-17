import React, { useState } from 'react';
import { Pill } from '@/components/ui/luca';

interface Props {
  responderLabel: string;
  message: string;
  detail?: string;
  occurredAt: string;
  onRetry: () => void;
  onViewLogs: () => void;
  onDismiss?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function AgentErroredCard({ responderLabel, message, detail, occurredAt, onRetry, onViewLogs, onDismiss }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <>
      <div className="error-event">
        {responderLabel} encountered an error mid-response
      </div>
      <div className="aec-card" role="alert">
        <header className="aec-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="aec-title">{responderLabel}: runtime error</span>
          <span className="aec-time">{formatTime(occurredAt)}</span>
        </header>
        <div className="aec-message">{message}</div>
        {detail && (
          <div className={`aec-details${detailsOpen ? ' open' : ''}`}>{detail}</div>
        )}
        <div className="aec-actions">
          {detail && (
            <Pill size="sm" variant="secondary" onClick={() => setDetailsOpen((v) => !v)}>
              {detailsOpen ? 'Hide details' : 'Details'}
            </Pill>
          )}
          <Pill size="sm" variant="ghost" onClick={onViewLogs}>View logs</Pill>
          {onDismiss && <Pill size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Pill>}
          <Pill size="sm" variant="primary" onClick={onRetry}>Retry</Pill>
        </div>
      </div>
    </>
  );
}

import React from 'react';
import { EmptyState } from '@/components/ui/luca';
import type { Secret } from '@/stores/agentSettingsStore';

interface Props {
  secrets: Secret[];
}

function mask(lastFour: string): string {
  const tail = (lastFour || '').slice(-3);
  return `sk-...${tail || '???'}`;
}

export default function Keychain({ secrets }: Props) {
  if (secrets.length === 0) {
    return <EmptyState text="No secrets" hint="Connect API keys here; they're stored masked." />;
  }
  return (
    <div className="keychain-list">
      {secrets.map((s) => (
        <div key={s.id} className="keychain-row">
          <span className="kc-name">{s.name}</span>
          <span className="kc-value">{mask(s.lastFour)}</span>
          <span className={`kc-status${s.status === 'expired' ? ' expired' : ''}`}>
            <span className="kc-status-dot" aria-hidden="true" />
            <span>{s.status}</span>
          </span>
          <button type="button" className="kc-row-action" aria-label="Rotate secret">›</button>
        </div>
      ))}
    </div>
  );
}

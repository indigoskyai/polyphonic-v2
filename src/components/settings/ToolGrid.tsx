import React from 'react';
import type { ToolDef } from '@/stores/agentSettingsStore';

interface Props {
  tools: ToolDef[];
  onChange: (next: ToolDef[]) => void;
}

export default function ToolGrid({ tools, onChange }: Props) {
  return (
    <div className="tool-grid">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool-item${t.on ? ' on' : ''}`}
          onClick={() => onChange(tools.map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)))}
        >
          <span className="tool-check" aria-hidden="true">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6l3 3 5-6" />
            </svg>
          </span>
          <span className="tool-name">{t.name}</span>
          {t.gated && <span className="tool-gate">permission</span>}
        </button>
      ))}
    </div>
  );
}

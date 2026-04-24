import React from 'react';
import type { Env } from '@/stores/agentSettingsStore';

interface Props {
  value: Env;
  onChange: (v: Env) => void;
}

const OPTS: { value: Env; label: string }[] = [
  { value: 'dev', label: 'Dev' },
  { value: 'staging', label: 'Staging' },
  { value: 'prod', label: 'Prod' },
];

export default function EnvSwitcher({ value, onChange }: Props) {
  return (
    <div className="env-switch" role="tablist" aria-label="Environment">
      {OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`env-opt${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

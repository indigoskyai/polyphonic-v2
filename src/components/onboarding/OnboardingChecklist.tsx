import React from 'react';

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
}

interface Props {
  steps: OnboardingStep[];
}

export default function OnboardingChecklist({ steps }: Props) {
  const firstActiveIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="onb-checklist" role="list">
      {steps.map((s, i) => {
        const isActive = i === firstActiveIdx;
        const stateClass = s.done ? 'done' : isActive ? 'active' : '';
        return (
          <div key={s.key} className={`onb-step${stateClass ? ` ${stateClass}` : ''}`} role="listitem">
            <span className="onb-step-icon" aria-hidden="true">
              {s.done ? '✓' : i + 1}
            </span>
            <span className="onb-step-label">{s.label}</span>
            <span className="onb-step-status">
              {s.done ? 'READY' : isActive ? 'IN PROGRESS' : 'PENDING'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

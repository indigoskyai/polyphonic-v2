import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  const body = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      className="toggle"
      data-checked={checked ? 'true' : undefined}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="toggle__knob" aria-hidden="true" />
    </button>
  );
  if (!label) return body;
  return (
    <label className="toggle-wrap">
      {body}
      <span className="toggle-wrap__label">{label}</span>
    </label>
  );
}

export { ToggleSwitch };

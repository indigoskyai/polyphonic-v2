import React, { useState } from 'react';

/* ======================================================================
   MaskedInput — input field with show/hide reveal toggle.
   Used for API keys and other sensitive single-line values.

   Companion to KeyStored: MaskedInput is the empty/input state,
   KeyStored is the saved/stored state.
   ====================================================================== */

interface MaskedInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MaskedInput({
  value,
  onChange,
  placeholder = 'sk-…',
  disabled,
}: MaskedInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 10px)',
        overflow: 'hidden',
        transition: 'border-color 180ms var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.20)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          padding: '0 14px',
          height: 40,
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          color: 'var(--text-primary)',
          letterSpacing: 'var(--track-body-tight)',
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 500,
          color: 'var(--text-tertiary)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          cursor: 'pointer',
          borderLeft: '1px solid var(--hairline)',
          transition: 'color 180ms var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/* ======================================================================
   KeyStored — display state for a saved API key.
   Shows the masked key preview + connected status + remove button.
   ====================================================================== */

interface KeyStoredProps {
  preview: string; // e.g. "sk-or-v1…a3f9"
  status?: 'connected' | 'pending' | 'errored';
  onRemove: () => void;
  removing?: boolean;
}

export function KeyStored({
  preview,
  status = 'connected',
  onRemove,
  removing,
}: KeyStoredProps) {
  const statusColor =
    status === 'connected'
      ? 'var(--green-accent, #4ade80)'
      : status === 'errored'
      ? 'var(--rose-accent, #c97c8a)'
      : 'var(--amber-soft, #d9a744)';

  const statusLabel =
    status === 'connected'
      ? 'Connected'
      : status === 'errored'
      ? 'Errored'
      : 'Pending';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md, 10px)',
      }}
    >
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-primary)',
          letterSpacing: 'var(--track-body-tight)',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {preview}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 500,
          color: statusColor,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: statusColor,
          }}
        />
        {statusLabel}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="set-btn danger compact"
      >
        {removing ? 'Removing…' : 'Remove'}
      </button>
    </div>
  );
}

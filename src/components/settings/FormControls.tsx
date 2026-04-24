import React from 'react';

/* ======================================================================
   Shared form primitives for settings surfaces.
   Extracted from the original SettingsView so each new settings page
   (General, Models, Appearance, Account, etc.) can render the same
   monochromatic, mono-eyebrow controls without duplication.
   ====================================================================== */

export function PageHeader({ folio, title, description }: { folio: string; title: string; description?: string }) {
  return (
    <div style={{ padding: '24px 32px 0' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-folio)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {folio}
      </div>
      <h1 className="cp-page-title" style={{ marginBottom: description ? 8 : 24 }}>
        {title}
      </h1>
      {description && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text-body)',
            maxWidth: 640,
            marginBottom: 24,
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 'var(--track-meta)',
        color: 'var(--text-ghost)',
        marginBottom: 16,
        marginTop: 32,
      }}
    >
      {children}
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex justify-between items-center mb-3"
      style={{ borderRadius: 'var(--radius-md)', padding: '12px 0', gap: 16 }}
    >
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-primary)',
            fontWeight: 450,
            marginBottom: description ? 4 : 0,
          }}
        >
          {label}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      className="relative cursor-pointer shrink-0"
      style={{
        width: 36,
        height: 18,
        background: 'var(--bg-surface)',
        border: `1px solid ${on ? 'var(--border-focus)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-xl)',
        transition: 'all 300ms var(--ease-out)',
      }}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange();
        }
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 14,
          height: 14,
          top: 1,
          left: on ? 19 : 1,
          background: on ? 'var(--text-body)' : 'var(--text-tertiary)',
          transition: 'all 300ms var(--ease-out)',
        }}
      />
    </div>
  );
}

export function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const v = opt.toLowerCase();
        const active = value === v;
        return (
          <div
            key={opt}
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => onChange(v)}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: `2px solid ${active ? 'var(--border-focus)' : 'var(--border-dim)'}`,
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color var(--dur-fast) var(--ease-out)',
              }}
            >
              {active && (
                <div
                  style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-body)' }}
                />
              )}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 40,
        width: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0 12px',
        fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        outline: 'none',
        transition: 'border-color var(--dur-fast) var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-focus)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        outline: 'none',
        resize: 'vertical',
        lineHeight: 1.5,
        transition: 'border-color var(--dur-fast) var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-focus)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  width = 240,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  width?: number | string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 40,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0 12px',
        fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
        minWidth: width,
        outline: 'none',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DangerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer"
      style={{
        height: 38,
        background: 'var(--bg-surface)',
        color: '#f87171',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '0 16px',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(248,113,113,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-surface)';
      }}
    >
      {label}
    </button>
  );
}

export function GhostButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer"
      style={{
        height: 38,
        background: 'transparent',
        color: 'var(--text-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '0 16px',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        opacity: disabled ? 0.4 : 1,
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
    >
      {label}
    </button>
  );
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 24,
          maxWidth: 400,
          width: '90%',
        }}
      >
        <div
          style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          {message}
        </div>
        <div className="flex justify-end gap-3">
          <GhostButton label="Cancel" onClick={onCancel} />
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer"
            style={{
              height: 38,
              padding: '0 16px',
              background: 'rgba(248,113,113,0.88)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

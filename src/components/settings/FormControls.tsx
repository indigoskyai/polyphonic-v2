import React from 'react';

/* ======================================================================
   Shared form primitives for settings surfaces.

   Refactored to match the polyphonic v2 settings design language:
   - No glow / no inset white strokes / no breathing animations
   - Pure white overlays at calibrated opacities
   - Surface-step active states for cards and segment controls
   - Editorial typography with tight tracking on small text
   - Switzer 500 weight for load-bearing labels, 400 for prose

   See polyphonic-settings-handoff/02-design-system-spec.md for full spec.
   ====================================================================== */

/* ─────────────────────────────────────────────────────────────────────
   PageHeader — eyebrow + display title + brief description
   Used at the top of every settings page (inside .set-head wrapper).
   ───────────────────────────────────────────────────────────────────── */

export function PageHeader({
  folio,
  title,
  description,
}: {
  folio: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="set-head">
      <div className="set-head-eye">
        <span className="num">{folio}</span>
      </div>
      <h1 className="set-head-title">{title}</h1>
      {description && <p className="set-head-sub">{description}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SectionTitle — section eye + title + optional description.
   Replaces the legacy SectionTitle which was just a mono caps eyebrow.
   For backward compatibility, when called with just children it renders
   as the legacy eyebrow style. New code should use Section instead.
   ───────────────────────────────────────────────────────────────────── */

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 'var(--track-folio)',
        color: 'var(--text-soft)',
        marginBottom: 16,
        marginTop: 32,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SettingRow — label/desc on left, control on right.
   ───────────────────────────────────────────────────────────────────── */

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
    <div className="set-row">
      <div className="set-row-copy">
        <div className="set-row-label">{label}</div>
        {description && <div className="set-row-desc">{description}</div>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Toggle — flat surface step on, ink knob, no glow.
   ───────────────────────────────────────────────────────────────────── */

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
        background: on ? 'var(--surface-3)' : 'transparent',
        border: `1px solid ${on ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 999,
        transition: 'all 180ms var(--ease-out)',
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
          width: 12,
          height: 12,
          top: 2,
          left: on ? 20 : 2,
          background: on ? 'var(--ink)' : 'var(--text-tertiary)',
          transition: 'all 180ms var(--ease-out)',
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   RadioGroup — bordered card variant.
   Each option is a tappable card with optional hint description.
   Selection is communicated via surface step + filled radio circle,
   no glow.

   options can be either string[] (legacy) or { value, label, hint }[].
   ───────────────────────────────────────────────────────────────────── */

interface RadioOption {
  value: string;
  label: string;
  hint?: string;
}

export function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: string[] | RadioOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  // Normalize to RadioOption[]
  const normalized: RadioOption[] = options.map((o) =>
    typeof o === 'string' ? { value: o.toLowerCase(), label: o } : o,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {normalized.map((opt) => {
        const active = value === opt.value;
        return (
          <div
            key={opt.value}
            role="radio"
            aria-checked={active}
            tabIndex={0}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange(opt.value);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              padding: '12px 14px',
              background: active ? 'var(--surface-2)' : 'var(--surface-1)',
              border: `1px solid ${active ? 'var(--border)' : 'var(--border-faint)'}`,
              borderRadius: 'var(--radius-md, 10px)',
              transition: 'background 180ms var(--ease-out), border-color 180ms var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'var(--surface-2)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'var(--surface-1)';
                e.currentTarget.style.borderColor = 'var(--border-faint)';
              }
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: `1.5px solid ${active ? 'var(--ink)' : 'var(--border-strong)'}`,
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'border-color 180ms var(--ease-out)',
              }}
            >
              {active && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--ink)',
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: active ? 'var(--ink)' : 'var(--text-primary)',
                  letterSpacing: 'var(--track-body-tight)',
                }}
              >
                {opt.label}
              </span>
              {opt.hint && (
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    color: active ? 'var(--text-soft)' : 'var(--text-tertiary)',
                    letterSpacing: 'var(--track-body-tight)',
                    lineHeight: 1.45,
                  }}
                >
                  {opt.hint}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   TextInput — refined input, 40px tall, mono-friendly.
   ───────────────────────────────────────────────────────────────────── */

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'email';
  mono?: boolean;
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
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: '0 14px',
        fontSize: mono ? 12.5 : 13.5,
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        letterSpacing: 'var(--track-body-tight)',
        outline: 'none',
        transition: 'border-color 180ms var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.20)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────
   TextArea — refined multi-line input.
   ───────────────────────────────────────────────────────────────────── */

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: '12px 14px',
        fontSize: mono ? 12.5 : 13.5,
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        letterSpacing: 'var(--track-body-tight)',
        outline: 'none',
        resize: 'vertical',
        lineHeight: 1.55,
        transition: 'border-color 180ms var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.20)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SelectInput — refined select.
   ───────────────────────────────────────────────────────────────────── */

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
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: '0 14px',
        fontSize: 13.5,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        letterSpacing: 'var(--track-body-tight)',
        cursor: 'pointer',
        minWidth: width,
        outline: 'none',
        transition: 'border-color 180ms var(--ease-out)',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.20)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
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

/* ─────────────────────────────────────────────────────────────────────
   DangerButton — rose-tinted destructive action.
   ───────────────────────────────────────────────────────────────────── */

export function DangerButton({
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
      className="set-btn danger"
    >
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   GhostButton — tertiary action.
   ───────────────────────────────────────────────────────────────────── */

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
      className="set-btn"
    >
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   PrimaryButton — primary action (sticky save footers etc).
   ───────────────────────────────────────────────────────────────────── */

export function PrimaryButton({
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
      className="set-btn primary"
    >
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   ConfirmDialog — modal confirmation for destructive actions.
   ───────────────────────────────────────────────────────────────────── */

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(6px)',
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
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md, 10px)',
          padding: 28,
          maxWidth: 440,
          width: '90%',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-grotesque)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: 'var(--track-tight)',
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--text-body)',
            letterSpacing: 'var(--track-body-tight)',
            lineHeight: 1.55,
            marginBottom: 24,
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <GhostButton label="Cancel" onClick={onCancel} />
          {destructive ? (
            <DangerButton label={confirmLabel} onClick={onConfirm} />
          ) : (
            <PrimaryButton label={confirmLabel} onClick={onConfirm} />
          )}
        </div>
      </div>
    </div>
  );
}

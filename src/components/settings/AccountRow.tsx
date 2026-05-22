import React from 'react';

/* ======================================================================
   AccountRow — read-only display row.
   Label/desc on left, value or pill on right.
   ====================================================================== */

interface AccountRowProps {
  label: string;
  description?: string;
  value?: React.ReactNode;
}

export function AccountRow({ label, description, value }: AccountRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '14px 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--settings-body-size)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--ink)',
            letterSpacing: 'var(--track-body-tight)',
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--settings-caption-size)',
              fontWeight: 'var(--weight-book)',
              color: 'var(--text-tertiary)',
              letterSpacing: 'var(--track-body-tight)',
              lineHeight: 1.45,
            }}
          >
            {description}
          </div>
        )}
      </div>
      {value && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-primary)',
            letterSpacing: 'var(--track-body-tight)',
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

/* ======================================================================
   AccountPlanPill — small pill displaying current plan tier.
   ====================================================================== */

export function AccountPlanPill({
  label = 'Pro',
  color = 'var(--luca-color, #c9a87c)',
}: {
  label?: string;
  color?: string;
}) {
  return (
    <span
      style={{
        padding: '4px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        fontWeight: 'var(--weight-medium)',
        color,
        letterSpacing: 'var(--track-folio)',
        textTransform: 'uppercase',
        background: 'rgba(201, 168, 124, 0.06)',
        border: '1px solid rgba(201, 168, 124, 0.20)',
        borderRadius: 999,
      }}
    >
      {label}
    </span>
  );
}

/* ======================================================================
   ComingSoonBlock — for stub/placeholder settings surfaces.
   Used by /settings/voice and /settings/public-profile.
   ====================================================================== */

interface ComingSoonBlockProps {
  eyebrow?: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ComingSoonBlock({
  eyebrow = 'Coming soon',
  title,
  body,
  actionLabel,
  onAction,
}: ComingSoonBlockProps) {
  return (
    <div
      style={{
        padding: '32px 28px',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md, 10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 'var(--weight-medium)',
          color: 'var(--amber-soft, #d9a744)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          padding: '4px 10px',
          background: 'rgba(217, 167, 68, 0.04)',
          border: '1px solid rgba(217, 167, 68, 0.20)',
          borderRadius: 999,
        }}
      >
        {eyebrow}
      </span>
      <div
        style={{
          fontFamily: 'var(--font-grotesque)',
          fontSize: 18,
          fontWeight: 'var(--weight-medium)',
          color: 'var(--ink)',
          letterSpacing: 'var(--track-display)',
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--settings-body-size)',
          fontWeight: 'var(--weight-book)',
          color: 'var(--text-body)',
          letterSpacing: 'var(--track-body-tight)',
          lineHeight: 1.55,
          maxWidth: 480,
          margin: 0,
        }}
      >
        {body}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="set-btn"
          onClick={onAction}
          style={{ marginTop: 4 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ======================================================================
   HandlePreview — small bordered block showing a public URL.
   Used on /settings/public-profile to show the reserved handle.
   ====================================================================== */

interface HandlePreviewProps {
  domain: string; // "polyphonic.app/@"
  handle: string; // "riley"
}

export function HandlePreview({ domain, handle }: HandlePreviewProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '8px 14px',
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md, 10px)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        letterSpacing: 'var(--track-body-tight)',
      }}
    >
      <span style={{ color: 'var(--text-soft)' }}>{domain}</span>
      <span style={{ color: 'var(--ink)' }}>{handle}</span>
    </div>
  );
}

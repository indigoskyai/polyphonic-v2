import { ReactNode } from 'react';

/** Shared chrome for every Currents tile — uniform sizing, header, empty-state. */
export default function WidgetTile({
  title,
  subtitle,
  children,
  footer,
  empty,
  dragHandleProps,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  empty?: boolean;
  dragHandleProps?: Record<string, any>;
}) {
  return (
    <div
      style={{
        background: 'rgba(220, 219, 216, 0.018)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 168,
        height: 168,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        {...(dragHandleProps ?? {})}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
          cursor: dragHandleProps ? 'grab' : 'default',
        }}
      >
        <div style={{ color: 'var(--text-soft)', fontSize: 11, letterSpacing: '0.04em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em' }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {empty ? (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.06em',
            }}
          >
            quiet — not yet enough signal
          </div>
        ) : children}
      </div>
      {footer && (
        <div style={{ marginTop: 6, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.04em' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

import React from 'react';

/* ======================================================================
   DeviceRow — compact row for a connected runtime in the devices list.

   Status: 'online' | 'offline' | 'revoked'
   ====================================================================== */

type DeviceStatus = 'online' | 'offline' | 'revoked';

interface DeviceRowProps {
  name: string;
  platform?: string | null; // "macOS · M4 Max"
  lastSeen?: string | null; // "just now", "4h ago", "12d ago"
  status: DeviceStatus;
  version?: string | null; // "0.4.2"
  isDefault?: boolean;
  onAction?: () => void; // ⋯ menu trigger
}

export function DeviceRow({
  name,
  platform,
  lastSeen,
  status,
  version,
  isDefault,
  onAction,
}: DeviceRowProps) {
  const statusColor =
    status === 'online'
      ? 'var(--green-accent)'
      : status === 'revoked'
      ? 'var(--red-accent)'
      : 'var(--text-soft)';

  const statusLabel =
    status === 'online' ? 'Online' : status === 'revoked' ? 'Revoked' : 'Offline';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 90px 80px 24px',
        gap: 16,
        alignItems: 'center',
        padding: '14px 16px',
        margin: '0 -16px',
        borderBottom: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--overlay-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'var(--surface-2)',
          border: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-soft)',
        }}
      >
        ⌘
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--settings-body-size)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--ink)',
            letterSpacing: 'var(--track-body-tight)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
          {isDefault && (
            <span
              style={{
                padding: '2px 7px',
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                fontWeight: 'var(--weight-medium)',
                color: 'var(--text-secondary)',
                letterSpacing: 'var(--track-folio)',
                textTransform: 'uppercase',
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline)',
                borderRadius: 999,
              }}
            >
              Default
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-soft)',
            letterSpacing: 'var(--track-body-tight)',
          }}
        >
          {platform ? `${platform}` : ''}
          {platform && lastSeen ? ' · ' : ''}
          {lastSeen ? `last seen ${lastSeen}` : ''}
        </div>
      </div>

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 'var(--weight-medium)',
          color: statusColor,
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
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

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: 'var(--track-body-tight)',
          textAlign: 'right',
        }}
      >
        {version ? `v ${version}` : ''}
      </span>

      <button
        type="button"
        onClick={onAction}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          color: 'var(--text-tertiary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          transition: 'color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--ink)';
          e.currentTarget.style.background = 'var(--overlay-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-tertiary)';
          e.currentTarget.style.background = 'transparent';
        }}
        aria-label="Device options"
      >
        ⋯
      </button>
    </div>
  );
}

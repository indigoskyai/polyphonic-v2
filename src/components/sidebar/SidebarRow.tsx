import React from 'react';

interface Props {
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
}

/**
 * Generic sidebar row — label on the left, optional count on the right.
 *
 * Refactored active state: flat overlay + 2px left accent bar in text-body
 * color. No glow, no inset stroke, no breathing.
 *
 * The CSS for hover/active background lives in index.css under .sidebar-row.
 * If those rules don't exist in your codebase, the inline styles below
 * provide the canonical implementation.
 */
export default function SidebarRow({ label, active, count, onClick }: Props) {
  return (
    <button
      type="button"
      className="sidebar-row w-full flex items-center cursor-pointer text-left"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        padding: '7px 14px',
        margin: '1px 0',
        background: active ? 'var(--overlay-selected)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-md, 10px)',
        transition: 'background 180ms var(--ease-out), color 180ms var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--overlay-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* 2px left accent bar — active state only */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -4,
            top: 7,
            bottom: 7,
            width: 2,
            background: 'var(--text-body)',
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}

      <span
        className="flex-1 truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13.5,
          fontWeight: 500,
          letterSpacing: 'var(--track-body-tight)',
          color: active ? 'var(--ink)' : 'var(--text-primary)',
          transition: 'color 180ms var(--ease-out)',
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: 'var(--track-folio)',
            color: active ? 'var(--text-soft)' : 'var(--text-tertiary)',
            marginLeft: 8,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

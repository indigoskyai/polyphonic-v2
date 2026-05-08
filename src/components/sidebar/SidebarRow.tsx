import React from 'react';

interface Props {
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLButtonElement>;
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
export default function SidebarRow({
  label,
  active,
  count,
  onClick,
  onFocus,
  onPointerDown,
  onPointerEnter,
}: Props) {
  return (
    <button
      type="button"
      className="sidebar-row w-full flex items-center cursor-pointer text-left"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        padding: '7px 16px',
        margin: '1px 0',
        background: active ? 'var(--overlay-active)' : 'transparent',
        border: 'none',
        borderRadius: 8,
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
      {/* Bg-only highlight — no dot, no strip. Pill shape carries the indicator. */}

      <span
        className="flex-1 truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: active ? 600 : 500,
          letterSpacing: '-0.012em',
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

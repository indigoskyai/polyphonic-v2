import React from 'react';

/* ======================================================================
   ModelCard — multi-select card for Models page ensemble.

   Bordered card with checkbox affordance + name + lowercase mono ID
   + optional flags (Reasoning, Multimodal, etc).

   Active state: surface-step + filled checkbox with checkmark.
   ====================================================================== */

interface ModelFlag {
  label: string;
  variant?: 'default' | 'reasoning' | 'multimodal' | 'new';
}

interface ModelCardProps {
  name: string;
  id: string;
  flags?: ModelFlag[];
  active: boolean;
  onToggle: () => void;
}

export function ModelCard({ name, id, flags = [], active, onToggle }: ModelCardProps) {
  return (
    <div
      role="checkbox"
      aria-checked={active}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr auto',
        gap: 14,
        alignItems: 'center',
        padding: '12px 14px',
        background: active ? 'var(--surface-2)' : 'var(--surface-1)',
        border: `1px solid ${active ? 'var(--border)' : 'var(--border-faint)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
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
          borderRadius: 4,
          border: `1.5px solid ${active ? 'var(--ink)' : 'var(--border-strong)'}`,
          background: active ? 'var(--ink)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
        }}
      >
        {active && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--canvas)',
              fontWeight: 'var(--weight-semibold)',
              lineHeight: 1,
            }}
          >
            ✓
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--settings-body-size)',
            fontWeight: 'var(--weight-medium)',
            color: active ? 'var(--ink)' : 'var(--text-primary)',
            letterSpacing: 'var(--track-body-tight)',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: 'var(--track-mono)',
            lineHeight: 1.45,
          }}
        >
          {id}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {flags.map((flag, i) => {
          const flagStyles =
            flag.variant === 'reasoning'
              ? {
                  color: 'var(--amber-soft)',
                  borderColor: 'color-mix(in srgb, var(--amber-soft) 18%, transparent)',
                  background: 'color-mix(in srgb, var(--amber-soft) 4%, transparent)',
                }
              : {
                  color: 'var(--text-soft)',
                  borderColor: 'var(--hairline)',
                  background: 'var(--surface-2)',
                };
          return (
            <span
              key={i}
              style={{
                ...flagStyles,
                padding: '2px 7px',
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                fontWeight: 'var(--weight-medium)',
                letterSpacing: 'var(--track-folio)',
                textTransform: 'uppercase',
                border: `1px solid ${flagStyles.borderColor}`,
                borderRadius: 999,
              }}
            >
              {flag.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ======================================================================
   ModelListControls — search bar + count meta above the model list.
   ====================================================================== */

interface ModelListControlsProps {
  query: string;
  onQueryChange: (q: string) => void;
  selectedCount: number;
  totalCount: number;
}

export function ModelListControls({
  query,
  onQueryChange,
  selectedCount,
  totalCount,
}: ModelListControlsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          height: 36,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-faint)',
          borderRadius: 999,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-soft)',
          }}
          aria-hidden="true"
        >
          ⌕
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter by name or provider…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: 'var(--text-primary)',
            letterSpacing: 'var(--track-body-tight)',
          }}
        />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 'var(--weight-medium)',
          color: 'var(--text-soft)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {selectedCount}
        </span>{' '}
        selected ·{' '}
        <span
          style={{
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalCount}
        </span>{' '}
        available
      </div>
    </div>
  );
}

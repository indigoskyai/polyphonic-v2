import React from 'react';

/* ======================================================================
   Slider — refined range input.

   Uses a native <input type="range"> with custom styling overlay.
   Shows a hairline track, ink-filled portion, ink thumb with canvas
   ring, and a tabular-nums readout label on the right.

   Example:
     <Slider
       value={fontSize}
       min={12}
       max={18}
       step={1}
       suffix="px"
       onChange={(v) => updateSetting('font_size', v)}
     />
   ====================================================================== */

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  ariaLabel?: string;
  onChange: (v: number) => void;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  suffix = '',
  ariaLabel,
  onChange,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 180,
          height: 18,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Visual track */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 3,
            background: 'var(--surface-3)',
            borderRadius: 999,
            pointerEvents: 'none',
          }}
        />
        {/* Visual fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${pct}%`,
            height: 3,
            background: 'var(--ink)',
            borderRadius: 999,
            pointerEvents: 'none',
          }}
        />
        {/* Visual thumb */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${pct}% - 7px)`,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
            background: 'var(--ink)',
            border: '2px solid var(--canvas)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        {/* Real (transparent) input on top to capture interactions */}
        <input
          type="range"
          aria-label={ariaLabel}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            appearance: 'none',
          }}
        />
      </div>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          fontWeight: 450,
          color: 'var(--text-primary)',
          letterSpacing: 'var(--track-body-tight)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: 40,
          textAlign: 'right',
        }}
      >
        {value}
        {suffix}
      </span>
    </div>
  );
}

import type { CSSProperties } from 'react';

/**
 * PolyphonicMark — the canonical Polyphonic brand symbol.
 *
 * A circle bisected by a vertical line (the ⏀ "monochord" mark): one string
 * over a resonant circle — many tones from a single voice. This is the single
 * source of truth for the brand glyph; use it anywhere a symbol is needed
 * (rail brand mark, favicon, companion overlay, auth/landing, OG art).
 *
 * Stroke uses `currentColor`, so it inherits the surrounding text color and
 * themes cleanly. `strokeWidth` is tuned per context (heavier at small sizes).
 */
export default function PolyphonicMark({
  size = 16,
  strokeWidth = 7,
  className,
  style,
  title,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={style}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="50" cy="50" r="31" />
      <line x1="50" y1="4" x2="50" y2="96" />
    </svg>
  );
}

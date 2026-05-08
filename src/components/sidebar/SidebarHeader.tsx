interface Props {
  folio: string;
  title: string;
  /** Optional eyebrow shown right of the title, e.g. "LIVE". Mono caps,
      with a small breathing sage dot to match the brand identity. */
  eyebrow?: string;
}

/**
 * Sidebar header — large display title + optional mono "LIVE" eyebrow.
 *
 * The folio prop is preserved for callsite compatibility but no longer
 * rendered (Riley's request — was redundant with the rail icon above).
 * The eyebrow is the new optional flourish: mono uppercase 9px with a
 * sage breathing dot, used to mark sections that are actively listening
 * for content (Threads, Mind streams, etc.).
 */
export default function SidebarHeader({ folio: _folio, title, eyebrow }: Props) {
  return (
    <div
      style={{
        padding: '14px 16px 10px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-grotesque)',
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--ink)',
          letterSpacing: 'var(--track-tight)',
          lineHeight: 1.0,
        }}
      >
        {title}
      </div>

      {eyebrow && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: 'var(--track-meta)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
            flex: '0 0 auto',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--luca-full)',
              opacity: 0.78,
              animation: 'livedot-breathe 3s ease-in-out infinite',
            }}
          />
          {eyebrow}
        </span>
      )}
    </div>
  );
}

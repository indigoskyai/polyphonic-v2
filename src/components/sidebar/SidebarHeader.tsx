interface Props {
  folio: string;
  title: string;
}

/**
 * Sidebar header — folio mono caps eye + larger display title.
 *
 * Refreshed typography:
 * - Folio: 10px mono caps, text-soft color, track-folio (0.10em),
 *          font-weight 500
 * - Title: 18px Switzer 500 weight, ink color, track-tight letter-spacing
 */
export default function SidebarHeader({ folio, title }: Props) {
  return (
    <>
      <div style={{ padding: '16px 16px 2px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: 'var(--track-folio)',
            color: 'var(--text-soft)',
            textTransform: 'uppercase',
          }}
        >
          {folio}
        </div>
      </div>
      <div style={{ padding: '2px 16px 12px' }}>
        <div
          style={{
            fontFamily: 'var(--font-grotesque)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: 'var(--track-tight)',
            lineHeight: 1.0,
          }}
        >
          {title}
        </div>
      </div>
    </>
  );
}

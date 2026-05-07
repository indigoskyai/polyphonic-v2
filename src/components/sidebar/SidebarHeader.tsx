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
export default function SidebarHeader({ folio: _folio, title }: Props) {
  // Folio (e.g. "§ 04") removed at Riley's request — was redundant with the
  // nav row above. The prop is preserved for callsite compatibility but no
  // longer rendered. Title alone gives the contextual section enough weight.
  return (
    <div style={{ padding: '14px 16px 12px' }}>
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
    </div>
  );
}

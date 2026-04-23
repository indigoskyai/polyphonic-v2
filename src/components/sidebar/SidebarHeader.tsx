interface Props {
  folio: string;
  title: string;
}

export default function SidebarHeader({ folio, title }: Props) {
  return (
    <>
      <div style={{ padding: '16px 16px 2px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 'var(--track-folio)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
          }}
        >
          {folio}
        </div>
      </div>
      <div style={{ padding: '2px 16px 10px' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: 'var(--track-display)',
          }}
        >
          {title}
        </div>
      </div>
    </>
  );
}

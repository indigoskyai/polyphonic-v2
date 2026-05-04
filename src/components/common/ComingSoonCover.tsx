interface Props {
  title?: string;
  subtitle?: string;
  fullscreen?: boolean;
}

export default function ComingSoonCover({
  title = 'Social intelligence',
  subtitle = 'Public profiles, shareable canvases, and handle claiming are on the roadmap.',
  fullscreen = false,
}: Props) {
  const containerStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--canvas)', zIndex: 10 }
    : { display: 'grid', placeItems: 'center', minHeight: '60vh', padding: '64px 32px' };

  return (
    <div style={containerStyle}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: 'var(--track-meta)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
            marginBottom: 18,
          }}
        >
          § coming soon
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 36,
            fontWeight: 450,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--text-soft)',
            lineHeight: 1.6,
            marginTop: 16,
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

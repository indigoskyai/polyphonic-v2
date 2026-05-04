import ComingSoonCover from '@/components/common/ComingSoonCover';

export default function PublicProfileSettings() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div style={{ padding: '44px 48px 80px', maxWidth: 720 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-meta)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          § settings / public profile
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 42,
            fontWeight: 450,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: 'var(--text-primary)',
            margin: 0,
            marginBottom: 8,
          }}
        >
          Public profile
        </h1>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, marginBottom: 32, lineHeight: 1.55 }}>
          A public canvas at <span style={{ fontFamily: 'var(--font-mono)' }}>polyphonic.app/@yourhandle</span> where you can share artifacts, files, and notes. Visitors will pan and zoom to explore.
        </p>

        <div
          style={{
            border: '1px solid var(--border-faint)',
            borderRadius: 14,
            background: 'var(--surface-1)',
            padding: '24px 22px',
          }}
        >
          <ComingSoonCover
            title="Social intelligence"
            subtitle="Handle claiming, public profiles, and the canvas editor are on the roadmap. We'll let you know when they're ready."
          />
        </div>
      </div>
    </div>
  );
}

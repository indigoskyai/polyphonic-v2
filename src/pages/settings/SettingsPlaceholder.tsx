/**
 * Shared placeholder page for settings categories that haven't been ported yet.
 * Renders the mockup page-header pattern (eyebrow + title + description) so the
 * surface still reads as a legitimate settings page, not a blank area.
 */
interface Props {
  eyebrow: string;   // e.g. "§ 05 / DATA PORTABILITY"
  title: string;     // e.g. "Import & export"
  description?: string;
}

export default function SettingsPlaceholder({ eyebrow, title, description }: Props) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-y-auto"
      style={{ padding: '32px 40px 48px' }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-folio)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        {eyebrow}
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 32,
          fontWeight: 400,
          letterSpacing: 'var(--track-display)',
          color: 'var(--text-primary)',
          marginBottom: description ? 10 : 24,
          lineHeight: 1.15,
        }}
      >
        {title}
      </h1>
      {description && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text-body)',
            maxWidth: 640,
            marginBottom: 32,
          }}
        >
          {description}
        </p>
      )}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 'var(--track-mono)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
        }}
      >
        — Coming soon —
      </div>
    </div>
  );
}

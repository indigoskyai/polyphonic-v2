import { Link } from 'react-router-dom';

const sections = [
  {
    title: 'What Polyphonic Collects',
    body: [
      'Account details such as email address, sign-in provider, profile settings, and authentication events needed to keep the service secure.',
      'Conversation content, memory entries, uploads, imports, agent settings, and related metadata you create while using the app.',
      'Technical diagnostics such as timestamps, request status, browser-visible errors, quota events, and background job health signals.',
      'API keys or provider credentials you choose to add. These are used to run your requested model calls and are handled as sensitive account data.',
    ],
  },
  {
    title: 'How Data Is Used',
    body: [
      'To provide chat, memory, profile, import, agent, and workspace features.',
      'To preserve continuity between sessions and let Luca recall the material you have asked the app to carry.',
      'To protect accounts, diagnose failures, enforce quota limits, and keep scheduled or background systems observable.',
      'To route requests through third-party model, authentication, storage, and infrastructure providers when needed to deliver the service.',
    ],
  },
  {
    title: 'Memory Controls',
    body: [
      'Memory is a core product feature. You can inspect memory surfaces in the app and use available forget, edit, exclusion, and revision controls where provided.',
      'When you delete or change memory-related data, Polyphonic uses that signal to stop carrying the affected information forward in Luca continuity.',
      'Some operational logs and backups may remain for a limited period for security, debugging, or abuse-prevention purposes.',
    ],
  },
  {
    title: 'Sharing And Retention',
    body: [
      'Polyphonic does not sell your conversation content.',
      'Public profile content, published canvas items, and public upload links can be visible to people who can access the published profile URL.',
      'Data is retained while your account is active or while needed for the product, security, legal, or operational reasons described here.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can sign out, reset your password, change account settings, remove memories where controls are available, and request account or data help from the app operator.',
      'You can avoid adding optional imports, uploads, or third-party provider keys if you do not want those systems involved.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <Link to="/auth/login" className="text-xs underline" style={{ color: 'var(--text-ghost)' }}>
          Back to sign in
        </Link>
        <header className="mt-10 mb-10">
          <p className="mb-3 text-[11px] uppercase" style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            Polyphonic
          </p>
          <h1 className="text-3xl font-medium tracking-normal sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            Last updated May 5, 2026. This policy explains what Polyphonic carries, why it carries it, and the controls available to you.
          </p>
        </header>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {section.title}
              </h2>
              <ul className="space-y-3">
                {section.body.map((item) => (
                  <li key={item} className="text-sm leading-7" style={{ color: 'var(--text-tertiary)' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t pt-6 text-xs leading-6" style={{ borderColor: 'var(--border-faint)', color: 'var(--text-ghost)' }}>
          Questions about privacy or account data should be sent through the support channel provided by Polyphonic.
        </footer>
      </div>
    </main>
  );
}

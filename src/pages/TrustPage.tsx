import { Link } from 'react-router-dom';

const sections = [
  {
    title: 'Access & Authentication',
    body: [
      'Sign-in is handled through Polyphonic\'s authentication provider with email/password and Google sign-in. Sessions use signed tokens stored in your browser.',
      'Passwords are never stored in plaintext; they are hashed by the authentication provider.',
      'Account-scoped data is protected by row-level security so users can only read and write their own rows.',
    ],
  },
  {
    title: 'Platform & Hosting',
    body: [
      'Polyphonic is built on the Lovable platform and uses managed Postgres, edge functions, and storage from Lovable Cloud (Supabase). This is a factual description of platform capabilities, not an independent certification.',
      'Edge functions validate incoming JWTs in code, enforce service-role checks where appropriate, and block SSRF to private network ranges for user-supplied URLs.',
    ],
  },
  {
    title: 'Data Collection & Use',
    body: [
      'Polyphonic collects only what the app needs to function: account details, conversation content, memory entries, uploads, agent settings, and technical diagnostics.',
      'Provider API keys you choose to add are encrypted at rest using a server-side passphrase and decrypted only inside trusted server functions.',
      'See the Privacy Policy for the full description of what is collected and how it is used.',
    ],
  },
  {
    title: 'Subprocessors & Integrations',
    body: [
      'Polyphonic routes requests to third-party model, voice, and infrastructure providers (for example OpenRouter, ElevenLabs, and the hosting platform) only as needed to deliver requested features.',
      'Optional integrations such as MCP servers and Solana token-gating only run when you configure them.',
    ],
  },
  {
    title: 'Retention & Deletion',
    body: [
      'Conversation, memory, and profile data are retained while your account is active. Memory surfaces in the app expose edit, forget, and revision controls where provided.',
      'Some operational logs and backups may remain for a limited period for security, debugging, and abuse-prevention purposes.',
      'For account or data deletion requests, contact the Polyphonic operator through the channel below.',
    ],
  },
  {
    title: 'Incident & Security Contact',
    body: [
      'Suspected vulnerabilities or security concerns should be reported through the support channel provided by Polyphonic so they can be triaged and addressed.',
      'This page is maintained by the Polyphonic operator and describes the controls currently enabled in the app. It is editable project content and is not an independent certification or audit.',
    ],
  },
];

export default function TrustPage() {
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
          <h1 className="text-3xl font-medium tracking-normal sm:text-4xl">Trust & Security</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            This page is maintained by the Polyphonic operator to answer common security and privacy questions about the app. It describes controls currently enabled and is not an independent audit or certification.
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
          See also the <Link to="/privacy" className="underline">Privacy Policy</Link> and <Link to="/terms" className="underline">Terms of Service</Link>.
        </footer>
      </div>
    </main>
  );
}

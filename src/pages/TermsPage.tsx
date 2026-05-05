import { Link } from 'react-router-dom';

const sections = [
  {
    title: 'Using Polyphonic',
    body: [
      'You are responsible for the activity on your account and for keeping your sign-in credentials secure.',
      'Use the app lawfully and do not use it to abuse, disrupt, reverse engineer, or attack Polyphonic, its infrastructure, or other users.',
      'You are responsible for the content, uploads, imports, prompts, API keys, and settings you add to the service.',
    ],
  },
  {
    title: 'AI Output',
    body: [
      'Polyphonic uses AI systems and third-party model providers. Outputs can be incomplete, incorrect, or inappropriate for your situation.',
      'Do not treat AI output as professional medical, legal, financial, or safety advice. Use human judgment for consequential decisions.',
      'Memory and continuity features are intended to improve experience, but you remain responsible for reviewing important facts and corrections.',
    ],
  },
  {
    title: 'Content And Memory',
    body: [
      'You keep responsibility for the content you provide. By using the app, you allow Polyphonic to process that content to operate chat, memory, profile, import, agent, and related features.',
      'Published profile content and public uploads may be visible to people with access to the relevant public URL.',
      'You should not upload content you do not have the right to use or share.',
    ],
  },
  {
    title: 'Service Changes',
    body: [
      'Polyphonic may change, limit, suspend, or discontinue features as the product evolves.',
      'Some features depend on third-party authentication, storage, hosting, and model providers. Availability can be affected by those providers.',
      'The app may enforce limits, reject unsafe requests, or remove access when needed to protect users and the service.',
    ],
  },
  {
    title: 'Account And Termination',
    body: [
      'You may stop using Polyphonic at any time. The operator may suspend or terminate access for abuse, security risk, nonpayment where applicable, or violation of these terms.',
      'Requests about account access, data, or deletion should be sent through the support channel provided by Polyphonic.',
    ],
  },
];

export default function TermsPage() {
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
          <h1 className="text-3xl font-medium tracking-normal sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            Last updated May 5, 2026. These terms describe the basic rules for using Polyphonic.
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
          These terms are governed by the policies and support process published by Polyphonic.
        </footer>
      </div>
    </main>
  );
}

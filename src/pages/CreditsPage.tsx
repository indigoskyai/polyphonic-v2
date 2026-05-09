import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * /credits — Open-source attributions.
 *
 * Polyphonic is built on a stack of open-source software. Most of these
 * libraries ship under permissive licenses (MIT, Apache 2.0, ISC, BSD)
 * that don't require attribution for SaaS use, but listing them here is
 * good practice and the right thing to do.
 *
 * Closes PRODUCTION_LAUNCH_CHECKLIST.md "Footer attributions / OSS notices".
 */

interface DepGroup {
  title: string;
  items: Array<{ name: string; license: string; href: string; note?: string }>;
}

const groups: DepGroup[] = [
  {
    title: 'Application framework',
    items: [
      { name: 'React', license: 'MIT', href: 'https://github.com/facebook/react' },
      { name: 'Vite', license: 'MIT', href: 'https://github.com/vitejs/vite' },
      { name: 'TypeScript', license: 'Apache 2.0', href: 'https://github.com/microsoft/TypeScript' },
      { name: 'React Router', license: 'MIT', href: 'https://github.com/remix-run/react-router' },
      { name: 'TanStack Query', license: 'MIT', href: 'https://github.com/TanStack/query' },
      { name: 'Zustand', license: 'MIT', href: 'https://github.com/pmndrs/zustand' },
    ],
  },
  {
    title: 'UI primitives & styling',
    items: [
      { name: 'Radix UI', license: 'MIT', href: 'https://github.com/radix-ui/primitives' },
      { name: 'Tailwind CSS', license: 'MIT', href: 'https://github.com/tailwindlabs/tailwindcss' },
      { name: 'shadcn/ui', license: 'MIT', href: 'https://github.com/shadcn-ui/ui' },
      { name: 'Lucide React', license: 'ISC', href: 'https://github.com/lucide-icons/lucide' },
      { name: 'Sonner', license: 'MIT', href: 'https://github.com/emilkowalski/sonner' },
      { name: 'Vaul', license: 'MIT', href: 'https://github.com/emilkowalski/vaul' },
    ],
  },
  {
    title: 'Backend, data & realtime',
    items: [
      { name: 'Supabase JS', license: 'MIT', href: 'https://github.com/supabase/supabase-js' },
      { name: 'Deno', license: 'MIT', href: 'https://github.com/denoland/deno', note: 'edge function runtime' },
      { name: 'PostgreSQL', license: 'PostgreSQL License', href: 'https://www.postgresql.org/about/licence/' },
      { name: 'pg_cron', license: 'PostgreSQL License', href: 'https://github.com/citusdata/pg_cron' },
      { name: 'pgvector', license: 'PostgreSQL License', href: 'https://github.com/pgvector/pgvector' },
    ],
  },
  {
    title: 'Visualization & rich content',
    items: [
      { name: 'Cytoscape.js', license: 'MIT', href: 'https://github.com/cytoscape/cytoscape.js', note: 'Mnemos memory graph' },
      { name: 'Mermaid', license: 'MIT', href: 'https://github.com/mermaid-js/mermaid', note: 'diagram artifacts' },
      { name: 'Recharts', license: 'MIT', href: 'https://github.com/recharts/recharts' },
      { name: 'react-markdown', license: 'MIT', href: 'https://github.com/remarkjs/react-markdown' },
      { name: 'remark-gfm', license: 'MIT', href: 'https://github.com/remarkjs/remark-gfm' },
      { name: 'KaTeX', license: 'MIT', href: 'https://github.com/KaTeX/KaTeX' },
    ],
  },
  {
    title: 'Typography',
    items: [
      { name: 'Söhne', license: 'commercial', href: '#', note: 'licensed via Klim Type Foundry' },
      { name: 'JetBrains Mono', license: 'OFL 1.1', href: 'https://github.com/JetBrains/JetBrainsMono' },
    ],
  },
];

export default function CreditsPage() {
  useDocumentTitle('Credits');
  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <Link to="/auth/login" className="text-xs underline" style={{ color: 'var(--text-ghost)' }}>
          Back to sign in
        </Link>
        <header className="mt-10 mb-10">
          <p
            className="mb-3 text-[11px] uppercase"
            style={{
              color: 'var(--text-ghost)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
            }}
          >
            Polyphonic
          </p>
          <h1 className="text-3xl font-medium tracking-normal sm:text-4xl">Open-source credits</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-tertiary)' }}>
            Polyphonic is built on a stack of open-source software. Most of the
            libraries below ship under permissive licenses; this page acknowledges
            the work behind the surface.
          </p>
        </header>

        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.title}>
              <h2
                className="mb-4 text-[11px] uppercase"
                style={{
                  color: 'var(--text-soft)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 'var(--track-meta)',
                }}
              >
                {group.title}
              </h2>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li
                    key={item.name}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                  >
                    {item.href === '#' ? (
                      <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                    ) : (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {item.name}
                      </a>
                    )}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-meta)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {item.license}
                    </span>
                    {item.note && (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>· {item.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p
          className="mt-12 text-xs leading-relaxed"
          style={{ color: 'var(--text-ghost)' }}
        >
          This list covers the major dependencies shipped with the application
          surface. Full transitive license metadata is available in the project's
          lockfile. To request acknowledgement of a missing project, open an
          issue or contact the operator.
        </p>

        <p className="mt-8 text-[11px] text-center" style={{ color: 'var(--text-ghost)' }}>
          <Link to="/privacy" className="underline" style={{ color: 'var(--text-ghost)' }}>Privacy</Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <Link to="/terms" className="underline" style={{ color: 'var(--text-ghost)' }}>Terms</Link>
        </p>
      </div>
    </main>
  );
}

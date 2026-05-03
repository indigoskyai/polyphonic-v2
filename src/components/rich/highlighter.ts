// Shiki-powered syntax highlighter (lazy singleton).
// Returns escaped HTML with <span style="color:..."> tokens. Falls back to
// escaped plain text when language is unsupported or before init completes.

import type { HighlighterCore } from 'shiki';

const SUPPORTED = [
  'ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'scss', 'bash', 'shell',
  'sh', 'zsh', 'sql', 'python', 'py', 'rust', 'rs', 'go', 'yaml', 'yml',
  'toml', 'markdown', 'md', 'diff', 'dockerfile', 'java', 'kotlin', 'swift',
  'php', 'ruby', 'rb', 'c', 'cpp', 'csharp', 'cs', 'lua', 'graphql', 'xml',
];

const ALIAS: Record<string, string> = {
  shell: 'bash', sh: 'bash', zsh: 'bash',
  py: 'python', rs: 'rust', rb: 'ruby', cs: 'csharp', md: 'markdown',
  yml: 'yaml', text: 'plaintext', txt: 'plaintext', plain: 'plaintext',
};

let highlighterPromise: Promise<HighlighterCore | null> | null = null;
const loadedLangs = new Set<string>();
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => {
    try { fn(); } catch { /* no-op */ }
  });
}

export function onHighlighterReady(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function normalizeLang(lang: string | null | undefined): string {
  const l = (lang || '').toLowerCase().trim();
  return ALIAS[l] || l || 'plaintext';
}

export function isSupportedLang(lang: string): boolean {
  const norm = normalizeLang(lang);
  return SUPPORTED.includes(norm) || norm === 'plaintext';
}

async function getHighlighter(): Promise<HighlighterCore | null> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      try {
        const shiki = await import('shiki');
        const hl = await shiki.createHighlighter({
          themes: ['github-dark-dimmed'],
          langs: ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'bash', 'python', 'markdown'],
        });
        (globalThis as any).__shikiHl = hl;
        ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'bash', 'python', 'markdown'].forEach((l) => loadedLangs.add(l));
        notify();
        return hl;
      } catch (e) {
        console.warn('[highlighter] shiki failed to load', e);
        return null;
      }
    })();
  }
  return highlighterPromise;
}

// Kick off init eagerly so the first code block renders highlighted.
if (typeof window !== 'undefined') {
  // delay slightly so it doesn't block first paint
  setTimeout(() => { getHighlighter(); }, 50);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/**
 * Synchronous highlight. If the highlighter or language isn't ready,
 * returns escaped plaintext wrapped in a <pre><code> body. Triggers a
 * background load so the next render is highlighted.
 */
export function highlightSync(source: string, langInput: string): string {
  const lang = normalizeLang(langInput);
  const hl = highlighterPromise && (highlighterPromise as any)._sync as HighlighterCore | undefined;
  // We can't synchronously read from the Promise; rely on cached resolved value via a side-channel.
  const cached = hl || (globalThis as any).__shikiHl as HighlighterCore | undefined;

  if (!cached) {
    // ensure init started, return escaped plain
    getHighlighter().then((h) => {
      if (h) {
        (globalThis as any).__shikiHl = h;
        notify();
      }
    });
    return escapeHtml(source);
  }

  if (!SUPPORTED.includes(lang) && lang !== 'plaintext') {
    return escapeHtml(source);
  }

  if (lang !== 'plaintext' && !loadedLangs.has(lang) && !cached.getLoadedLanguages().includes(lang as any)) {
    // dynamically load language then notify
    cached.loadLanguage(lang as any).then(() => {
      loadedLangs.add(lang);
      notify();
    }).catch(() => {/* ignore */});
    return escapeHtml(source);
  }

  try {
    const html = cached.codeToHtml(source, {
      lang: lang === 'plaintext' ? 'text' : (lang as any),
      theme: 'github-dark-dimmed',
    });
    // Strip outer <pre class=shiki ...><code>...</code></pre> wrapper, keep inner.
    const inner = html.replace(/^<pre[^>]*><code[^>]*>/, '').replace(/<\/code><\/pre>\s*$/, '');
    return inner;
  } catch {
    return escapeHtml(source);
  }
}

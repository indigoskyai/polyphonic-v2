import { useEffect } from 'react';

/**
 * useDocumentTitle — set the browser tab title for the current route.
 *
 * Tiny hook, no deps. Title resets to the previous value on unmount so
 * route navigation doesn't strand a stale title between renders. Uses the
 * format "<page> — Polyphonic" by default; pass `bare: true` for a
 * title that doesn't append the brand suffix (rare; useful for the
 * landing page where the brand IS the page).
 *
 * Closes the launch checklist's §12.7 SEO basics title gate (titles
 * < 60 chars per route, brand suffix included).
 *
 * Usage:
 *   useDocumentTitle('Chat');                    // → "Chat — Polyphonic"
 *   useDocumentTitle('Polyphonic', { bare: true }); // → "Polyphonic"
 */
export function useDocumentTitle(
  title: string,
  options: { bare?: boolean } = {},
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.title;
    const brand = 'Polyphonic';
    const next = options.bare ? title : title === brand ? brand : `${title} — ${brand}`;
    document.title = next;
    return () => {
      document.title = previous;
    };
  }, [title, options.bare]);
}

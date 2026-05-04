/**
 * Tiny LRU cache for completed (non-streaming) code-block highlights.
 * Keyed on `${lang}\u0000${source}` — the *final* source string. Streaming
 * blocks bypass this cache entirely and render plain text until the closing
 * fence arrives. On thread switch, ChatView calls `clearHighlightCache()`
 * to keep memory bounded across long sessions.
 */

const MAX_ENTRIES = 64;
const cache = new Map<string, string>();

function makeKey(lang: string, source: string): string {
  return `${lang}\u0000${source}`;
}

export function getCachedHighlight(lang: string, source: string): string | undefined {
  const key = makeKey(lang, source);
  const hit = cache.get(key);
  if (hit !== undefined) {
    // touch for LRU behavior
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

export function setCachedHighlight(lang: string, source: string, html: string): void {
  const key = makeKey(lang, source);
  if (cache.has(key)) cache.delete(key);
  cache.set(key, html);
  if (cache.size > MAX_ENTRIES) {
    // delete oldest
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearHighlightCache(): void {
  cache.clear();
}

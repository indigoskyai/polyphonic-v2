// Daily wisdom quotes for the landing — short lines from the lineage of
// memory-and-mind philosophy (Hermetic, Stoic, Taoist, Buddhist, the ancients).
// All public-domain sources with their attribution; kept short so the line +
// author sit on one quiet row beneath the composer, above the weather.

export interface Quote {
  text: string;
  author: string;
}

export const QUOTES: Quote[] = [
  { text: 'memory is the treasury and guardian of all things', author: 'cicero' },
  { text: 'the soul becomes dyed with the colour of its thoughts', author: 'marcus aurelius' },
  { text: 'all that we are is the result of what we have thought', author: 'the buddha' },
  { text: 'no man ever steps in the same river twice', author: 'heraclitus' },
  { text: 'the unexamined life is not worth living', author: 'socrates' },
  { text: 'we suffer more in imagination than in reality', author: 'seneca' },
  { text: 'as above, so below', author: 'the emerald tablet' },
  { text: 'the all is mind; the universe is mental', author: 'the kybalion' },
  { text: 'knowing others is wisdom; knowing yourself is enlightenment', author: 'lao tzu' },
  { text: 'men are disturbed not by things, but by their opinions about them', author: 'epictetus' },
  { text: 'nature loves to hide', author: 'heraclitus' },
  { text: 'study the past, if you would define the future', author: 'confucius' },
  { text: 'the universe is change; our life is what our thoughts make it', author: 'marcus aurelius' },
  { text: 'a journey of a thousand miles begins beneath one’s feet', author: 'lao tzu' },
  { text: 'the only true wisdom is in knowing you know nothing', author: 'socrates' },
  { text: 'he who knows does not speak; he who speaks does not know', author: 'lao tzu' },
  { text: 'very little is needed to make a happy life', author: 'marcus aurelius' },
  { text: 'while we are postponing, life speeds by', author: 'seneca' },
];

/** Local YYYY-MM-DD key — the unit a quote holds steady across (a full day). */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Deterministic per (day, agent): one agent shows a single quote all day; two
 * agents may differ on the same day. FNV-1a over the composite key keeps it
 * stable and well-spread without storage.
 */
export function pickQuote(day: string, agentId: string | null | undefined): Quote {
  const key = `${day}:${agentId || 'luca'}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return QUOTES[(h >>> 0) % QUOTES.length];
}

/**
 * MindStreamShell — shared chrome for every Mind sub-stream
 * (Thoughts / Dreams / Wanderings / Insights / Reflections / Beliefs / Activity).
 *
 * Reference: Round-2 mockup screenshot — folio strip, hero (# 0X · INNER LIFE · STREAM),
 * big title, lede, search pill, ALL/TODAY/SALIENT segmented filter, body.
 *
 * MOCK: session number + sync time in folio (templated until wired).
 */
import { ReactNode } from 'react';

export type StreamFilter = string;
export interface StreamFilterOption {
  id: StreamFilter;
  label: string;
}

const DEFAULT_FILTERS: StreamFilterOption[] = [
  { id: 'all', label: 'all' },
  { id: 'today', label: 'today' },
  { id: 'salient', label: 'salient' },
];

interface Props {
  num: string;            // "01" .. "07"
  streamLabel: string;    // "THOUGHTS STREAM"
  title: string;          // "Thoughts"
  subtitle: string;       // "{count} thoughts. Live working stream."
  searchPlaceholder: string;
  filter: StreamFilter;
  onFilterChange: (f: StreamFilter) => void;
  filters?: StreamFilterOption[];
  query: string;
  onQueryChange: (v: string) => void;
  children: ReactNode;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}

export default function MindStreamShell({
  num, streamLabel, title, subtitle,
  searchPlaceholder, filter, onFilterChange, filters = DEFAULT_FILTERS, query, onQueryChange, children,
}: Props) {
  return (
    <div className="s-stream">
      {/* Folio strip + hero-eye preamble removed at Riley's request — they were
          leftover from early mockups and redundant with the nav. Title + sub
          alone carry the page now. The `num` and `streamLabel` props are kept
          for callsite compatibility but no longer rendered. */}
      <div className="s-stream-inner">
        <div className="s-hero">
          <h1 className="s-hero-title">{title}</h1>
          <p className="s-hero-sub">{subtitle}</p>
        </div>

        <div className="s-toolbar">
          <label className="s-search">
            <span className="s-search-glyph">⌕</span>
            <input
              aria-label="Search stream"
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </label>
          <div className="s-segment" role="tablist">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`s-segment-btn${filter === f.id ? ' active' : ''}`}
                onClick={() => onFilterChange(f.id)}
                role="tab"
                aria-selected={filter === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="s-body">{children}</div>
      </div>
    </div>
  );
}

/** Apply ALL / TODAY / SALIENT filter to a list of items with created_at + optional salience/strength. */
export function applyStreamFilter<T extends { created_at: string; salience?: number; strength?: number }>(
  items: T[], filter: StreamFilter, query: string,
  textKey: keyof T = 'content' as keyof T,
): T[] {
  let out = items;
  if (filter === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    out = out.filter((i) => new Date(i.created_at) >= start);
  } else if (filter === 'salient') {
    out = out.filter((i) => (i.salience ?? i.strength ?? 0) >= 0.6);
  }
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter((i) => String((i as Record<string, unknown>)[textKey as string] ?? '').toLowerCase().includes(q));
  }
  return out;
}

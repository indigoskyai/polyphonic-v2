/**
 * MnemosStreamShell — Round-2 chrome for every Memory sub-stream.
 * Mirrors MindStreamShell: folio strip · hero (# 0X · MNEMOS · STREAM) ·
 * search pill · ALL/RECENT/SALIENT segmented filter · body.
 *
 * MOCK: session number + sync time in folio (templated until wired).
 */
import { useMemo, ReactNode } from 'react';

export type StreamFilter = 'all' | 'recent' | 'salient';

interface Props {
  num: string;
  streamLabel: string;
  title: string;
  subtitle: string;
  searchPlaceholder?: string;
  filter?: StreamFilter;
  onFilterChange?: (f: StreamFilter) => void;
  query?: string;
  onQueryChange?: (v: string) => void;
  /** Optional extra controls (sort selector etc.) rendered in the toolbar between search + segmented filter. */
  toolbarExtra?: ReactNode;
  /** When true, omit the toolbar entirely (overview pages without filter chrome). */
  hideToolbar?: boolean;
  children: ReactNode;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}

export default function MnemosStreamShell({
  num, streamLabel, title, subtitle,
  searchPlaceholder = 'Search the substrate…',
  filter, onFilterChange, query = '', onQueryChange,
  toolbarExtra, hideToolbar, children,
}: Props) {
  const showToolbar = useMemo(
    () => !hideToolbar && (onQueryChange || onFilterChange || toolbarExtra),
    [hideToolbar, onQueryChange, onFilterChange, toolbarExtra]
  );

  return (
    <div className="s-stream">
      {/* Folio strip — mirrors MindStreamShell */}
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> mnemos</span>
          <span>session 001{/* MOCK */}</span>
        </div>
        <div className="r2-folio-right">
          <span>claude-sonnet-4.5</span>
          <span>{fmtClock()}</span>
        </div>
      </div>

      <div className="s-stream-inner">
        <div className="s-hero">
          <div className="s-hero-eye">
            <span className="num"># {num}</span>
            <span>·</span>
            <span className="v">Mnemos</span>
            <span>·</span>
            <span className="stream">{streamLabel}</span>
          </div>
          <h1 className="s-hero-title">{title}</h1>
          <p className="s-hero-sub">{subtitle}</p>
        </div>

        {showToolbar && (
          <div className="s-toolbar">
            {onQueryChange && (
              <label className="s-search">
                <span className="s-search-glyph">⌕</span>
	                <input
	                  aria-label="Search memory"
	                  type="text"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                />
              </label>
            )}
            {toolbarExtra}
            {filter && onFilterChange && (
              <div className="s-segment" role="tablist">
                {(['all', 'recent', 'salient'] as StreamFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`s-segment-btn${filter === f ? ' active' : ''}`}
                    onClick={() => onFilterChange(f)}
                    role="tab"
                    aria-selected={filter === f}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="s-body">{children}</div>
      </div>
    </div>
  );
}

/** Apply ALL / RECENT (last 7d) / SALIENT (top quartile) filter. */
export function applyMnemosFilter<T extends { created_at: string; strength?: number; confidence?: number }>(
  items: T[], filter: StreamFilter, query: string,
  textKey: string = 'content',
): T[] {
  let out = items;
  if (filter === 'recent') {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    out = out.filter((i) => new Date(i.created_at).getTime() >= cutoff);
  } else if (filter === 'salient') {
    out = out.filter((i) => (i.strength ?? i.confidence ?? 0) >= 0.6);
  }
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter((i) => String((i as Record<string, unknown>)[textKey] ?? '').toLowerCase().includes(q));
  }
  return out;
}

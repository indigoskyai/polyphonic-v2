/**
 * MindStreamShell — shared chrome for every Mind sub-stream
 * (Thoughts / Dreams / Wanderings / Insights / Reflections / Beliefs / Activity).
 *
 * Reference: Round-2 mockup screenshot — folio strip, hero (# 0X · INNER LIFE · STREAM),
 * big title, lede, search pill, ALL/TODAY/SALIENT segmented filter, body.
 *
 * MOCK: session number + sync time in folio (templated until wired).
 */
import { useState, ReactNode } from 'react';

export type StreamFilter = 'all' | 'today' | 'salient';

interface Props {
  num: string;            // "01" .. "07"
  streamLabel: string;    // "THOUGHTS STREAM"
  title: string;          // "Thoughts"
  subtitle: string;       // "{count} thoughts. Live working stream."
  searchPlaceholder: string;
  filter: StreamFilter;
  onFilterChange: (f: StreamFilter) => void;
  query: string;
  onQueryChange: (v: string) => void;
  children: ReactNode;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}

export default function MindStreamShell({
  num, streamLabel, title, subtitle,
  searchPlaceholder, filter, onFilterChange, query, onQueryChange, children,
}: Props) {
  return (
    <div className="s-stream">
      {/* Folio strip — mirrors r2-folio in MindOverview */}
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> mind</span>
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
            <span className="v">Inner life</span>
            <span>·</span>
            <span className="stream">{streamLabel}</span>
          </div>
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
            {(['all', 'today', 'salient'] as StreamFilter[]).map((f) => (
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

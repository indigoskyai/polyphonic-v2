import React from 'react';
import type { PaletteResult, Glyph } from '@/stores/paletteStore';

interface Props {
  groups: { label: string; items: PaletteResult[] }[];
  highlightedId: string | null;
  onHover: (id: string) => void;
  onActivate: (r: PaletteResult) => void;
}

function renderGlyph(g: Glyph | undefined) {
  return (
    <svg className="palette-glyph" data-glyph={g} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {g === 'thread' && <path d="M3 4h10v6H6l-3 2V4z" />}
      {g === 'memory' && (<><circle cx="8" cy="8" r="2" /><circle cx="3" cy="4.5" r="1" /><circle cx="13" cy="4.5" r="1" /><path d="M6.5 7L4 5M9.5 7l2.5-2" /></>)}
      {g === 'file' && <path d="M4 2h6l3 3v9H4V2z" />}
      {g === 'setting' && (<><circle cx="8" cy="8" r="2" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" /></>)}
      {g?.startsWith('agent-') && <circle cx="8" cy="8" r="3" fill="currentColor" />}
      {!g && <circle cx="8" cy="8" r="3" />}
    </svg>
  );
}

function renderTitleWithMatches(title: string, matches: [number, number][] | undefined) {
  if (!matches || matches.length === 0) return title;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach(([start, end], i) => {
    if (cursor < start) out.push(title.slice(cursor, start));
    out.push(<mark key={i}>{title.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < title.length) out.push(title.slice(cursor));
  return out;
}

export default function PaletteResults({ groups, highlightedId, onHover, onActivate }: Props) {
  return (
    <div className="palette-body">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="palette-group-label">{g.label}</div>
          {g.items.map((r) => (
            <button
              key={r.id}
              type="button"
              className="palette-item"
              data-highlighted={r.id === highlightedId ? 'true' : undefined}
              data-glyph={r.glyph}
              onMouseEnter={() => onHover(r.id)}
              onClick={() => onActivate(r)}
            >
              {renderGlyph(r.glyph)}
              <span className="palette-item-body">
                <span className="palette-title">{renderTitleWithMatches(r.title, r.matches)}</span>
                {r.subtitle && <span className="palette-subtitle">{r.subtitle}</span>}
              </span>
              {r.hint && <span className="palette-hint">{r.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

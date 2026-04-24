import React from 'react';
import type { DiffHunk } from '@/stores/checkpointStore';

interface Props {
  hunks?: DiffHunk[];
  loading?: boolean;
}

export default function DiffViewer({ hunks, loading }: Props) {
  if (loading) {
    return <div className="diff-viewer diff-viewer--loading">Loading diff…</div>;
  }
  if (!hunks || hunks.length === 0) {
    return <div className="diff-viewer diff-viewer--empty">No diff content.</div>;
  }
  return (
    <div className="diff-viewer">
      {hunks.map((h, i) => (
        <div key={i} className="diff-hunk">
          <div className="diff-hunk-header">
            @@ -{h.oldStart} +{h.newStart} @@
          </div>
          {h.lines.map((ln, j) => (
            <div key={j} className={`diff-line diff-line--${ln.type}`}>
              <span className="diff-line__num">{ln.oldNum ?? ''}</span>
              <span className="diff-line__num">{ln.newNum ?? ''}</span>
              <span className="diff-line__gutter" aria-hidden="true" />
              <span className="diff-line__text">{ln.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

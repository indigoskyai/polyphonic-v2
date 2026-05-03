import React, { useState } from 'react';
import { highlightSync as highlight } from '@/components/rich/highlighter';

interface Props {
  code: string;
  lang?: string;
  label?: string;
}

export default function CodePreviewCard({ code, lang = '', label }: Props) {
  const [expanded, setExpanded] = useState(false);
  const html = highlight(code, lang);
  return (
    <div className="code-prev" data-expanded={expanded ? 'true' : undefined}>
      <div className="code-prev-header">{label || lang || 'code'}</div>
      <div className="code-prev-lines">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
      <button
        type="button"
        className="code-prev-expand"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  );
}

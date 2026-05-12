import { useState } from 'react';
import { Maximize2, Code2, Eye } from 'lucide-react';
import MediaLightbox from './MediaLightbox';
import CodeBlock from '@/components/rich/CodeBlock';

interface Props {
  source: string;
  title?: string;
}

/**
 * Inline SVG renderer used for `create_artifact kind=svg` style content
 * embedded directly in a chat message. Sandboxed iframe + tap-to-expand.
 */
export default function SvgCard({ source, title }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'preview' | 'code'>('preview');

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:12px;background:transparent;display:flex;align-items:center;justify-content:center}svg{max-width:100%;height:auto;display:block}</style></head><body>${source}</body></html>`;

  return (
    <div className="svg-card">
      <div className="svg-card-toolbar">
        <span className="svg-card-label">{title || 'SVG'}</span>
        <div className="svg-card-actions">
          <button type="button" className="code-icon-btn" onClick={() => setView('preview')} aria-pressed={view === 'preview'} title="Preview">
            <Eye size={11} />
          </button>
          <button type="button" className="code-icon-btn" onClick={() => setView('code')} aria-pressed={view === 'code'} title="View source">
            <Code2 size={11} />
          </button>
          <button type="button" className="code-icon-btn" onClick={() => setOpen(true)} title="Expand">
            <Maximize2 size={11} />
          </button>
        </div>
      </div>
      {view === 'preview' ? (
        <iframe
          title={title || 'SVG preview'}
          sandbox=""
          srcDoc={doc}
          className="svg-card-frame"
        />
      ) : (
        <div className="svg-card-code"><CodeBlock lang="xml" source={source} /></div>
      )}
      <MediaLightbox
        open={open}
        onClose={() => setOpen(false)}
        src=""
        alt={title}
        isSvg
        svgSource={source}
        filename={title}
      />
    </div>
  );
}

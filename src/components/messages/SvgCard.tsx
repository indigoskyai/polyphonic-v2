import { useMemo, useState } from 'react';
import { Maximize2, Code2, Eye, ExternalLink } from 'lucide-react';
import MediaLightbox from './MediaLightbox';
import CodeBlock from '@/components/rich/CodeBlock';
import { sanitizeSvg } from '@/lib/sanitizeSvg';

interface Props {
  source: string;
  title?: string;
  onOpenCanvas?: () => void;
}

/**
 * Inline SVG renderer used for `create_artifact kind=svg` content embedded
 * directly in a chat message. Renders the SVG inline via sanitised
 * dangerouslySetInnerHTML (single source of truth — no iframe reflow blanks
 * on remount) with a toolbar for source/expand/canvas.
 */
export default function SvgCard({ source, title, onOpenCanvas }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'preview' | 'code'>('preview');

  const clean = useMemo(() => sanitizeSvg(source), [source]);

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
          {onOpenCanvas && (
            <button type="button" className="code-icon-btn" onClick={onOpenCanvas} title="Open in canvas">
              <ExternalLink size={11} />
            </button>
          )}
        </div>
      </div>
      {view === 'preview' ? (
        <div
          className="svg-card-frame"
          role="img"
          aria-label={title || 'SVG preview'}
          dangerouslySetInnerHTML={{ __html: clean }}
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

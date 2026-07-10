import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Link as LinkIcon, Wand2, Check } from 'lucide-react';
import { sanitizeSvg } from '@/lib/sanitizeSvg';


interface Props {
  open: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
  /** When true, render as SVG via iframe sandbox; otherwise <img>. */
  isSvg?: boolean;
  /** Raw SVG markup when isSvg is true and we want to download as .svg. */
  svgSource?: string;
  /** If provided, enables the "Edit with prompt" affordance. */
  onEditWithPrompt?: (prompt: string) => void;
  /** Suggested filename (no extension). */
  filename?: string;
}

/**
 * Fullscreen, portal-rendered viewer for generated images and SVGs.
 * Supports download, copy-link, and an inline "edit with prompt" composer.
 */
export default function MediaLightbox({
  open, onClose, src, alt, isSvg, svgSource, onEditWithPrompt, filename,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const baseName = (filename || alt || 'image').replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'image';

  const handleDownload = async () => {
    try {
      if (isSvg && svgSource) {
        const blob = new Blob([svgSource], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${baseName}.svg`; a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      a.href = url; a.download = `${baseName}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, '_blank', 'noopener');
    }
  };

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(src); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {
      // Clipboard access can be denied by the browser; opening still works.
    }
  };

  const submitEdit = () => {
    const p = prompt.trim();
    if (!p || !onEditWithPrompt) return;
    onEditWithPrompt(p);
    setPrompt('');
    setEditing(false);
    onClose();
  };

  return createPortal(
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Media preview'}
      onClick={onClose}
    >
      <div className="media-lightbox-shell" onClick={(e) => e.stopPropagation()}>
        <div className="media-lightbox-toolbar">
          {onEditWithPrompt && (
            <button type="button" className="media-lightbox-btn" onClick={() => setEditing((v) => !v)} title="Edit with prompt">
              <Wand2 size={14} /><span>Edit</span>
            </button>
          )}
          <button type="button" className="media-lightbox-btn" onClick={handleCopyLink} title="Copy link">
            {copied ? <Check size={14} /> : <LinkIcon size={14} />}<span>{copied ? 'Copied' : 'Link'}</span>
          </button>
          <button type="button" className="media-lightbox-btn" onClick={handleDownload} title="Download">
            <Download size={14} /><span>Download</span>
          </button>
          <button type="button" className="media-lightbox-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="media-lightbox-stage">
          {isSvg && svgSource ? (
            <div
              className="media-lightbox-svg"
              role="img"
              aria-label={alt || 'SVG preview'}
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(svgSource) }}
            />
          ) : (
            <img src={src} alt={alt || ''} className="media-lightbox-img" />
          )}
        </div>
      </div>


      {editing && onEditWithPrompt && (
        <div className="media-lightbox-edit" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); }}
            placeholder="Describe the change… (e.g. make it nighttime)"
            className="media-lightbox-input"
          />
          <button type="button" className="media-lightbox-btn primary" onClick={submitEdit} disabled={!prompt.trim()}>
            Apply
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

import { useState } from 'react';
import { Maximize2, Download } from 'lucide-react';
import MediaLightbox from './MediaLightbox';

interface Props {
  src?: string;
  alt?: string;
  agent?: 'luca' | 'vektor' | 'anima';
  /** Storage path for follow-up edits (passed to edit_image tool). */
  storagePath?: string;
  /** Revised prompt returned by the model — shown as caption tooltip. */
  revisedPrompt?: string;
}

/**
 * Inline raster image card for generated images. Tap to open lightbox,
 * with quick download. Replaces ImagePreview for `generate_image`/`edit_image`
 * tool results so users get expand + download + edit-with-prompt UX.
 */
export default function ImageCard({ src, alt, agent, storagePath, revisedPrompt }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="img-card img-card-empty" data-agent={agent}>
        <span className="img-prev-placeholder">{alt || 'image unavailable'}</span>
      </div>
    );
  }

  const handleQuickDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const base = (alt || 'image').replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'image';
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      a.href = url; a.download = `${base}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, '_blank', 'noopener');
    }
  };

  const onEditWithPrompt = (prompt: string) => {
    // Surface a chat instruction so the planner calls edit_image on this image.
    const sourceRef = storagePath ? ` (source storage_path: ${storagePath})` : '';
    const text = `Edit the previous image${sourceRef}: ${prompt}`;
    try {
      window.dispatchEvent(new CustomEvent('luca:prefill-composer', { detail: { text, autoSend: true } }));
    } catch { /* no-op */ }
  };

  return (
    <>
      <button
        type="button"
        className="img-card"
        data-agent={agent}
        onClick={() => setOpen(true)}
        aria-label={`Open ${alt || 'image'} in fullscreen`}
        title={revisedPrompt || alt || 'View image'}
      >
        {!loaded && <div className="img-card-shimmer" aria-hidden="true" />}
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
        <div className="img-card-overlay" aria-hidden="true">
          <span className="img-card-chip"><Maximize2 size={12} /> expand</span>
          <span className="img-card-chip" onClick={handleQuickDownload} role="button"><Download size={12} /> save</span>
        </div>
      </button>
      <MediaLightbox
        open={open}
        onClose={() => setOpen(false)}
        src={src}
        alt={alt}
        filename={alt}
        onEditWithPrompt={storagePath ? onEditWithPrompt : undefined}
      />
    </>
  );
}

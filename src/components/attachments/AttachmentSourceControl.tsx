import { useEffect, useRef } from 'react';
import { Camera, FileUp, ImagePlus, Plus } from 'lucide-react';

interface AttachmentSourceControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFiles: () => void;
  onPhotos: () => void;
  onCamera: () => void;
  disabled?: boolean;
}

export default function AttachmentSourceControl({
  open,
  onOpenChange,
  onFiles,
  onPhotos,
  onCamera,
  disabled = false,
}: AttachmentSourceControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node | null)) onOpenChange(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [open, onOpenChange]);

  const choose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <div ref={rootRef} className={`attachment-source-control${open ? ' open' : ''}`}>
      <button
        type="button"
        className="attach-btn"
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Attach files"
        title="Attach files"
      >
        <Plus size={15} strokeWidth={1.55} aria-hidden="true" />
      </button>
      {open && (
        <div className="attachment-source-menu" role="menu" aria-label="Add attachment">
          <button type="button" role="menuitem" onClick={() => choose(onFiles)}>
            <FileUp size={16} strokeWidth={1.55} aria-hidden="true" />
            <span><strong>Upload files</strong><small>Documents, code, audio, video</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onPhotos)}>
            <ImagePlus size={16} strokeWidth={1.55} aria-hidden="true" />
            <span><strong>Photo library</strong><small>Images and screenshots</small></span>
          </button>
          <button type="button" role="menuitem" className="attachment-source-camera" onClick={() => choose(onCamera)}>
            <Camera size={16} strokeWidth={1.55} aria-hidden="true" />
            <span><strong>Take a photo</strong><small>Use this device's camera</small></span>
          </button>
        </div>
      )}
    </div>
  );
}

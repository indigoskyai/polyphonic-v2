import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // The composer clips its animated border with overflow:hidden. Render the
  // source menu at the document layer and keep it anchored to the + trigger so
  // it cannot be occluded by the composer, hero, scroll plane, or group room.
  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const gutter = 8;
      const gap = 9;

      const left = Math.max(
        viewportLeft + gutter,
        Math.min(viewportRight - menuRect.width - gutter, triggerRect.left),
      );
      const above = triggerRect.top - menuRect.height - gap;
      const below = triggerRect.bottom + gap;
      const top = above >= viewportTop + gutter
        ? above
        : Math.min(below, viewportBottom - menuRect.height - gutter);

      setMenuPosition({ top: Math.max(viewportTop + gutter, top), left });
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      window.visualViewport?.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('scroll', positionMenu);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
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
        ref={triggerRef}
        type="button"
        className="attach-btn"
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label="Attach files"
        title="Attach files"
      >
        <Plus size={15} strokeWidth={1.55} aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="attachment-source-menu attachment-source-menu--portal"
          role="menu"
          aria-label="Add attachment"
          style={menuPosition
            ? { top: menuPosition.top, left: menuPosition.left }
            : { visibility: 'hidden' }}
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
}

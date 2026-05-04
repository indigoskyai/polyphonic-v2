import { useEffect, useMemo, useRef } from 'react';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import CanvasItem from './CanvasItem';
import { useCanvasViewport } from './useCanvasViewport';
import { isVisible } from '@/lib/canvasGeometry';

interface Props {
  mode: 'view' | 'edit';
  /** When provided, becomes the initial viewport (otherwise uses profile.home_viewport). */
  initialViewport?: { x: number; y: number; zoom: number };
  /** Called whenever the viewport settles (debounced). */
  onViewportChange?: (vp: { x: number; y: number; zoom: number }) => void;
}

export default function InfiniteCanvas({ mode, initialViewport, onViewportChange }: Props) {
  const items = useProfileCanvasStore((s) => s.items);
  const profile = useProfileCanvasStore((s) => s.profile);
  const setSelected = useProfileCanvasStore((s) => s.setSelected);

  const containerRef = useRef<HTMLDivElement>(null);
  const initial = initialViewport || profile?.home_viewport || { x: 0, y: 0, zoom: 1 };
  const { viewport, panCursor } = useCanvasViewport({ containerRef, enabled: true, initial });

  // debounced viewport persistence
  useEffect(() => {
    if (!onViewportChange) return;
    const t = setTimeout(() => onViewportChange(viewport), 400);
    return () => clearTimeout(t);
  }, [viewport, onViewportChange]);

  // Click background to clear selection in edit mode
  const onBgClick = () => { if (mode === 'edit') setSelected(null); };

  // viewport culling above N items
  const containerRect = containerRef.current?.getBoundingClientRect();
  const visibleItems = useMemo(() => {
    if (items.length <= 80 || !containerRect) return items;
    return items.filter((it) =>
      isVisible({ x: it.x, y: it.y, w: it.w, h: it.h }, viewport, { width: containerRect.width, height: containerRect.height }),
    );
  }, [items, viewport, containerRect?.width, containerRect?.height]);

  return (
    <div
      ref={containerRef}
      className="canvas-root"
      onClick={onBgClick}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        background: 'var(--canvas)',
        cursor: panCursor ? 'grabbing' : (mode === 'edit' ? 'default' : 'grab'),
        // dotted grid that scales with zoom
        backgroundImage: 'radial-gradient(rgba(220,219,216,0.06) 1px, transparent 1px)',
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x * viewport.zoom}px ${viewport.y * viewport.zoom}px`,
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute', left: 0, top: 0,
          transform: `scale(${viewport.zoom}) translate3d(${viewport.x}px, ${viewport.y}px, 0)`,
          transformOrigin: '0 0',
          width: 1, height: 1, // logical anchor; items are absolute
        }}
      >
        {visibleItems.map((it) => (
          <CanvasItem key={it.id} itemId={it.id} mode={mode} zoom={viewport.zoom} />
        ))}
      </div>
    </div>
  );
}

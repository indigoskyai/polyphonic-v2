import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileItem } from '@/stores/profileCanvasStore';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import ArtifactTile from './items/ArtifactTile';
import UploadTile from './items/UploadTile';
import NoteTile from './items/NoteTile';
import { Trash2, Layers } from 'lucide-react';

interface Props {
  itemId: string;
  mode: 'view' | 'edit';
  zoom: number;
}

function CanvasItemImpl({ itemId, mode, zoom }: Props) {
  const item = useProfileCanvasStore((s) => s.items.find((i) => i.id === itemId)!);
  const selected = useProfileCanvasStore((s) => s.selectedId === itemId);
  const setSelected = useProfileCanvasStore((s) => s.setSelected);
  const persistItem = useProfileCanvasStore((s) => s.persistItem);
  const patchItem = useProfileCanvasStore((s) => s.patchItem);
  const removeItem = useProfileCanvasStore((s) => s.removeItem);
  const bringForward = useProfileCanvasStore((s) => s.bringForward);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    type: 'move' | 'resize';
    startX: number; startY: number;
    startItem: { x: number; y: number; w: number; h: number };
    handle?: string;
  } | null>(null);
  const [interacting, setInteracting] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (mode !== 'edit') return;
    const target = e.target as HTMLElement;
    const handle = target.dataset.resize;
    if (!handle && !target.closest('[data-drag-handle]')) {
      // Allow inner clicks on content (e.g. opening files in view of edit)
      // but still enable drag from the item body when nothing else captured it
      if (!target.closest('[data-canvas-item-body]')) return;
    }
    e.stopPropagation();
    e.preventDefault();
    setSelected(itemId);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      type: handle ? 'resize' : 'move',
      startX: e.clientX, startY: e.clientY,
      startItem: { x: item.x, y: item.y, w: item.w, h: item.h },
      handle,
    };
    setInteracting(true);
  }, [item.x, item.y, item.w, item.h, itemId, mode, setSelected]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragStateRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    if (d.type === 'move') {
      patchItem(itemId, { x: d.startItem.x + dx, y: d.startItem.y + dy });
    } else {
      const next = { ...d.startItem };
      const h = d.handle || '';
      if (h.includes('e')) next.w = Math.max(80, d.startItem.w + dx);
      if (h.includes('s')) next.h = Math.max(60, d.startItem.h + dy);
      if (h.includes('w')) { next.w = Math.max(80, d.startItem.w - dx); next.x = d.startItem.x + (d.startItem.w - next.w); }
      if (h.includes('n')) { next.h = Math.max(60, d.startItem.h - dy); next.y = d.startItem.y + (d.startItem.h - next.h); }
      patchItem(itemId, next);
    }
  }, [itemId, patchItem, zoom]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragStateRef.current;
    if (!d) return;
    dragStateRef.current = null;
    setInteracting(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {
      // Pointer capture may already be released after fast drags.
    }
    // Persist final state
    persistItem(itemId, { x: item.x, y: item.y, w: item.w, h: item.h });
  }, [item.x, item.y, item.w, item.h, itemId, persistItem]);

  // ESC clears selection (handled at canvas level too)
  useEffect(() => { /* noop placeholder for future */ }, []);

  const editClass = mode === 'edit' ? ' is-edit' : '';
  const selClass = selected && mode === 'edit' ? ' is-selected' : '';

  // Window-chrome label per item type — monochrome, no traffic-light hues.
  const chromeLabel =
    item.item_type === 'artifact' ? ((item.payload as any)?.snapshot?.title || 'artifact')
    : item.item_type === 'upload' ? ((item.payload as any)?.original_name || 'upload')
    : 'note';
  const chromeMeta =
    item.item_type === 'artifact' ? ((item.payload as any)?.snapshot?.kind || '')
    : item.item_type === 'upload' ? ((item.payload as any)?.mime || '').split('/')[0]
    : '';

  return (
    <div
      ref={wrapRef}
      data-canvas-item
      className={`canvas-item has-chrome${editClass}${selClass}${interacting ? ' is-dragging' : ''}`}
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: item.w,
        height: item.h,
        transform: `translate3d(${item.x}px, ${item.y}px, 0) rotate(${item.rotation}deg)`,
        zIndex: item.z,
        willChange: interacting ? 'transform' : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => { if (mode === 'edit') { e.stopPropagation(); setSelected(itemId); } }}
    >
      <div data-drag-handle className="canvas-item-chrome" title={mode === 'edit' ? 'Drag to move' : undefined}>
        <span className="canvas-item-chrome-dots" aria-hidden>
          <span className="canvas-item-chrome-dot is-strong" />
          <span className="canvas-item-chrome-dot" />
          <span className="canvas-item-chrome-dot" />
        </span>
        <span className="canvas-item-chrome-title">{chromeLabel}</span>
        {chromeMeta && <span className="canvas-item-chrome-meta">{chromeMeta}</span>}
      </div>
      <div data-canvas-item-body className="canvas-item-body">
        {item.item_type === 'artifact' && <ArtifactTile payload={item.payload as any} mode={mode} interacting={interacting} />}
        {item.item_type === 'upload'   && <UploadTile   payload={item.payload as any} mode={mode} />}
        {item.item_type === 'note'     && <NoteTile     payload={item.payload as any} mode={mode} />}
      </div>
      {item.caption && (
        <div className="canvas-item-caption">{item.caption}</div>
      )}

      {mode === 'edit' && (
        <>
          {selected && (
            <>
              <div className="canvas-item-toolbar">
                <button type="button" onClick={(e) => { e.stopPropagation(); bringForward(itemId); }} title="Bring forward">
                  <Layers size={12} />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); if (confirm('Remove this item?')) removeItem(itemId); }} title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
              {(['nw','n','ne','e','se','s','sw','w'] as const).map((h) => (
                <span key={h} data-resize={h} className={`canvas-resize-handle h-${h}`} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

const CanvasItem = memo(CanvasItemImpl, (a, b) => a.itemId === b.itemId && a.mode === b.mode && a.zoom === b.zoom);
export default CanvasItem;

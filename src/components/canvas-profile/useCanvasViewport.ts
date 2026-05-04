import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport } from '@/lib/canvasGeometry';
import { clampZoom, fitAll, zoomAtPoint, type AABB } from '@/lib/canvasGeometry';

interface Args {
  containerRef: React.RefObject<HTMLDivElement>;
  enabled?: boolean;
  initial?: Viewport;
}

/**
 * Pan + zoom controller for the infinite canvas.
 * - Two-finger trackpad scroll = pan (deltaX/deltaY)
 * - Pinch / cmd+wheel = zoom around cursor
 * - Space + drag = pan with mouse
 * - Keyboard: arrows pan, +/− zoom, 0 home, 1 fit-all
 */
export function useCanvasViewport({ containerRef, enabled = true, initial }: Args) {
  const [viewport, setViewport] = useState<Viewport>(initial ?? { x: 0, y: 0, zoom: 1 });
  const vpRef = useRef(viewport);
  vpRef.current = viewport;
  const spaceDownRef = useRef(false);
  const draggingRef = useRef<{ startX: number; startY: number; startVpX: number; startVpY: number } | null>(null);
  const [panCursor, setPanCursor] = useState(false);

  // Wheel: pan or zoom
  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // ignore if scrolling inside a child that wants its own scroll
      if ((e.target as HTMLElement).closest('[data-canvas-no-pan]')) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        setViewport((v) => zoomAtPoint(v, v.zoom * factor, e.clientX, e.clientY, rect));
      } else {
        setViewport((v) => ({ ...v, x: v.x - e.deltaX / v.zoom, y: v.y - e.deltaY / v.zoom }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, enabled]);

  // Space to enable drag-to-pan
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        spaceDownRef.current = e.type === 'keydown';
        setPanCursor(spaceDownRef.current);
        if (spaceDownRef.current) e.preventDefault();
      }
      if (e.type === 'keydown') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const v = vpRef.current;
        const PAN = 80 / v.zoom;
        if (e.key === 'ArrowLeft')  setViewport({ ...v, x: v.x + PAN });
        if (e.key === 'ArrowRight') setViewport({ ...v, x: v.x - PAN });
        if (e.key === 'ArrowUp')    setViewport({ ...v, y: v.y + PAN });
        if (e.key === 'ArrowDown')  setViewport({ ...v, y: v.y - PAN });
        if (e.key === '+' || e.key === '=') setViewport({ ...v, zoom: clampZoom(v.zoom * 1.2) });
        if (e.key === '-')                  setViewport({ ...v, zoom: clampZoom(v.zoom / 1.2) });
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [enabled]);

  // Mouse pan
  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const isItem = target.closest('[data-canvas-item]');
      // Pan when: middle mouse, or space-held, or background drag (no item under cursor)
      if (e.button === 1 || spaceDownRef.current || (e.button === 0 && !isItem)) {
        e.preventDefault();
        draggingRef.current = { startX: e.clientX, startY: e.clientY, startVpX: vpRef.current.x, startVpY: vpRef.current.y };
        el.setPointerCapture(e.pointerId);
        setPanCursor(true);
      }
    };
    const onMove = (e: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const v = vpRef.current;
      setViewport({ ...v, x: d.startVpX + (e.clientX - d.startX) / v.zoom, y: d.startVpY + (e.clientY - d.startY) / v.zoom });
    };
    const onUp = (e: PointerEvent) => {
      if (draggingRef.current) {
        draggingRef.current = null;
        try { el.releasePointerCapture(e.pointerId); } catch {}
        setPanCursor(spaceDownRef.current);
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [containerRef, enabled]);

  const setHome = useCallback((vp: Viewport) => setViewport(vp), []);
  const fitAllItems = useCallback((items: AABB[]) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setViewport(fitAll(items, { width: r.width, height: r.height }));
  }, [containerRef]);

  return { viewport, setViewport, setHome, fitAllItems, panCursor };
}

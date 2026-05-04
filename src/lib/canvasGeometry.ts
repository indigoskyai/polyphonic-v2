// Pure geometry helpers for the infinite profile canvas.
// All coordinates are in CANVAS SPACE (logical units). The viewport applies
// a single transform: screen = (canvas + pan) * zoom.

export interface Viewport {
  x: number; // pan x in canvas units (negative = look further right)
  y: number; // pan y in canvas units
  zoom: number; // 1 = 1px canvas == 1px screen
}

export interface AABB { x: number; y: number; w: number; h: number; }

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** Screen pixel coords -> canvas-space coords, given current viewport + canvas DOMRect. */
export function screenToCanvas(sx: number, sy: number, vp: Viewport, rect: DOMRect): { x: number; y: number } {
  return {
    x: (sx - rect.left) / vp.zoom - vp.x,
    y: (sy - rect.top) / vp.zoom - vp.y,
  };
}

/** Zoom around a screen point (e.g. cursor) so the point under the cursor stays put. */
export function zoomAtPoint(vp: Viewport, nextZoom: number, sx: number, sy: number, rect: DOMRect): Viewport {
  const z = clampZoom(nextZoom);
  if (z === vp.zoom) return vp;
  const cx = (sx - rect.left) / vp.zoom - vp.x;
  const cy = (sy - rect.top) / vp.zoom - vp.y;
  return {
    zoom: z,
    x: (sx - rect.left) / z - cx,
    y: (sy - rect.top) / z - cy,
  };
}

/** Compute viewport that fits all items into rect with given padding. */
export function fitAll(items: AABB[], rect: { width: number; height: number }, padding = 80): Viewport {
  if (items.length === 0) return { x: 0, y: 0, zoom: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  const zx = (rect.width - padding * 2) / bw;
  const zy = (rect.height - padding * 2) / bh;
  const zoom = clampZoom(Math.min(zx, zy, 1));
  return {
    zoom,
    x: -minX + (rect.width / zoom - bw) / 2,
    y: -minY + (rect.height / zoom - bh) / 2,
  };
}

/** Test whether an item AABB is visible in the current viewport (with buffer). */
export function isVisible(item: AABB, vp: Viewport, rect: { width: number; height: number }, buffer = 200): boolean {
  const left = -vp.x - buffer / vp.zoom;
  const top = -vp.y - buffer / vp.zoom;
  const right = left + (rect.width + buffer * 2) / vp.zoom;
  const bottom = top + (rect.height + buffer * 2) / vp.zoom;
  return !(item.x + item.w < left || item.x > right || item.y + item.h < top || item.y > bottom);
}

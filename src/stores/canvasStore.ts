import { create } from 'zustand';

// State for the artifact canvas — the side panel that opens like Claude
// Artifacts / ChatGPT Canvas. Kept separate from artifactStore (which owns the
// data) so the data store stays free of view concerns.

const WIDTH_KEY = 'polyphonic.canvasWidth';
export const CANVAS_MIN_WIDTH = 380;
export const CANVAS_MAX_WIDTH = 920;
const DEFAULT_WIDTH = 480;

function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(v) && v >= CANVAS_MIN_WIDTH && v <= CANVAS_MAX_WIDTH) return v;
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

interface CanvasState {
  isOpen: boolean;
  activeArtifactId: string | null;
  view: 'preview' | 'code';
  fullscreen: boolean;
  width: number;
  /** Artifact ids the canvas has already "noticed" per thread — drives auto-open
   *  for genuinely new artifacts without re-popping on revisit. */
  seenByThread: Record<string, Set<string>>;

  open: (artifactId: string) => void;
  close: () => void;
  setView: (view: 'preview' | 'code') => void;
  toggleView: () => void;
  setFullscreen: (on: boolean) => void;
  setWidth: (width: number) => void;
  /** Record ids as seen (without opening). Returns true if any were new. */
  markSeen: (threadId: string, ids: string[]) => boolean;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  isOpen: false,
  activeArtifactId: null,
  view: 'preview',
  fullscreen: false,
  width: loadWidth(),
  seenByThread: {},

  open: (artifactId) => set({ isOpen: true, activeArtifactId: artifactId, view: 'preview' }),
  close: () => set({ isOpen: false, fullscreen: false }),
  setView: (view) => set({ view }),
  toggleView: () => set((s) => ({ view: s.view === 'preview' ? 'code' : 'preview' })),
  setFullscreen: (on) => set({ fullscreen: on }),
  setWidth: (width) => {
    const clamped = Math.max(CANVAS_MIN_WIDTH, Math.min(CANVAS_MAX_WIDTH, Math.round(width)));
    try { localStorage.setItem(WIDTH_KEY, String(clamped)); } catch { /* ignore */ }
    set({ width: clamped });
  },
  markSeen: (threadId, ids) => {
    const prev = get().seenByThread[threadId] ?? new Set<string>();
    const next = new Set(prev);
    let added = false;
    for (const id of ids) { if (!next.has(id)) { next.add(id); added = true; } }
    if (added) set((s) => ({ seenByThread: { ...s.seenByThread, [threadId]: next } }));
    return added;
  },
}));

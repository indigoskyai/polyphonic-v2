import { create } from 'zustand';

const SIDEBAR_WIDTH_KEY = 'polyphonic:sidebarWidth';
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
    }
  } catch { /* localStorage unavailable */ }
  return DEFAULT_WIDTH;
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
  } catch { /* localStorage unavailable */ }
}

interface SidebarState {
  visible: boolean;
  /** Sidebar width in pixels. User-resizable via the right-edge handle.
      Persisted to localStorage so the user's preferred width survives
      reloads. Clamped to [MIN_WIDTH, MAX_WIDTH] on every set. */
  width: number;
  setVisible: (v: boolean) => void;
  setWidth: (w: number) => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  visible: true,
  width: loadWidth(),
  setVisible: (v) => set({ visible: v }),
  setWidth: (w) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)));
    set({ width: clamped });
    saveWidth(clamped);
  },
  toggle: () => set({ visible: !get().visible }),
}));

/** Bounds exposed for any consumer that wants to render drag-edge feedback. */
export const SIDEBAR_WIDTH_BOUNDS = {
  min: MIN_WIDTH,
  max: MAX_WIDTH,
  default: DEFAULT_WIDTH,
};

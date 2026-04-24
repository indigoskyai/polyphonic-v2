import { create } from 'zustand';

export type Scope = 'all' | 'threads' | 'memory' | 'files' | 'settings';

export type Glyph =
  | 'thread'
  | 'memory'
  | 'file'
  | 'setting'
  | 'agent-luca'
  | 'agent-vektor'
  | 'agent-anima';

export interface PaletteResult {
  id: string;
  scope: Exclude<Scope, 'all'>;
  title: string;
  subtitle?: string;
  glyph?: Glyph;
  hint?: string;
  matches?: [number, number][];
  onActivate: () => void;
}

const RECENT_KEY = 'palette_recent_v1';

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function persistRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

interface PaletteState {
  open: boolean;
  query: string;
  scope: Scope;
  highlightedIndex: number;
  recent: string[];
  setOpen: (open: boolean) => void;
  setQuery: (q: string) => void;
  setScope: (s: Scope) => void;
  setHighlightedIndex: (i: number) => void;
  moveHighlight: (delta: number, max: number) => void;
  pushRecent: (q: string) => void;
  clearRecent: () => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  query: '',
  scope: 'all',
  highlightedIndex: 0,
  recent: loadRecent(),

  setOpen: (open) => set({ open, highlightedIndex: 0, query: open ? '' : '' }),

  setQuery: (query) => set({ query, highlightedIndex: 0 }),

  setScope: (scope) => set({ scope, highlightedIndex: 0 }),

  setHighlightedIndex: (highlightedIndex) => set({ highlightedIndex }),

  moveHighlight: (delta, max) => set((s) => {
    if (max <= 0) return { highlightedIndex: 0 };
    const next = (s.highlightedIndex + delta + max) % max;
    return { highlightedIndex: next };
  }),

  pushRecent: (q) => set((s) => {
    const v = q.trim();
    if (!v || v.length < 2) return {};
    const next = [v, ...s.recent.filter((r) => r !== v)].slice(0, 8);
    persistRecent(next);
    return { recent: next };
  }),

  clearRecent: () => {
    persistRecent([]);
    set({ recent: [] });
  },
}));

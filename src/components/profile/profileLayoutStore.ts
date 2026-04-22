import { create } from 'zustand';

/** A "star" the user can select in the Constellation. */
export type SelectedStar = {
  id: string;
  category: string;
  label: string;
  detail: string;
  score?: number;
  evidence?: string;
  tags?: string[];
};

interface ProfileLayoutState {
  view: 'cosmos' | 'classic';
  setView: (v: 'cosmos' | 'classic') => void;

  selected: SelectedStar | null;
  select: (s: SelectedStar | null) => void;

  evidenceOpen: boolean;
  setEvidenceOpen: (b: boolean) => void;

  hovered: string | null;
  setHovered: (id: string | null) => void;

  /** ms-since-epoch position of the user's "time cursor" on the climate ribbon. null = now. */
  timeCursor: number | null;
  setTimeCursor: (t: number | null) => void;

  /** Climate-band the user is hovering — drives star highlighting in the constellation. */
  hoveredCategory: string | null;
  setHoveredCategory: (c: string | null) => void;

  /** Persisted order of currents widgets. */
  widgetOrder: string[];
  setWidgetOrder: (ids: string[]) => void;
}

const WIDGET_ORDER_KEY = 'inner-cosmos:widget-order';
const DEFAULT_ORDER = ['circadian', 'weekly', 'recurrence', 'belief-drift', 'questions'];

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(WIDGET_ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    // Keep only known ids, append any missing defaults so new widgets show up.
    const filtered = parsed.filter((id: string) => DEFAULT_ORDER.includes(id));
    for (const id of DEFAULT_ORDER) if (!filtered.includes(id)) filtered.push(id);
    return filtered;
  } catch {
    return DEFAULT_ORDER;
  }
}

export const useProfileLayoutStore = create<ProfileLayoutState>((set) => ({
  view: 'cosmos',
  setView: (v) => set({ view: v }),

  selected: null,
  select: (s) => set({ selected: s, evidenceOpen: !!s }),

  evidenceOpen: false,
  setEvidenceOpen: (b) => set({ evidenceOpen: b }),

  hovered: null,
  setHovered: (id) => set({ hovered: id }),

  timeCursor: null,
  setTimeCursor: (t) => set({ timeCursor: t }),

  hoveredCategory: null,
  setHoveredCategory: (c) => set({ hoveredCategory: c }),

  widgetOrder: typeof window !== 'undefined' ? loadOrder() : DEFAULT_ORDER,
  setWidgetOrder: (ids) => {
    try { localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(ids)); } catch {}
    set({ widgetOrder: ids });
  },
}));

import { create } from 'zustand';

/** A "star" the user can select in the Constellation. */
export type SelectedStar = {
  id: string;            // stable id e.g. "big_five:openness"
  category: string;      // "big_five" | "values" | "shadow" | "attachment" | "growth" | "communication" | "cognition" | "relational" | "narrative"
  label: string;         // human label
  detail: string;        // short blurb / evidence
  score?: number;        // 0..100 if applicable
  evidence?: string;     // longer evidence text from profile pass
  tags?: string[];       // tag hints used to fetch supporting memories
};

interface ProfileLayoutState {
  /** Which top-level view of /profile is active. */
  view: 'cosmos' | 'classic';
  setView: (v: 'cosmos' | 'classic') => void;

  /** Currently inspected star (drives evidence panel). */
  selected: SelectedStar | null;
  select: (s: SelectedStar | null) => void;

  /** Whether the right-rail evidence panel is visible. */
  evidenceOpen: boolean;
  setEvidenceOpen: (b: boolean) => void;

  /** Hover preview (no panel, but used to brighten supporting connections). */
  hovered: string | null;
  setHovered: (id: string | null) => void;
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
}));

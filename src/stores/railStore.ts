import { create } from 'zustand';

interface RailState {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  toggle: () => void;
}

export const useRailStore = create<RailState>((set, get) => ({
  expanded: false,
  setExpanded: (v) => set({ expanded: v }),
  toggle: () => set({ expanded: !get().expanded }),
}));

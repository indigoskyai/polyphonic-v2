import { create } from 'zustand';

interface SidebarState {
  visible: boolean;
  setVisible: (v: boolean) => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  visible: true,
  setVisible: (v) => set({ visible: v }),
  toggle: () => set({ visible: !get().visible }),
}));

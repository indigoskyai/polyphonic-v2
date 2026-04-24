import { create } from 'zustand';

export type MobileTab = 'chat' | 'memory' | 'agents' | 'settings';

interface MobileShellState {
  tab: MobileTab;
  drawerOpen: boolean;
  setTab: (t: MobileTab) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useMobileShellStore = create<MobileShellState>((set) => ({
  tab: 'chat',
  drawerOpen: false,
  setTab: (tab) => set({ tab }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));

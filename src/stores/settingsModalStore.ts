import { create } from 'zustand';

interface SettingsModalState {
  open: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  open: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
}));

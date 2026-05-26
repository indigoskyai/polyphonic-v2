import { create } from 'zustand';
import {
  type InterfaceMode,
  type OnboardingPreferences,
  chooseInterfaceMode,
  readStoredInterfaceMode,
  writeStoredInterfaceMode,
  writeStoredOnboardingPreferences,
} from '@/lib/interfaceMode';

interface InterfaceModeState {
  mode: InterfaceMode;
  setMode: (mode: InterfaceMode) => void;
  applyOnboardingPreferences: (preferences: OnboardingPreferences) => InterfaceMode;
}

export const useInterfaceModeStore = create<InterfaceModeState>((set) => ({
  mode: readStoredInterfaceMode(),
  setMode: (mode) => {
    writeStoredInterfaceMode(mode);
    set({ mode });
  },
  applyOnboardingPreferences: (preferences) => {
    const mode = chooseInterfaceMode(preferences);
    writeStoredOnboardingPreferences(preferences);
    writeStoredInterfaceMode(mode);
    set({ mode });
    return mode;
  },
}));

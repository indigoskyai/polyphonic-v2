import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
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
  /**
   * Update the mode. Always writes to localStorage for fast next-load
   * hydration. If a user is signed in, also upserts user_settings so the
   * choice persists across devices and survives a localStorage clear.
   * Returns a Promise that resolves once the DB write settles (or
   * immediately if no user is signed in).
   */
  setMode: (mode: InterfaceMode) => Promise<void>;
  applyOnboardingPreferences: (preferences: OnboardingPreferences) => InterfaceMode;
  /**
   * Hydrate from user_settings after sign-in. Server is the source of
   * truth across devices; localStorage is just a fast-path for the
   * initial render before auth resolves.
   */
  hydrateFromServer: (mode: InterfaceMode | null | undefined) => void;
}

async function persistInterfaceMode(mode: InterfaceMode): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, interface_mode: mode }, { onConflict: 'user_id' });
    if (error) {
      // Column may not exist yet on stale schemas — match firstRun.ts behavior
      // and stay quiet rather than throwing the user out of the mode switch.
      if (error.code !== '42703' && !/interface_mode/i.test(error.message || '')) {
        console.warn('[interfaceModeStore] persist failed', error);
      }
    }
  } catch (err) {
    console.warn('[interfaceModeStore] persist threw', err);
  }
}

export const useInterfaceModeStore = create<InterfaceModeState>((set, get) => ({
  mode: readStoredInterfaceMode(),
  setMode: async (mode) => {
    writeStoredInterfaceMode(mode);
    set({ mode });
    await persistInterfaceMode(mode);
  },
  applyOnboardingPreferences: (preferences) => {
    const mode = chooseInterfaceMode(preferences);
    writeStoredOnboardingPreferences(preferences);
    writeStoredInterfaceMode(mode);
    set({ mode });
    // Onboarding handoff calls markOnboarded() which persists this on the
    // user_settings row already; no extra DB write needed here.
    return mode;
  },
  hydrateFromServer: (mode) => {
    if (!mode) return;
    if (mode === get().mode) return;
    writeStoredInterfaceMode(mode);
    set({ mode });
  },
}));

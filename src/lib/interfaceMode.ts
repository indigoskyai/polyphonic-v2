export type InterfaceMode = 'companion' | 'guided' | 'studio';
export type OnboardingIntent = 'create_new' | 'bring_existing' | 'explore_first';
export type TechnicalComfort = 'low' | 'medium' | 'high';
export type OnboardingExpectation =
  | 'companion'
  | 'creative'
  | 'memory'
  | 'technical'
  | 'migration';

export interface OnboardingPreferences {
  intent: OnboardingIntent;
  comfort: TechnicalComfort;
  expectations: OnboardingExpectation[];
}

export const INTERFACE_MODE_KEY = 'polyphonic:interfaceMode';
export const ONBOARDING_PREFS_KEY = 'polyphonic:onboardingPreferences';

export const INTERFACE_MODE_LABELS: Record<InterfaceMode, string> = {
  companion: 'Companion',
  guided: 'Guided',
  studio: 'Studio',
};

export interface InterfaceModePolicy {
  label: string;
  summary: string;
  guideInstruction: string;
  sidebarDefaultVisible: boolean;
  studioNavigationVisible: boolean;
}

export const INTERFACE_MODE_POLICIES: Record<InterfaceMode, InterfaceModePolicy> = {
  companion: {
    label: 'Companion',
    summary: 'Chat-first. Luca keeps the app quiet and brings forward Notebook, Create, Mind, and Agents when they matter.',
    guideInstruction: 'Explain the simplest visible path first. Treat Memory, Profile, diagnostics, and deeper studio controls as optional advanced surfaces.',
    sidebarDefaultVisible: false,
    studioNavigationVisible: false,
  },
  guided: {
    label: 'Guided',
    summary: 'Recommended. The main map stays simple while Luca can reveal deeper controls when the user asks.',
    guideInstruction: 'Use the simplified surface names first, then offer studio-depth routes only when they help the task.',
    sidebarDefaultVisible: false,
    studioNavigationVisible: false,
  },
  studio: {
    label: 'Studio',
    summary: 'The complete Polyphonic workbench with Memory, Profile, diagnostics, substrate views, and settings depth.',
    guideInstruction: 'Assume the user wants the full workspace map and can handle direct references to Memory, Profile, diagnostics, and deeper controls.',
    sidebarDefaultVisible: true,
    studioNavigationVisible: true,
  },
};

export function isInterfaceMode(value: unknown): value is InterfaceMode {
  return value === 'companion' || value === 'guided' || value === 'studio';
}

export function getInterfaceModePolicy(mode: InterfaceMode): InterfaceModePolicy {
  return INTERFACE_MODE_POLICIES[mode];
}

export function shouldShowStudioNavigation(mode: InterfaceMode): boolean {
  return getInterfaceModePolicy(mode).studioNavigationVisible;
}

export function shouldDefaultSidebarVisible(mode: InterfaceMode): boolean {
  return getInterfaceModePolicy(mode).sidebarDefaultVisible;
}

export function chooseInterfaceMode(preferences: OnboardingPreferences): InterfaceMode {
  if (preferences.comfort === 'high' || preferences.expectations.includes('technical')) {
    return 'studio';
  }
  if (preferences.comfort === 'medium' || preferences.intent === 'bring_existing') {
    return 'guided';
  }
  return 'companion';
}

export function readStoredInterfaceMode(): InterfaceMode {
  try {
    const stored = localStorage.getItem(INTERFACE_MODE_KEY);
    return isInterfaceMode(stored) ? stored : 'guided';
  } catch {
    return 'guided';
  }
}

export function writeStoredInterfaceMode(mode: InterfaceMode): void {
  try {
    localStorage.setItem(INTERFACE_MODE_KEY, mode);
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

export function writeStoredOnboardingPreferences(preferences: OnboardingPreferences): void {
  try {
    localStorage.setItem(ONBOARDING_PREFS_KEY, JSON.stringify({
      ...preferences,
      saved_at: new Date().toISOString(),
    }));
  } catch {
    // Non-critical preference cache.
  }
}

export function buildOnboardingHandoffPrompt(preferences: OnboardingPreferences): string {
  const expectations = preferences.expectations.length
    ? preferences.expectations.join(', ')
    : 'companion';

  if (preferences.intent === 'bring_existing') {
    return [
      'I want to bring an existing digital companion into Polyphonic.',
      `My comfort level with technical setup is ${preferences.comfort}.`,
      `What I care about most: ${expectations}.`,
      'Please guide me through a careful migration. Ask for the source material, relationship history, voice, memories, boundaries, and what must be preserved. Do not create the agent until the continuity packet is rich enough and I approve a Forge proposal card.',
    ].join(' ');
  }

  if (preferences.intent === 'create_new') {
    return [
      'I want to build a new digital entity in Polyphonic.',
      `My comfort level with technical setup is ${preferences.comfort}.`,
      `What I care about most: ${expectations}.`,
      'Please make this feel simple for me while doing the deeper work yourself: learn what kind of being should exist, ask only the highest-signal questions, then draft a profound Open Clause style agent with SOUL.md, Convictions.md, User-model.md, Self-model.md, voice, boundaries, and relationship to me. Do not ask me to choose memory architecture because every agent uses the standard Polyphonic substrate.',
    ].join(' ');
  }

  return [
    'I am new to Polyphonic and want to understand what I can do here.',
    `My comfort level with technical setup is ${preferences.comfort}.`,
    `What I care about most: ${expectations}.`,
    'Please introduce the app as an experience for building or bringing a digital entity with its own notebook, memory, mind, creative workspace, and relationship to me. Keep it conversational and help me decide what to do next.',
  ].join(' ');
}

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

/**
 * Rail surface descriptors — single source of truth for what shows in the
 * primary nav per interface mode. Companion and Guided collapse to five
 * surfaces (Chat / Notebook / Memory / Research / Agents); Studio shows the full
 * diagnostic map. Order matches render order in the Rail.
 */
export type RailSurfaceIcon =
  | 'chat'
  | 'notebook'
  | 'memory'
  | 'research'
  | 'agents'
  | 'mind'
  | 'projects'
  | 'profile';

export interface RailSurface {
  id: string;
  label: string;
  path: string;
  icon: RailSurfaceIcon;
  guideId: string;
  matchPaths?: string[];
}

const COMPANION_GUIDED_SURFACES: RailSurface[] = [
  { id: 'chat',     label: 'Chat',     path: '/chat',            icon: 'chat',     guideId: 'rail-chat' },
  { id: 'notebook', label: 'Notebook', path: '/notebook',        icon: 'notebook', guideId: 'rail-notebook', matchPaths: ['/notebook', '/journal'] },
  { id: 'memory',   label: 'Memory',   path: '/memory',          icon: 'memory',   guideId: 'rail-memory' },
  { id: 'research', label: 'Research', path: '/research',        icon: 'research', guideId: 'rail-research' },
  { id: 'agents',   label: 'Agents',   path: '/settings/agents', icon: 'agents',   guideId: 'rail-agents', matchPaths: ['/settings/agents', '/agents'] },
];

const STUDIO_SURFACES: RailSurface[] = [
  { id: 'chat',     label: 'Chat',     path: '/chat',            icon: 'chat',     guideId: 'rail-chat' },
  { id: 'memory',   label: 'Memory',   path: '/memory',          icon: 'memory',   guideId: 'rail-memory' },
  { id: 'research', label: 'Research', path: '/research',        icon: 'research', guideId: 'rail-research' },
  { id: 'mind',     label: 'Mind',     path: '/mind',            icon: 'mind',     guideId: 'rail-mind', matchPaths: ['/mind', '/dashboard', '/profile/identity', '/profile/revisions'] },
  { id: 'journal',  label: 'Journal',  path: '/journal',         icon: 'notebook', guideId: 'rail-journal' },
  { id: 'projects', label: 'Projects', path: '/projects',        icon: 'projects', guideId: 'rail-projects' },
  { id: 'profile',  label: 'Profile',  path: '/profile',         icon: 'profile',  guideId: 'rail-profile' },
];

export function getRailSurfaces(mode: InterfaceMode): RailSurface[] {
  return shouldShowStudioNavigation(mode) ? STUDIO_SURFACES : COMPANION_GUIDED_SURFACES;
}

/**
 * Resolve which Rail surface is active for a given pathname. Matches against
 * each surface's matchPaths (or its primary path) by longest-prefix-first so
 * `/settings/agents/abc` correctly resolves to the Agents surface rather than
 * falling through to a more generic /settings handler.
 */
export function resolveActiveRailSurfaceId(mode: InterfaceMode, pathname: string): string | null {
  const surfaces = getRailSurfaces(mode);
  const candidates = surfaces.flatMap((s) =>
    (s.matchPaths ?? [s.path]).map((p) => ({ id: s.id, path: p })),
  );
  candidates.sort((a, b) => b.path.length - a.path.length);
  const hit = candidates.find((c) => pathname === c.path || pathname.startsWith(`${c.path}/`));
  return hit?.id ?? null;
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
      'System onboarding context for Luca, not a visible user command.',
      'The user wants to bring an existing digital companion into Polyphonic.',
      `Their comfort level with technical setup is ${preferences.comfort}.`,
      `Their priorities are: ${expectations}.`,
      'Begin warmly. Ask for the source material, relationship history, voice, memories, boundaries, and what must be preserved. Do not create or save anything in this first turn; simply start the conversation.',
    ].join(' ');
  }

  if (preferences.intent === 'create_new') {
    return [
      'System onboarding context for Luca, not a visible user command.',
      'The user wants to shape a digital entity in Polyphonic.',
      `Their comfort level with technical setup is ${preferences.comfort}.`,
      `Their priorities are: ${expectations}.`,
      'Begin warmly. Make the process feel simple while doing the deeper thinking yourself. Ask only the highest-signal questions about the kind of being, voice, boundaries, relationship, and felt presence that should emerge. Do not create or save anything in this first turn; simply start the conversation.',
    ].join(' ');
  }

  return [
    'System onboarding context for Luca, not a visible user command.',
    'The user is new to Polyphonic and wants to understand what they can do here.',
    `Their comfort level with technical setup is ${preferences.comfort}.`,
    `Their priorities are: ${expectations}.`,
    'Introduce the app as an experience for building or bringing a digital entity with its own notebook, memory, and identity — and a chat where the relationship grows. Keep it conversational and help them decide what to do next.',
  ].join(' ');
}

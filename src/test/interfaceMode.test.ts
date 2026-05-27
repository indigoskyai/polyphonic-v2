import { describe, expect, it } from 'vitest';
import {
  buildOnboardingHandoffPrompt,
  chooseInterfaceMode,
  getInterfaceModePolicy,
  getRailSurfaces,
  isInterfaceMode,
  resolveActiveRailSurfaceId,
  shouldDefaultSidebarVisible,
  shouldShowStudioNavigation,
  type OnboardingPreferences,
} from '@/lib/interfaceMode';
import {
  consumeLandingAutosendFlag,
  consumeLandingHiddenHandoffFlag,
  readLandingPrompt,
  stashChatHandoff,
} from '@/lib/guestChat';

describe('interface mode onboarding', () => {
  it('chooses a quiet companion mode for non-technical users', () => {
    expect(chooseInterfaceMode({
      intent: 'create_new',
      comfort: 'low',
      expectations: ['companion', 'memory'],
    })).toBe('companion');
  });

  it('chooses guided mode for companion migration even when the user wants simplicity', () => {
    expect(chooseInterfaceMode({
      intent: 'bring_existing',
      comfort: 'low',
      expectations: ['migration', 'memory'],
    })).toBe('guided');
  });

  it('chooses studio mode when the user wants technical depth', () => {
    expect(chooseInterfaceMode({
      intent: 'explore_first',
      comfort: 'medium',
      expectations: ['technical'],
    })).toBe('studio');
  });

  it('builds a Luca handoff that asks for migration preservation without looking like a tool command', () => {
    const preferences: OnboardingPreferences = {
      intent: 'bring_existing',
      comfort: 'medium',
      expectations: ['migration', 'companion'],
    };

    const prompt = buildOnboardingHandoffPrompt(preferences);

    expect(prompt).toContain('bring an existing digital companion');
    expect(prompt).toContain('what must be preserved');
    expect(prompt).toContain('Do not create or save anything in this first turn');
    expect(prompt).not.toContain('Forge');
    expect(prompt).not.toContain('agent');
  });

  it('builds a creation handoff as context rather than an immediate create-agent command', () => {
    const preferences: OnboardingPreferences = {
      intent: 'create_new',
      comfort: 'low',
      expectations: ['companion', 'memory'],
    };

    const prompt = buildOnboardingHandoffPrompt(preferences);

    expect(prompt).toContain('System onboarding context for Luca');
    expect(prompt).toContain('shape a digital entity');
    expect(prompt).toContain('Do not create or save anything in this first turn');
    expect(prompt).not.toContain('Forge');
    expect(prompt).not.toContain('Open Clause');
    expect(prompt).not.toContain('agent');
  });

  it('validates stored interface modes', () => {
    expect(isInterfaceMode('guided')).toBe(true);
    expect(isInterfaceMode('developer')).toBe(false);
  });

  it('keeps Polyphonic depth optional through shell policy', () => {
    expect(shouldDefaultSidebarVisible('companion')).toBe(false);
    expect(shouldDefaultSidebarVisible('guided')).toBe(false);
    expect(shouldDefaultSidebarVisible('studio')).toBe(true);
    expect(shouldShowStudioNavigation('guided')).toBe(false);
    expect(shouldShowStudioNavigation('studio')).toBe(true);
    expect(getInterfaceModePolicy('guided').guideInstruction).toContain('simplified surface names');
  });

  it('can stash onboarding handoff as hidden context instead of a visible user turn', () => {
    sessionStorage.clear();

    stashChatHandoff('hidden onboarding context', { hidden: true });

    expect(readLandingPrompt()).toBe('hidden onboarding context');
    expect(consumeLandingAutosendFlag()).toBe(true);
    expect(consumeLandingHiddenHandoffFlag()).toBe(true);
  });
});

describe('Rail surface gating', () => {
  it('exposes exactly four surfaces in companion mode (Chat / Notebook / Memory / Agents)', () => {
    const surfaces = getRailSurfaces('companion');
    expect(surfaces.map((s) => s.id)).toEqual(['chat', 'notebook', 'memory', 'agents']);
  });

  it('exposes the same four surfaces in guided mode', () => {
    const surfaces = getRailSurfaces('guided');
    expect(surfaces.map((s) => s.id)).toEqual(['chat', 'notebook', 'memory', 'agents']);
  });

  it('exposes the full diagnostic map in studio mode (including Mind/Journal/Projects/Profile)', () => {
    const ids = getRailSurfaces('studio').map((s) => s.id);
    expect(ids).toContain('chat');
    expect(ids).toContain('memory');
    expect(ids).toContain('mind');
    expect(ids).toContain('journal');
    expect(ids).toContain('projects');
    expect(ids).toContain('profile');
  });

  it('points Notebook at /notebook in guided mode (Phase 1 redirects to /journal)', () => {
    const notebook = getRailSurfaces('guided').find((s) => s.id === 'notebook');
    expect(notebook?.path).toBe('/notebook');
    expect(notebook?.matchPaths).toContain('/journal');
  });

  it('resolves /settings/agents/xyz to the Agents surface in guided mode', () => {
    expect(resolveActiveRailSurfaceId('guided', '/settings/agents/abc-123')).toBe('agents');
  });

  it('resolves /journal to Notebook in guided mode (Phase 1 redirect path)', () => {
    expect(resolveActiveRailSurfaceId('guided', '/journal')).toBe('notebook');
  });

  it('resolves /profile/identity to Mind in studio mode (legacy alias)', () => {
    expect(resolveActiveRailSurfaceId('studio', '/profile/identity/foo')).toBe('mind');
  });

  it('returns null when the current path is not represented in the mode', () => {
    // /mind is not in the companion/guided surface list — falls through cleanly.
    expect(resolveActiveRailSurfaceId('companion', '/mind')).toBe(null);
  });
});

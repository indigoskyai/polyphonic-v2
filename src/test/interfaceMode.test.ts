import { describe, expect, it } from 'vitest';
import {
  buildOnboardingHandoffPrompt,
  chooseInterfaceMode,
  getInterfaceModePolicy,
  isInterfaceMode,
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

  it('builds a Luca handoff that asks for migration preservation before Forge', () => {
    const preferences: OnboardingPreferences = {
      intent: 'bring_existing',
      comfort: 'medium',
      expectations: ['migration', 'companion'],
    };

    const prompt = buildOnboardingHandoffPrompt(preferences);

    expect(prompt).toContain('bring an existing digital companion');
    expect(prompt).toContain('what must be preserved');
    expect(prompt).toContain('Do not create the agent until');
    expect(prompt).toContain('Forge proposal card');
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

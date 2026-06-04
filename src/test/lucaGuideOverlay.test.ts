import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeGuideReply } from '../stores/lucaGuideStore';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('global Polyphonic Guide overlay', () => {
  it('mounts globally from AppShell rather than a single page', () => {
    const app = readRepoFile('src/App.tsx');
    const overlay = readRepoFile('src/components/guide/LucaGuideOverlay.tsx');

    expect(app).toContain('import LucaGuideOverlay');
    expect(app).toContain('<LucaGuideOverlay />');
    expect(overlay).toContain('data-guide-id="luca-guide-launcher"');
    expect(overlay).toContain('luca-guide-mark');
    expect(overlay).toContain('luca-guide-shortcuts-trigger');
    expect(overlay).toContain("pathname === '/chat' || pathname.startsWith('/chat/')");
    expect(overlay).toContain("get('guide') === '1'");
    expect(overlay).toContain('if (hiddenOnChatRoute) return null');
    expect(overlay).toContain('routeInfo(location.pathname)');
    expect(overlay).toContain('interfaceModeInstruction: modePolicy.guideInstruction');
    expect(overlay).toContain('availableTargets: targetsForPath(location.pathname)');
  });

  it('passes current app context to a schema-free guide edge function', () => {
    const store = readRepoFile('src/stores/lucaGuideStore.ts');
    const edge = readRepoFile('supabase/functions/luca-app-guide/index.ts');
    const config = readRepoFile('supabase/config.toml');

    expect(store).toContain("supabase.functions.invoke('luca-app-guide'");
    expect(store).toContain('context');
    expect(config).toMatch(/\[functions\.luca-app-guide\]\s+verify_jwt = false/);
    expect(edge).toContain('You are Polyphonic Guide, the app-help assistant inside Polyphonic.');
    expect(edge).toContain('You are not Luca, not a custom agent');
    expect(edge).toContain('warm in-app guide presence');
    expect(edge).toContain('Respond to meaning, not exact phrases');
    expect(edge).toContain('ask one natural question');
    expect(edge).toContain('Never say "I\'m Luca"');
    expect(edge).toContain('Do not restart onboarding or give a generic welcome every time');
    expect(edge).toContain('GUIDE_MODEL_TIMEOUT_MS');
    expect(edge).toContain('fallbackGuideResponse');
    expect(edge).toContain('fallback: true');
    expect(edge).toContain('interface mode summary');
    expect(edge).toContain("Respect the user's interface mode");
    expect(edge).toContain('"/settings/appearance"');
    expect(edge).toContain('Allowed navigation targets');
    expect(edge).toContain('Output JSON only');
    expect(store).toContain("what would you like to do first?");
    expect(store).toContain('GUIDE_RESPONSE_TIMEOUT_MS');
    expect(store).toContain('localGuideFallback');
  });

  it('guards the client against accidental Luca self-identification from the guide model', () => {
    expect(sanitizeGuideReply("Hey there! I'm Luca, your guide inside Polyphonic. Right now you're on Chat.")).toBe(
      "Hey there! I'm the Polyphonic Guide. Right now you're on Chat.",
    );
    expect(sanitizeGuideReply('Welcome to Polyphonic. You’re currently in Chat.')).toBe('You’re currently in Chat.');
  });

  it('keeps app actions constrained to navigation, drawers, and guide highlights', () => {
    const lib = readRepoFile('src/lib/lucaGuide.ts');
    const overlay = readRepoFile('src/components/guide/LucaGuideOverlay.tsx');
    const edge = readRepoFile('supabase/functions/luca-app-guide/index.ts');
    const rail = readRepoFile('src/components/Rail.tsx');
    const section = readRepoFile('src/components/settings/Section.tsx');
    const guide = readRepoFile('src/pages/settings/HelpGuide.tsx');

    expect(lib).toContain("export type LucaGuideActionType = 'navigate' | 'highlight' | 'scroll_to' | 'open_drawer' | 'set_interface_mode'");
    expect(lib).toContain('sanitizeGuideAction');
    expect(lib).toContain("'/settings/models'");
    expect(lib).toContain("'/settings/appearance'");
    expect(lib).toContain("'rail-agents'");
    expect(lib).toContain("'rail-help'");
    expect(edge).toContain('Allowed interface-mode controls');
    expect(edge).toContain('set_interface_mode');
    expect(overlay).toContain('runAction');
    expect(overlay).toContain('openDrawer(action.target');
    expect(overlay).toContain('setInterfaceMode(mode)');
    expect(rail).toContain('data-guide-id={guideId}');
    expect(section).toContain('guideId?: string');
    expect(guide).toContain('guideId="help-profile-section"');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('global Luca guide overlay', () => {
  it('mounts globally from AppShell rather than a single page', () => {
    const app = readRepoFile('src/App.tsx');
    const overlay = readRepoFile('src/components/guide/LucaGuideOverlay.tsx');

    expect(app).toContain('import LucaGuideOverlay');
    expect(app).toContain('<LucaGuideOverlay />');
    expect(overlay).toContain('data-guide-id="luca-guide-launcher"');
    expect(overlay).toContain('luca-guide-mark');
    expect(overlay).toContain('luca-guide-shortcuts-trigger');
    expect(overlay).toContain('routeInfo(location.pathname)');
    expect(overlay).toContain('availableTargets: targetsForPath(location.pathname)');
  });

  it('passes current app context to a schema-free guide edge function', () => {
    const store = readRepoFile('src/stores/lucaGuideStore.ts');
    const edge = readRepoFile('supabase/functions/luca-app-guide/index.ts');
    const config = readRepoFile('supabase/config.toml');

    expect(store).toContain("supabase.functions.invoke('luca-app-guide'");
    expect(store).toContain('context');
    expect(config).toContain('[functions.luca-app-guide]\nverify_jwt = false');
    expect(edge).toContain("You are Luca, acting inside Polyphonic's global app guide overlay");
    expect(edge).toContain('Allowed navigation targets');
    expect(edge).toContain('Output JSON only');
  });

  it('keeps app actions constrained to navigation, drawers, and guide highlights', () => {
    const lib = readRepoFile('src/lib/lucaGuide.ts');
    const overlay = readRepoFile('src/components/guide/LucaGuideOverlay.tsx');
    const rail = readRepoFile('src/components/Rail.tsx');
    const section = readRepoFile('src/components/settings/Section.tsx');
    const guide = readRepoFile('src/pages/settings/HelpGuide.tsx');

    expect(lib).toContain("export type LucaGuideActionType = 'navigate' | 'highlight' | 'scroll_to' | 'open_drawer'");
    expect(lib).toContain('sanitizeGuideAction');
    expect(lib).toContain("'/settings/models'");
    expect(lib).toContain("'rail-help'");
    expect(overlay).toContain('runAction');
    expect(overlay).toContain('openDrawer(action.target');
    expect(rail).toContain('data-guide-id={guideId}');
    expect(section).toContain('guideId?: string');
    expect(guide).toContain('guideId="help-profile-section"');
  });
});

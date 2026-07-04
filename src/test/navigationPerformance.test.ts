import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { navigationAuditRoutes } from '@/lib/routePrefetch';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('navigation performance wiring', () => {
  it('keeps lazy route fallback inside the app shell for authenticated routes', () => {
    const app = readRepoFile('src/App.tsx');

    expect(app).toContain('function PanelRouteFallback()');
    expect(app).toContain('<Suspense fallback={<PanelRouteFallback />}>');
    expect(app).toContain('className="route-panel-fallback');
    expect(app).toContain('prefetchCoreSettingsRoutes()');
  });

  it('keeps left rail navigation semantic and prefetchable', () => {
    const rail = readRepoFile('src/components/Rail.tsx');

    expect(rail).toContain('aria-label={label}');
    expect(rail).toContain('onPointerEnter={prime}');
    expect(rail).toContain('onPointerDown={prime}');
    expect(rail).toContain('onFocus={prime}');
    expect(rail).not.toContain("transition: 'all var(--dur-fast) var(--ease-out)'");
  });

  it('prefetches high-frequency rail and settings route chunks', () => {
    expect(navigationAuditRoutes.rail).toEqual([
      '/chat',
      '/groups',
      '/memory',
      '/research',
      '/mind',
      '/journal',
      '/import',
      '/projects',
      '/profile',
      '/settings/help',
      '/settings/agents',
    ]);
    expect(navigationAuditRoutes.settings).toEqual([
      '/settings/agents',
      '/settings/general',
      '/settings/models',
      '/settings/appearance',
      '/settings/skills',
      '/settings/routines',
      '/settings/local-runtime',
      '/settings/portability',
      '/settings/account',
      '/settings/help',
    ]);
  });

  it('keeps settings sidebar links warmable before click navigation', () => {
    const settings = readRepoFile('src/components/sidebar/SidebarSettings.tsx');
    const row = readRepoFile('src/components/sidebar/SidebarRow.tsx');

    expect(settings).toContain('prefetchCoreSettingsRoutes()');
    expect(settings).toContain('onPointerEnter={prime(e.path)}');
    expect(settings).toContain('onPointerDown={prime(e.path)}');
    expect(settings).toContain('onFocus={prime(e.path)}');
    expect(row).toContain('onPointerEnter?: React.PointerEventHandler<HTMLButtonElement>');
    expect(row).toContain('onPointerDown?: React.PointerEventHandler<HTMLButtonElement>');
  });
});

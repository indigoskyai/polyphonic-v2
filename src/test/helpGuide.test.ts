import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('help guide surface', () => {
  it('wires the guide into settings navigation and routing', () => {
    const app = readRepoFile('src/App.tsx');
    const sidebar = readRepoFile('src/components/sidebar/SidebarSettings.tsx');
    const routes = readRepoFile('src/lib/routePrefetch.ts');
    const palette = readRepoFile('src/lib/paletteSearch.ts');

    expect(app).toContain('const HelpGuide = lazy');
    expect(app).toContain('path="/settings/help"');
    expect(sidebar).toContain("Guide & help");
    expect(routes).toContain("'/settings/help': () => import('@/pages/settings/HelpGuide')");
    expect(palette).toContain('How Polyphonic works');
  });

  it('documents setup, agents, memory, observer boundaries, and troubleshooting', () => {
    const guide = readRepoFile('src/pages/settings/HelpGuide.tsx');

    expect(guide).toContain('Set up OpenRouter');
    expect(guide).toContain('How the psychological profile works');
    expect(guide).toContain('user-model document');
    expect(guide).toContain('Luca, custom agents, and Observer');
    expect(guide).toContain('Journal, Memory, and Mind');
    expect(guide).toContain('Observer watches and answers from the alcove');
    expect(guide).toContain('Custom-agent chat will fail clearly instead of silently becoming');
    expect(guide).toContain('Troubleshooting');
  });
});

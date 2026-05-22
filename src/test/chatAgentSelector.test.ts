import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('chat agent selector placement', () => {
  it('keeps agent switching in the chat header instead of the composer footer', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');
    const picker = readRepoFile('src/components/composer/AgentPicker.tsx');
    const styles = readRepoFile('src/index.css');

    expect(chatView).toContain('chat-agent-selector-corner');
    expect(chatView).toContain('chat-agent-selector-mobile');
    expect(chatView).toContain('variant="header"');
    expect(styles).toContain('.chat-agent-selector-corner');
    expect(styles).toContain('.agent-picker-trigger--header');
    expect(picker).toContain('const menuWidth = 264');
    expect(picker).toContain("maxHeight: 'min(320px, calc(100vh - 72px))'");

    const footerSegments = [...chatView.matchAll(/<div className="agent-pills">([\s\S]*?)<div className="composer-actions">/g)]
      .map((match) => match[1]);
    expect(footerSegments.length).toBeGreaterThanOrEqual(2);
    for (const segment of footerSegments) {
      expect(segment).not.toContain('<AgentPicker');
      expect(segment).not.toContain('<LucaOnlyPill');
    }
  });
});

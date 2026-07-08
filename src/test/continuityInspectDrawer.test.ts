import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Continuity inspection drawer', () => {
  it('keeps continuity inspection in the thread drawer, not the main chat surface', () => {
    const drawer = readRepoFile('src/components/drawers/ThreadDetailDrawer.tsx');
    const chatView = readRepoFile('src/pages/ChatView.tsx');

    expect(drawer).toContain("supabase.functions.invoke('continuity-inspect'");
    expect(drawer).toContain('<DrawerSectionLabel>CONTINUITY</DrawerSectionLabel>');
    expect(drawer).toContain('Layer health');
    expect(drawer).toContain('Refresh continuity');
    expect(chatView).not.toContain("continuity-inspect");
    expect(chatView).not.toContain('<DrawerSectionLabel>CONTINUITY</DrawerSectionLabel>');
  });

  it('scopes the continuity-inspect edge function to the authenticated thread owner', () => {
    const source = readRepoFile('supabase/functions/continuity-inspect/index.ts');

    expect(source).toContain('authClient.auth.getUser()');
    expect(source).toContain('.eq("id", threadId)');
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('loadContinuityPacket');
    expect(source).toContain('summarizeContinuityPacket');
    expect(source).toContain('continuityBridgeMode: classicRuntime ? "classic" : "agent"');
  });

  it('keeps functional memory recall wired to pg_trgm after extension hardening', () => {
    const migration = readRepoFile('supabase/migrations/20260615070000_fix_match_memories_pg_trgm.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.match_memories');
    expect(migration).toContain('SET search_path = public, extensions');
    expect(migration).toContain('extensions.similarity(m.content, query_text)');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.match_memories(text, integer, uuid, text) TO authenticated, service_role');
    expect(migration).not.toMatch(/[^.]similarity\(m\.content,\s*query_text\)/);
  });
});

describe('continuityItemToText', () => {
  it('renders content from hypomnema object items without throwing', async () => {
    const mod = await import('@/components/drawers/ThreadDetailDrawer');
    const objectItem = {
      id: 'h1',
      content: 'still sitting with the harbor question',
      score: 0.8,
      confidence: 0.7,
      source: 'hypomnema_entry',
      thread_id: 't1',
      source_message_id: 'm1',
      tags: ['reflection'],
    };
    expect(mod.continuityItemToText(objectItem)).toBe('still sitting with the harbor question');
    expect(mod.continuityItemToText('legacy string')).toBe('legacy string');
    expect(mod.continuityItemToText(null)).toBe('');
    expect(mod.continuityItemToText(undefined)).toBe('');
    expect(mod.continuityItemToText({ excerpt: 'from excerpt' } as any)).toBe('from excerpt');
    expect(mod.continuityItemToText({ id: 'x' } as any)).toBe('');
  });
});

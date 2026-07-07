import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContinuityTraceContext } from '../../supabase/functions/_shared/continuity/trace';
import type { ContinuityPacket } from '../../supabase/functions/_shared/continuity/kernel';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function packetFixture(): ContinuityPacket {
  return {
    userId: 'user-1',
    agentId: 'luca',
    threadId: 'thread-1',
    query: 'What was the codename?',
    generatedAt: '2026-07-06T23:31:54.000Z',
    continuityBridge: 'hidden bridge text',
    history: [{
      id: 'msg-old',
      role: 'user',
      content: 'Earlier public thread text with sk-or-v1-super-secret-key and riley@example.com.',
      agent: null,
      created_at: '2026-07-06T23:20:00.000Z',
    }],
    identityDocs: null as never,
    pendingRevisions: [],
    pendingRevisionsBlock: '',
    hypomnema: {
      block: '## what i am sitting with',
      count: 1,
      rendered: 1,
      items: [{
        id: 'hyp-1',
        excerpt: 'blue lantern 47, held as continuity; api_key: sk-test-hidden',
        score: 0.87,
        confidence: 0.74,
        timestamp: '2026-07-06T23:22:00.000Z',
        agent_id: 'luca',
        thread_id: 'thread-origin',
        source_message_id: 'msg-origin',
        tags: ['verification'],
      }],
    },
    functionalMemories: [{
      id: 'mem-1',
      content: 'Riley likes compact observability.',
      memory_type: 'preference',
      confidence: 0.8,
      tags: ['product'],
      provenance: { thread_id: 'thread-2', source_message_id: 'msg-2' },
      source: 'durable',
    }],
    functionalMemoryBlock: '',
    mnemosResults: [{
      activation: 0.91,
      path: 'direct',
      engram: {
        id: 'engram-1',
        user_id: 'user-1',
        agent_id: 'luca',
        content: 'The disposable Mnemos verification codename is blue lantern 47.',
        engram_type: 'episodic',
        strength: 0.8,
        stability: 0.6,
        accessibility: 0.9,
        emotional_valence: 0,
        emotional_arousal: 0,
        surprise_score: 0.3,
        source_context: { thread_id: 'thread-origin', source_message_id: 'msg-origin' },
        tags: ['verification'],
        state: 'active',
        last_accessed_at: '2026-07-06T23:31:00.000Z',
        access_count: 1,
        created_at: '2026-07-06T23:29:00.000Z',
        updated_at: '2026-07-06T23:29:00.000Z',
      },
    }],
    mnemosBlock: '',
    skills: [],
    skillsBlock: '',
    emotionalState: null,
    emotionalBlock: '',
    beliefs: [{
      content: 'Riley values observable continuity.',
      confidence: 0.62,
      confidence_tier: 'moderate',
      domain: 'product',
    }],
    beliefsBlock: '',
    continuityNote: '',
    diagnostics: [
      { layer: 'history', status: 'ok', count: 1, rendered: 1, durationMs: 4 },
      { layer: 'mnemos', status: 'ok', count: 1, rendered: 1, durationMs: 12 },
    ],
  };
}

describe('Continuity Trace', () => {
  it('builds sanitized layer summaries without raw prompts, API keys, or emails', () => {
    const summary = buildContinuityTraceContext(packetFixture(), {
      ok: true,
      focus: 'codename',
      agent_id: 'luca',
      generated_at: '2026-07-06T23:31:55.000Z',
      diagnostics: [],
      block: 'raw autonomous block should not be copied',
      items: [{
        id: 'auto-1',
        kind: 'engram',
        source: 'engrams',
        agent_id: 'luca',
        content: 'Autonomous sample with token=should-not-survive',
        created_at: '2026-07-06T23:30:00.000Z',
        labels: ['verification'],
        score: 0.77,
      }],
    });

    expect(summary.layers.map((layer) => layer.label)).toEqual([
      'Thread History',
      'Hypomnema',
      'Mnemos Recall',
      'Functional Memory',
      'Autonomous Context',
      'Beliefs',
    ]);
    expect(JSON.stringify(summary)).not.toContain('sk-or-v1-super-secret-key');
    expect(JSON.stringify(summary)).not.toContain('sk-test-hidden');
    expect(JSON.stringify(summary)).not.toContain('riley@example.com');
    expect(JSON.stringify(summary)).not.toContain('raw autonomous block should not be copied');
    expect(summary.layers.find((layer) => layer.key === 'mnemos_recall')?.items[0]).toMatchObject({
      id: 'engram-1',
      status: 'retrieved',
      activation: 0.91,
      thread_id: 'thread-origin',
      source_message_id: 'msg-origin',
    });
    expect(summary.layers.find((layer) => layer.key === 'hypomnema')?.items[0]).toMatchObject({
      id: 'hyp-1',
      status: 'available',
      confidence: 0.74,
    });
  });

  it('adds a protected continuity_turn_traces contract and clean drawer wiring', () => {
    const migration = readRepoFile('supabase/migrations/20260706234500_continuity_turn_traces.sql');
    const drawerStore = readRepoFile('src/stores/drawerStore.ts');
    const app = readRepoFile('src/App.tsx');
    const messageItem = readRepoFile('src/components/messages/MessageItem.tsx');
    const drawer = readRepoFile('src/components/drawers/ContinuityTraceDrawer.tsx');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.continuity_turn_traces');
    expect(migration).toContain('ALTER TABLE public.continuity_turn_traces ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('append_continuity_trace_write');
    expect(drawerStore).toContain("'continuity-trace'");
    expect(app).toContain('ContinuityTraceDrawer');
    expect(messageItem).toContain("openDrawer('continuity-trace'");
    expect(messageItem).toContain('Trace');
    expect(drawer).toContain('Continuity Trace');
    expect(drawer).toContain('It does not show private reasoning');
    expect(drawer).not.toContain('JSON.stringify');
  });
});

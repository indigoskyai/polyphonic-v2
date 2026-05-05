import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeHypomnemaEntry } from '../../supabase/functions/_shared/hypomnema/write';

function createSupabaseStub(existingHypomnema?: Record<string, unknown>) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; row: Record<string, unknown> }> = [];

  class Query {
    private insertRow: Record<string, unknown> | null = null;
    private updateRow: Record<string, unknown> | null = null;

    constructor(private table: string) {}

    select() { return this; }
    eq() { return this; }
    in() { return this; }
    order() { return this; }
    limit() { return this; }

    insert(row: Record<string, unknown>) {
      this.insertRow = row;
      inserts.push({ table: this.table, row });
      return this;
    }

    update(row: Record<string, unknown>) {
      this.updateRow = row;
      updates.push({ table: this.table, row });
      return this;
    }

    single() {
      if (this.insertRow) return Promise.resolve({ data: { id: `insert-${inserts.length}` }, error: null });
      return Promise.resolve({ data: null, error: null });
    }

    maybeSingle() {
      if (this.table === 'profiles') return Promise.resolve({ data: { display_name: 'Riley' }, error: null });
      if (this.table === 'hypomnema_entry' && existingHypomnema) return Promise.resolve({ data: existingHypomnema, error: null });
      return Promise.resolve({ data: null, error: null });
    }

    then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(this.resolve()).then(resolve, reject);
    }

    private resolve() {
      if (this.updateRow) return { data: null, error: null };
      return { data: [], error: null };
    }
  }

  return {
    supabase: {
      from: (table: string) => new Query(table),
    } as any,
    inserts,
    updates,
  };
}

function baseInput() {
  return {
    agentId: 'luca',
    userId: 'user-1',
    threadId: 'thread-1',
    sourceMessageId: 'message-1',
    density: 'primary' as const,
    primaryInThread: true,
    userMessage: 'the phrase is ember bridge; carry it into the next thread.',
    agentResponse: 'i have ember bridge and what it means.',
    recentTurns: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hypomnema write resilience', () => {
  it('retries transient OpenRouter body-read failures before writing the reflection', async () => {
    const { supabase, inserts } = createSupabaseStub();
    let chatCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/chat/completions')) {
        chatCalls += 1;
        if (chatCalls === 1) throw new Error('error reading a body from connection');
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            content: 'i am carrying ember bridge as the exact continuity marker riley asked me to hold.',
            domain: 'meta',
            tags: ['ember-bridge', 'continuity'],
            confidence: 0.82,
            revises_existing_id: null,
            revision_reason: null,
          }) } }],
          usage: { total_tokens: 42 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 });
    }));

    const result = await writeHypomnemaEntry(supabase, 'openrouter-key', baseInput());

    expect(result.status).toBe('wrote');
    expect(chatCalls).toBe(2);
    expect(inserts[0].row.content).toContain('ember bridge');
    expect(inserts[0].row.meta).toBeUndefined();
  });

  it('writes a low-confidence recovery entry when reflection fails after retries', async () => {
    const { supabase, inserts } = createSupabaseStub();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/chat/completions')) {
        throw new Error('error reading a body from connection');
      }
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 });
    }));

    const result = await writeHypomnemaEntry(supabase, 'openrouter-key', baseInput());

    expect(result.status).toBe('wrote');
    expect(result.reason).toContain('low-confidence recovery entry');
    expect(inserts[0].row.content).toContain('ember bridge');
    expect(inserts[0].row.confidence).toBe(0.45);
    expect(inserts[0].row.tags).toContain('ember-bridge');
    expect(inserts[0].row.meta).toMatchObject({ recovery: true });
  });

  it('moves revision provenance to the latest source turn while preserving the prior source in revisions', async () => {
    const { supabase, updates } = createSupabaseStub({
      id: 'entry-1',
      content: 'older reflection',
      confidence: 0.6,
      revisions: [],
      revision_count: 0,
      thread_id: 'old-thread',
      source_message_id: 'old-message',
      meta: { existing: true },
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            content: 'ember bridge recovery now feels carried rather than briefed.',
            domain: 'identity',
            tags: ['ember-bridge', 'continuity'],
            confidence: 0.84,
            revises_existing_id: 'entry-1',
            revision_reason: 'new turn clarified the continuity marker',
          }) } }],
          usage: { total_tokens: 42 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 });
    }));

    const result = await writeHypomnemaEntry(supabase, 'openrouter-key', baseInput());

    expect(result.status).toBe('revised');
    const update = updates.find((u) => u.table === 'hypomnema_entry' && u.row.content);
    expect(update?.row.thread_id).toBe('thread-1');
    expect(update?.row.source_message_id).toBe('message-1');
    expect(update?.row.meta).toMatchObject({
      existing: true,
      last_revision_source: { thread_id: 'thread-1', source_message_id: 'message-1' },
    });
    expect(update?.row.revisions).toEqual([
      expect.objectContaining({
        previous_thread_id: 'old-thread',
        previous_source_message_id: 'old-message',
        source_thread_id: 'thread-1',
        source_message_id: 'message-1',
      }),
    ]);
  });
});

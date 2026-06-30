import { describe, it, expect, beforeEach, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  nextInsertedThread: null as any,
  nextInsertError: null as { message?: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ or: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
        order: () => Promise.resolve({ data: [] }),
      }),
      insert: (payload: unknown) => {
        supabaseMock.insert(payload);
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: supabaseMock.nextInsertError ? null : supabaseMock.nextInsertedThread,
              error: supabaseMock.nextInsertError,
            }),
          }),
        };
      },
      update: (payload: unknown) => {
        supabaseMock.update(payload);
        return { eq: () => Promise.resolve({}) };
      },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import {
  dedupeMessagesForDisplay,
  dedupeThreadsById,
  mergeRealtimeMessage,
  type Message,
  useThreadStore,
} from '@/stores/threadStore';

const makeThread = (overrides: Partial<ReturnType<typeof useThreadStore.getState>['threads'][number]> = {}) => ({
  id: 'thread-1',
  user_id: 'u1',
  title: null,
  pinned: false, starred: false, archived: false,
  heat: 'warm',
	  agent_id: 'luca',
	  primary_agent_id: 'luca',
	  participating_agent_ids: ['luca'],
	  runtime_mode: 'agent' as const,
	  selected_model: null,
	  memory_enabled: true,
	  continuity_summary: null,
	  project_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('threadStore thread list helpers', () => {
  it('dedupes repeated thread rows before sidebar rendering', () => {
    const base = {
      user_id: 'u1',
      title: 'Thread',
      pinned: false, starred: false, archived: false,
      heat: 'warm',
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      runtime_mode: 'agent' as const,
	      selected_model: null,
	      memory_enabled: true,
	      continuity_summary: null,
	      project_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(dedupeThreadsById([
      { ...base, id: 't1' },
      { ...base, id: 't1', title: 'Duplicate' },
      { ...base, id: 't2' },
    ])).toEqual([
      { ...base, id: 't1' },
      { ...base, id: 't2' },
    ]);
  });
});

describe('threadStore.createThread project scoping', () => {
  beforeEach(() => {
    supabaseMock.insert.mockClear();
    supabaseMock.nextInsertedThread = makeThread();
    supabaseMock.nextInsertError = null;
    useThreadStore.setState({ threads: [], currentThreadId: null, messages: [] });
  });

  it('omits project_id for ordinary new chats', async () => {
    await useThreadStore.getState().createThread('u1', 'luca');

	    expect(supabaseMock.insert).toHaveBeenCalledWith({
	      user_id: 'u1',
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      runtime_mode: 'agent',
	      memory_enabled: true,
	    });
	  });

	  it('stores a selected model for ordinary classic chats when provided', async () => {
	    await useThreadStore.getState().createThread('u1', 'luca', null, {
	      selectedModel: 'openai/gpt-5.1',
	    });

	    expect(supabaseMock.insert).toHaveBeenCalledWith({
	      user_id: 'u1',
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      runtime_mode: 'classic',
	      selected_model: 'openai/gpt-5.1',
	      memory_enabled: true,
	    });
	  });

  it('includes project_id only for project-scoped chats', async () => {
    supabaseMock.nextInsertedThread = makeThread({ id: 'thread-2', project_id: 'project-1' });

    await useThreadStore.getState().createThread('u1', 'luca', 'project-1');

	    expect(supabaseMock.insert).toHaveBeenCalledWith({
	      user_id: 'u1',
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      runtime_mode: 'agent',
	      memory_enabled: true,
	      project_id: 'project-1',
	    });
	  });

  it('creates custom-agent threads with primary and participant scope immediately', async () => {
    supabaseMock.nextInsertedThread = makeThread({
      id: 'thread-custom',
      agent_id: 'glyph-weaver',
      primary_agent_id: 'glyph-weaver',
      participating_agent_ids: ['glyph-weaver'],
    });

    await useThreadStore.getState().createThread('u1', 'glyph-weaver');

	    expect(supabaseMock.insert).toHaveBeenCalledWith({
	      user_id: 'u1',
	      agent_id: 'glyph-weaver',
	      primary_agent_id: 'glyph-weaver',
	      participating_agent_ids: ['glyph-weaver'],
	      runtime_mode: 'agent',
	      memory_enabled: true,
	    });
	  });

	  it('lets agentic Luca handoffs request agent runtime explicitly', async () => {
	    await useThreadStore.getState().createThread('u1', 'luca', null, { runtimeMode: 'agent' });

	    expect(supabaseMock.insert).toHaveBeenCalledWith({
	      user_id: 'u1',
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      runtime_mode: 'agent',
	      memory_enabled: true,
	    });
	  });

  it('surfaces Supabase insert errors for preview migration diagnostics', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.nextInsertError = {
      message: 'column "runtime_mode" of relation "threads" does not exist',
    };

    await expect(useThreadStore.getState().createThread('u1', 'luca')).rejects.toThrow(
      'Failed to create thread: column "runtime_mode" of relation "threads" does not exist',
    );
    consoleSpy.mockRestore();
  });

	  it('keeps empty-thread agent switches scoped across all thread identity fields', async () => {
	    supabaseMock.update.mockClear();
	    useThreadStore.setState({ threads: [makeThread({ id: 'thread-1' })], currentThreadId: 'thread-1', messages: [] });

    await useThreadStore.getState().updateThreadAgent('thread-1', 'glyph-weaver');

	    expect(supabaseMock.update).toHaveBeenCalledWith({
	      agent_id: 'glyph-weaver',
	      primary_agent_id: 'glyph-weaver',
	      participating_agent_ids: ['glyph-weaver'],
	      runtime_mode: 'agent',
	      selected_model: null,
	    });
	    expect(useThreadStore.getState().threads[0]).toMatchObject({
	      agent_id: 'glyph-weaver',
	      primary_agent_id: 'glyph-weaver',
	      participating_agent_ids: ['glyph-weaver'],
	      runtime_mode: 'agent',
	      selected_model: null,
	    });
	  });

	  it('stores per-thread classic model selection', async () => {
	    supabaseMock.update.mockClear();
	    useThreadStore.setState({ threads: [makeThread({ id: 'thread-1', runtime_mode: 'agent' })], currentThreadId: 'thread-1', messages: [] });

	    await useThreadStore.getState().updateThreadSelectedModel('thread-1', 'openai/gpt-5.1');

	    expect(supabaseMock.update).toHaveBeenCalledWith({
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      selected_model: 'openai/gpt-5.1',
	      runtime_mode: 'classic',
	    });
	    expect(useThreadStore.getState().threads[0]).toMatchObject({
	      agent_id: 'luca',
	      primary_agent_id: 'luca',
	      participating_agent_ids: ['luca'],
	      selected_model: 'openai/gpt-5.1',
	      runtime_mode: 'classic',
	    });
	  });
	});

describe('threadStore message display helpers', () => {
  it('collapses persisted duplicate assistant rows from delayed replay paths', () => {
    const first: Message = {
      id: 'assistant-1',
      thread_id: 't1',
      user_id: 'u1',
      role: 'assistant',
      content: 'Hello. The records are open.',
      model: null,
      agent: 'lyra',
      thinking_content: null,
      tokens_used: null,
      bookmarked: false,
      created_at: '2026-05-22T20:56:00.000Z',
      kind: 'text',
    };
    const duplicate: Message = {
      ...first,
      id: 'assistant-2',
      created_at: '2026-05-22T20:58:00.000Z',
    };
    const userRepeat: Message = {
      ...first,
      id: 'user-1',
      role: 'user',
      agent: null,
      content: 'hello again',
      created_at: '2026-05-22T20:59:00.000Z',
    };
    const intentionalUserRepeat: Message = {
      ...userRepeat,
      id: 'user-2',
      created_at: '2026-05-22T20:59:05.000Z',
    };

    const deduped = dedupeMessagesForDisplay([first, duplicate, userRepeat, intentionalUserRepeat]);

    expect(deduped.map((m) => m.id)).toEqual(['assistant-1', 'user-1', 'user-2']);
  });
});

describe('threadStore.addMessage de-dupe', () => {
  beforeEach(() => {
    useThreadStore.setState({ messages: [] });
  });

  it('adds a new optimistic message', () => {
    useThreadStore.getState().addMessage({
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'hi',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });
    expect(useThreadStore.getState().messages).toHaveLength(1);
  });

  it('keeps a supplied persisted id so realtime can de-dupe by canonical row', () => {
    useThreadStore.getState().addMessage({
      id: 'db-message-1',
      created_at: '2026-05-13T21:11:00.000Z',
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'persisted',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });

    const message = useThreadStore.getState().messages[0];
    expect(message.id).toBe('db-message-1');
    expect(message.created_at).toBe('2026-05-13T21:11:00.000Z');
  });

  it('skips a local add when the persisted id is already present', () => {
    useThreadStore.setState({
      messages: [{
        id: 'db-message-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'already here', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        created_at: new Date().toISOString(),
      }],
    });

    useThreadStore.getState().addMessage({
      id: 'db-message-1',
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'already here',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });

    expect(useThreadStore.getState().messages).toHaveLength(1);
  });

  it('skips optimistic add when realtime row with same role/agent/content exists within 30s', () => {
    useThreadStore.setState({
      messages: [{
        id: 'real-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'hello world', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        created_at: new Date().toISOString(),
      }],
    });
    useThreadStore.getState().addMessage({
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'hello world',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });
    expect(useThreadStore.getState().messages).toHaveLength(1);
    expect(useThreadStore.getState().messages[0].id).toBe('real-1');
  });

  it('does add when content differs', () => {
    useThreadStore.setState({
      messages: [{
        id: 'real-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'foo', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        created_at: new Date().toISOString(),
      }],
    });
    useThreadStore.getState().addMessage({
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'bar',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });
    expect(useThreadStore.getState().messages).toHaveLength(2);
  });

  it('skips a local stream stub when a recent canonical assistant row already exists', () => {
    useThreadStore.setState({
      messages: [{
        id: 'real-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'revised final answer', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        created_at: new Date().toISOString(),
      }],
    });
    useThreadStore.getState().addMessage({
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'draft final answer',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
      metadata: { local_stream_stub: true },
    });
    expect(useThreadStore.getState().messages).toHaveLength(1);
    expect(useThreadStore.getState().messages[0].id).toBe('real-1');
  });

  it('dedupes same content within the (widened) content window — covers Tara 2-min duplicate', () => {
    // 2026-05-13: Tara reported a duplicate assistant message arriving 2 min
    // after the original, under a different uuid. The content window was
    // widened from 30s to 240s; identical content within that window now
    // replaces the older row instead of appending a second.
    const recent = new Date(Date.now() - 120_000).toISOString();
    useThreadStore.setState({
      messages: [{
        id: 'real-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'same', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        created_at: recent,
      }],
    });
    useThreadStore.getState().addMessage({
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'same',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });
    expect(useThreadStore.getState().messages).toHaveLength(1);
  });

  it('replaces a same-id local stream stub with the canonical realtime row', () => {
    const stubTime = new Date().toISOString();
    const existing = [{
      id: 'db-message-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
      content: 'streamed draft', model: null, agent: 'luca',
      thinking_content: 'local thinking', tokens_used: null, bookmarked: false,
      created_at: stubTime,
      metadata: { local_stream_stub: true },
    }];
    const canonical = {
      id: 'db-message-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
      content: 'canonical saved answer', model: 'moonshotai/kimi-k2.6', agent: 'luca',
      thinking_content: null, tokens_used: 12, bookmarked: false,
      created_at: stubTime,
      metadata: { source: 'database' },
    };

    const next = mergeRealtimeMessage(existing as any, canonical as any);

    expect(next).toHaveLength(1);
    expect(next[0].content).toBe('canonical saved answer');
    expect(next[0].metadata).toEqual({ source: 'database' });
  });

  it('does add when same content but beyond the content window', () => {
    // Past the 240s window — legitimately a separate utterance, not a dup.
    const old = new Date(Date.now() - 300_000).toISOString();
    useThreadStore.setState({
      messages: [{
        id: 'real-1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'same', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        created_at: old,
      }],
    });
    useThreadStore.getState().addMessage({
      thread_id: 't1', user_id: 'u1', role: 'assistant', content: 'same',
      model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
    });
    expect(useThreadStore.getState().messages).toHaveLength(2);
  });

  it('patches an existing message locally', () => {
    useThreadStore.setState({
      messages: [{
        id: 'm1', thread_id: 't1', user_id: 'u1', role: 'assistant',
        content: 'permission needed', model: null, agent: 'luca',
        thinking_content: null, tokens_used: null, bookmarked: false,
        kind: 'permission_request',
        metadata: { permission_status: 'pending' },
        created_at: new Date().toISOString(),
      }],
    });

    useThreadStore.getState().patchMessage('m1', {
      metadata: { permission_status: 'approved' },
    });

    expect(useThreadStore.getState().messages[0].metadata).toEqual({ permission_status: 'approved' });
  });
});

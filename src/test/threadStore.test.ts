import { describe, it, expect, beforeEach, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  insert: vi.fn(),
  nextInsertedThread: null as any,
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
            single: () => Promise.resolve({ data: supabaseMock.nextInsertedThread }),
          }),
        };
      },
      update: () => ({ eq: () => Promise.resolve({}) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import { dedupeThreadsById, useThreadStore } from '@/stores/threadStore';

const makeThread = (overrides: Partial<ReturnType<typeof useThreadStore.getState>['threads'][number]> = {}) => ({
  id: 'thread-1',
  user_id: 'u1',
  title: null,
  pinned: false, starred: false, archived: false,
  heat: 'warm',
  agent_id: 'luca',
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
    useThreadStore.setState({ threads: [], currentThreadId: null, messages: [] });
  });

  it('omits project_id for ordinary new chats', async () => {
    await useThreadStore.getState().createThread('u1', 'luca');

    expect(supabaseMock.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      agent_id: 'luca',
    });
  });

  it('includes project_id only for project-scoped chats', async () => {
    supabaseMock.nextInsertedThread = makeThread({ id: 'thread-2', project_id: 'project-1' });

    await useThreadStore.getState().createThread('u1', 'luca', 'project-1');

    expect(supabaseMock.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      agent_id: 'luca',
      project_id: 'project-1',
    });
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

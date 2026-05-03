import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ or: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
        order: () => Promise.resolve({ data: [] }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({}) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import { useThreadStore } from '@/stores/threadStore';

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

  it('does add when same content but >30s apart', () => {
    const old = new Date(Date.now() - 60_000).toISOString();
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
});

import { describe, beforeEach, expect, it } from 'vitest';
import {
  selectByThread,
  useAgentConsultStore,
  type AgentConsultation,
} from '@/stores/agentConsultStore';

function consult(overrides: Partial<AgentConsultation> = {}): AgentConsultation {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    parent_thread_id: 'thread-1',
    parent_message_id: null,
    from_agent: 'luca',
    to_agent: 'anima',
    question: 'whats your read on this?',
    response: null,
    status: 'pending',
    model_used: null,
    tokens_used: null,
    error: null,
    created_at: '2026-05-03T05:20:00Z',
    completed_at: null,
    ...overrides,
  };
}

describe('agentConsultStore', () => {
  beforeEach(() => {
    useAgentConsultStore.setState({ byThread: {} });
  });

  it('hydrates consultations into a thread bucket', () => {
    useAgentConsultStore.getState().hydrate('thread-1', [consult()]);
    const stored = useAgentConsultStore.getState().byThread['thread-1'];
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('pending');
  });

  it('upserts a status transition without duplicating', () => {
    const c = consult({ id: 'c-1', status: 'pending' });
    useAgentConsultStore.getState().upsert(c);
    useAgentConsultStore.getState().upsert({
      ...c,
      status: 'completed',
      response: 'mesh take here.',
      completed_at: '2026-05-03T05:21:00Z',
    });
    const stored = useAgentConsultStore.getState().byThread['thread-1'];
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('completed');
    expect(stored[0].response).toBe('mesh take here.');
  });

  it('prepends new consultations and respects MAX_PER_THREAD cap', () => {
    const upsert = useAgentConsultStore.getState().upsert;
    for (let i = 0; i < 35; i++) {
      upsert(consult({ id: `c-${i}`, created_at: `2026-05-03T05:${String(i).padStart(2, '0')}:00Z` }));
    }
    const stored = useAgentConsultStore.getState().byThread['thread-1'];
    expect(stored.length).toBeLessThanOrEqual(30);
    // Most recent on top — the latest upsert was c-34.
    expect(stored[0].id).toBe('c-34');
  });

  it('selectByThread returns the empty list for unknown / null thread', () => {
    const state = useAgentConsultStore.getState();
    expect(selectByThread('missing')(state)).toEqual([]);
    expect(selectByThread(null)(state)).toEqual([]);
    expect(selectByThread(undefined)(state)).toEqual([]);
  });

  it('selectByThread returns the same reference across calls when nothing changed (no-realloc)', () => {
    // The frozen empty array must be reused or React's useSyncExternalStore
    // detects a "new" snapshot every render and infinite-loops the consumer.
    const state = useAgentConsultStore.getState();
    const a = selectByThread('missing')(state);
    const b = selectByThread('missing')(state);
    expect(a).toBe(b);
  });

  it('skips upsert when parent_thread_id is null', () => {
    useAgentConsultStore.getState().upsert(consult({ parent_thread_id: null }));
    expect(useAgentConsultStore.getState().byThread).toEqual({});
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  allowsInnerLifeAutonomy,
  allowsProactiveAutonomy,
  filterValidAgentScopes,
  isValidAgentScope,
  loadActiveAgentScopes,
} from '../../supabase/functions/_shared/agent-scope';

function queryResult(data: unknown[] | null, error: unknown = null) {
  const calls: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {
    data,
    error,
    select: vi.fn(() => query),
    in: vi.fn((column: string, values: unknown[]) => {
      calls.push([column, values]);
      return query;
    }),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
  };
  return { query, calls };
}

describe('agent scope validation', () => {
  it('keeps Luca but drops custom scopes that do not belong to the same user', async () => {
    const { query } = queryResult([{ user_id: 'user-a', id: 'sophia' }]);
    const supabase = { from: vi.fn(() => query) };

    await expect(filterValidAgentScopes(supabase, [
      { userId: 'user-a', agentId: 'luca' },
      { userId: 'user-a', agentId: 'sophia' },
      { userId: 'user-b', agentId: 'sophia' },
      { userId: 'user-a', agentId: 'observer' },
    ])).resolves.toEqual([
      { userId: 'user-a', agentId: 'luca' },
      { userId: 'user-a', agentId: 'sophia' },
    ]);

    expect(supabase.from).toHaveBeenCalledWith('agent_configs');
    expect(query.eq).toHaveBeenCalledWith('pending', false);
  });

  it('validates one custom scope through agent_configs', async () => {
    const { query } = queryResult([{ user_id: 'user-a', id: 'jerry' }]);
    const supabase = { from: vi.fn(() => query) };

    await expect(isValidAgentScope(supabase, 'user-a', 'jerry')).resolves.toBe(true);
    await expect(isValidAgentScope(supabase, 'user-a', 'observer')).resolves.toBe(false);
  });

  it('validates active thread-derived scopes before autonomy dispatch', async () => {
    const threadQuery = queryResult([
      { user_id: 'user-a', agent_id: 'luca', primary_agent_id: null },
      { user_id: 'user-a', agent_id: 'sophia', primary_agent_id: null },
      { user_id: 'user-b', agent_id: 'sophia', primary_agent_id: null },
      { user_id: 'user-a', agent_id: 'observer', primary_agent_id: null },
    ]).query;
    const configQuery = queryResult([{ user_id: 'user-a', id: 'sophia' }]).query;
    const supabase = {
      from: vi.fn((table: string) => table === 'threads' ? threadQuery : configQuery),
    };

    await expect(loadActiveAgentScopes(supabase, '2026-01-01T00:00:00Z')).resolves.toEqual([
      { userId: 'user-a', agentId: 'luca' },
      { userId: 'user-a', agentId: 'sophia' },
    ]);
  });

  it('separates custom-agent inner life from proactive outreach', async () => {
    const ownershipQuery = queryResult([{ user_id: 'user-a', id: 'sophia' }]).query;
    type PersonalityQuery = {
      select: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      maybeSingle: ReturnType<typeof vi.fn>;
    };
    const personalityQuery = {} as PersonalityQuery;
    Object.assign(personalityQuery, {
      select: vi.fn(() => personalityQuery),
      eq: vi.fn(() => personalityQuery),
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { personality: { inner_life: true, proactive_autonomy: false } },
      })),
    });
    const queries = [ownershipQuery, personalityQuery, ownershipQuery, personalityQuery];
    let calls = 0;
    const supabase = {
      from: vi.fn(() => queries[calls++] ?? personalityQuery),
    };

    await expect(allowsInnerLifeAutonomy(supabase, 'user-a', 'sophia')).resolves.toBe(true);
    await expect(allowsProactiveAutonomy(supabase, 'user-a', 'sophia')).resolves.toBe(false);
  });
});

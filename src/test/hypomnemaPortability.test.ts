import { describe, expect, it } from 'vitest';
import { loadHypomnema } from '../../supabase/functions/_shared/hypomnema/read';
import { loadRecentHypomnemaForPrompt } from '../../supabase/functions/_shared/hypomnema/write';

interface QueryCall {
  table: string;
  filters: Array<{ op: string; column: string; value: unknown }>;
}

interface QueryResponse {
  data?: unknown[] | null;
  error?: { message: string } | null;
}

function createSupabaseSequence(responses: QueryResponse[]) {
  const calls: QueryCall[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const call: QueryCall = { table, filters: [] };
        calls.push(call);
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            call.filters.push({ op: 'eq', column, value });
            return builder;
          },
          in: (column: string, value: unknown) => {
            call.filters.push({ op: 'in', column, value });
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          then: (resolve: (value: QueryResponse) => unknown, reject: (reason?: unknown) => unknown) => {
            const response = responses.shift() || { data: [], error: null };
            return Promise.resolve(response).then(resolve, reject);
          },
        };
        return builder;
      },
    },
  };
}

const importedHypomnemaRow = {
  id: 'hyp-restored',
  content: 'i am carrying the old account as prior interior continuity.',
  confidence: 0.82,
  domain: 'relationship',
  foundational: false,
  active_attention: false,
  last_revised: '2026-06-16T00:00:00.000Z',
  created_at: '2026-06-15T00:00:00.000Z',
  density: 'primary',
};

describe('hypomnema account portability continuity', () => {
  it('loads imported hypomnema as fallback continuity when no active rows are visible', async () => {
    const { client, calls } = createSupabaseSequence([
      { data: [], error: null },
      { data: [{ target_id: 'hyp-restored' }], error: null },
      { data: [importedHypomnemaRow], error: null },
    ]);

    const result = await loadHypomnema(client as never, 'target-user', 'luca');

    expect(result.count).toBe(1);
    expect(result.rendered).toBe(1);
    expect(result.block).toContain("what i'm carrying forward from the imported account");
    expect(result.block).toContain('old account as prior interior continuity');
    expect(calls.map((call) => call.table)).toEqual([
      'hypomnema_entry',
      'account_portability_row_map',
      'hypomnema_entry',
    ]);
    expect(calls[1].filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'table_name', value: 'hypomnema_entry' },
      { op: 'eq', column: 'target_agent_id', value: 'luca' },
    ]));
  });

  it('feeds imported prior hypomnema to the writer instead of first-contact copy', async () => {
    const { client } = createSupabaseSequence([
      { data: [], error: null },
      { data: [{ target_id: 'hyp-restored' }], error: null },
      { data: [importedHypomnemaRow], error: null },
    ]);

    const promptText = await loadRecentHypomnemaForPrompt(client as never, 'target-user', 'luca');

    expect(promptText).toContain('imported prior');
    expect(promptText).toContain('old account as prior interior continuity');
    expect(promptText).not.toContain('first reflection in this relationship');
  });
});

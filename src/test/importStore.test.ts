import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ImportStatusMockRow = {
  status: string;
  pipeline_stage: string | null;
  memories_created: number | null;
  questions_generated: number | null;
  conflicts_detected: number | null;
};

type ProfileMockRow = Record<string, unknown> | null;
type MaybeSingleChain = {
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};
type UpdateChain = {
  eq: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  importId: 'import-1',
  importStatusRow: {
    status: 'processing',
    pipeline_stage: 'profiling:values',
    memories_created: 7,
    questions_generated: 2,
    conflicts_detected: 1,
  } as ImportStatusMockRow,
  profileRow: { updated_at: '2026-06-13T12:00:00.000Z' } as ProfileMockRow,
  inserts: [] as unknown[],
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeMaybeSingleChain = (resolver: () => unknown) => {
    const chain = {} as MaybeSingleChain;
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: resolver(), error: null }));
    return chain;
  };

  const makeUpdateChain = () => {
    const chain = {} as UpdateChain;
    chain.eq = vi.fn(() => chain);
    return chain;
  };

  return {
    supabase: {
      auth: {
        getSession: mocks.getSession,
      },
      from: (table: string) => {
        if (table === 'chat_imports') {
          return {
            insert: (row: unknown) => {
              mocks.inserts.push(row);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: mocks.importId }, error: null }),
                }),
              };
            },
            update: (patch: unknown) => {
              mocks.updates.push(patch);
              return makeUpdateChain();
            },
            select: () => makeMaybeSingleChain(() => mocks.importStatusRow),
          };
        }

        if (table === 'psychological_profile') {
          return {
            select: () => makeMaybeSingleChain(() => mocks.profileRow),
          };
        }

        return {
          select: () => makeMaybeSingleChain(() => null),
        };
      },
    },
  };
});

import { ProfileStillRunningError, useImportStore, waitForProfile } from '@/stores/importStore';

async function flushImportStartup() {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

describe('import store background profiling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inserts = [];
    mocks.updates = [];
    mocks.importStatusRow = {
      status: 'processing',
      pipeline_stage: 'profiling:values',
      memories_created: 7,
      questions_generated: 2,
      conflicts_detected: 1,
    };
    mocks.profileRow = { updated_at: '2026-06-13T12:00:00.000Z' };
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null });
    useImportStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useImportStore.getState().reset();
  });

  it('uses a typed still-running error when profile polling times out', async () => {
    await expect(waitForProfile('user-1', { timeoutMs: 0 })).rejects.toBeInstanceOf(ProfileStillRunningError);
  });

  it('keeps the import processing when background profile polling times out', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/import-chatgpt')) {
        return new Response(JSON.stringify({
          memories_created: 7,
          questions_generated: 2,
          conflicts_detected: 1,
          created_contents: ['one memory'],
        }), { status: 200 });
      }
      if (url.includes('/memory-synthesize')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes('/profile-deep-analysis')) {
        return new Response(JSON.stringify({ status: 'processing' }), { status: 202 });
      }
      return new Response(JSON.stringify({ error: 'unexpected url' }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    useImportStore.setState({
      fileSize: 1000,
      filteredCount: 1,
      totalConversations: 1,
      preparedConversations: [{ mapping: {} }],
      platform: 'chatgpt',
      filterStats: {
        rawCount: 1,
        filteredCount: 1,
        skippedShort: 0,
        skippedLowText: 0,
        dateRange: null,
        estimatedMinutes: 1,
      },
    });

    const importPromise = useImportStore.getState().startImport('user-1', 'luca');
    await flushImportStartup();

    expect(useImportStore.getState().stage).toBe('profiling');
    expect(useImportStore.getState().pipelineDetail).toBe('background profiling');

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 8000);
    await importPromise;

    const state = useImportStore.getState();
    expect(state.stage).toBe('profiling');
    expect(state.pipelineDetail).toBe('background profiling - values');
    expect(state.error).toBeNull();
    expect(state.preparedConversations).toBeNull();
    expect(state.memoriesCreated).toBe(7);
    expect(mocks.updates).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
    expect(mocks.updates).not.toContainEqual(expect.objectContaining({ pipeline_stage: 'error' }));
  });
});

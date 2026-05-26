import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  state: {
    threadCount: 0 as number | null,
    messageCount: 0 as number | null,
    threadError: null as { message: string; code?: string } | null,
    messageError: null as { message: string; code?: string } | null,
    settingsData: null as { onboarding_completed_at?: string | null } | null,
    settingsError: null as { message: string; code?: string } | null,
    profileData: { id: 'profile-1', display_name: 'Riley' } as { id: string; display_name?: string | null } | null,
    profileError: null as { message: string; code?: string } | null,
    upsertError: null as { message: string; code?: string } | null,
    profileUpdateError: null as { message: string; code?: string } | null,
    profileInsertError: null as { message: string; code?: string } | null,
    upserts: [] as unknown[],
    profileUpdates: [] as unknown[],
    profileInserts: [] as unknown[],
  },
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: dbMock.from,
  },
}));

function setupDbMock() {
  dbMock.from.mockImplementation((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        if (table === 'threads') {
          return Promise.resolve({ count: dbMock.state.threadCount, error: dbMock.state.threadError });
        }
        if (table === 'messages') {
          return Promise.resolve({ count: dbMock.state.messageCount, error: dbMock.state.messageError });
        }
        if (table === 'user_settings') {
          return {
            maybeSingle: vi.fn(() => Promise.resolve({
              data: dbMock.state.settingsData,
              error: dbMock.state.settingsError,
            })),
          };
        }
        if (table === 'profiles') {
          return {
            maybeSingle: vi.fn(() => Promise.resolve({
              data: dbMock.state.profileData,
              error: dbMock.state.profileError,
            })),
          };
        }
        return { maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) };
      }),
    })),
    upsert: vi.fn((payload) => {
      dbMock.state.upserts.push(payload);
      return Promise.resolve({ error: dbMock.state.upsertError });
    }),
    update: vi.fn((payload) => ({
      eq: vi.fn(() => {
        dbMock.state.profileUpdates.push(payload);
        return Promise.resolve({ error: dbMock.state.profileUpdateError });
      }),
    })),
    insert: vi.fn((payload) => {
      dbMock.state.profileInserts.push(payload);
      return Promise.resolve({ error: dbMock.state.profileInsertError });
    }),
  }));
}

describe('first-run onboarding gate', () => {
  beforeEach(() => {
    dbMock.from.mockReset();
    dbMock.state.threadCount = 0;
    dbMock.state.messageCount = 0;
    dbMock.state.threadError = null;
    dbMock.state.messageError = null;
    dbMock.state.settingsData = null;
    dbMock.state.settingsError = null;
    dbMock.state.profileData = { id: 'profile-1', display_name: 'OAuth Name' };
    dbMock.state.profileError = null;
    dbMock.state.upsertError = null;
    dbMock.state.profileUpdateError = null;
    dbMock.state.profileInsertError = null;
    dbMock.state.upserts = [];
    dbMock.state.profileUpdates = [];
    dbMock.state.profileInserts = [];
    setupDbMock();
  });

  it('routes a fresh OAuth-created profile into onboarding', async () => {
    const { isFirstRun } = await import('@/lib/firstRun');

    await expect(isFirstRun('user-1')).resolves.toBe(true);
  });

  it('does not route users who already completed onboarding', async () => {
    const { isFirstRun } = await import('@/lib/firstRun');
    dbMock.state.settingsData = { onboarding_completed_at: '2026-05-26T12:30:00.000Z' };

    await expect(isFirstRun('user-1')).resolves.toBe(false);
  });

  it('fails open when activity checks cannot be read', async () => {
    const { isFirstRun } = await import('@/lib/firstRun');
    dbMock.state.threadError = { message: 'network failure' };

    await expect(isFirstRun('user-1')).resolves.toBe(false);
  });

  it('marks onboarding complete in user_settings with the chosen mode and preferences', async () => {
    const { markOnboarded } = await import('@/lib/firstRun');

    await markOnboarded('user-1', undefined, {
      interfaceMode: 'guided',
      preferences: { intent: 'bring_existing', comfort: 'low', expectations: ['migration', 'memory'] },
    });

    expect(dbMock.state.upserts).toHaveLength(1);
    expect(dbMock.state.upserts[0]).toMatchObject({
      user_id: 'user-1',
      interface_mode: 'guided',
      onboarding_preferences: {
        intent: 'bring_existing',
        comfort: 'low',
        expectations: ['migration', 'memory'],
      },
    });
    expect(String((dbMock.state.upserts[0] as { onboarding_completed_at: string }).onboarding_completed_at)).toContain('T');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  single: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row);
        return { select: () => ({ single: mocks.single }) };
      },
    }),
  },
}));

import { insertMessageWithFreshSession, MessagePersistenceAuthError } from '@/lib/messagePersistence';

const row = {
  thread_id: 'thread-1',
  user_id: 'user-1',
  role: 'user',
  content: 'hello',
};

describe('insertMessageWithFreshSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      error: null,
    });
    mocks.refreshSession.mockResolvedValue({
      data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      error: null,
    });
  });

  it('inserts and returns the persisted row', async () => {
    mocks.single.mockResolvedValueOnce({ data: { id: 'message-1', ...row }, error: null });

    await expect(insertMessageWithFreshSession(row)).resolves.toMatchObject({ id: 'message-1' });
    expect(mocks.insert).toHaveBeenCalledWith(row);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes the session and retries once on an RLS-shaped insert failure', async () => {
    mocks.single
      .mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } })
      .mockResolvedValueOnce({ data: { id: 'message-2', ...row }, error: null });

    await expect(insertMessageWithFreshSession(row)).resolves.toMatchObject({ id: 'message-2' });
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });

  it('throws an auth-specific error when no signed-in session exists', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await expect(insertMessageWithFreshSession(row)).rejects.toBeInstanceOf(MessagePersistenceAuthError);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock('@/integrations/lovable', () => ({
  lovable: {
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  },
}));

import { authRedirectTo, signInWithGoogle } from '@/lib/authFlow';

describe('authFlow', () => {
  beforeEach(() => {
    mocks.signInWithOAuth.mockReset();
  });

  it('builds same-origin redirect URLs for auth callbacks', () => {
    expect(authRedirectTo('/chat')).toBe(`${window.location.origin}/chat`);
    expect(authRedirectTo('reset-password')).toBe(`${window.location.origin}/reset-password`);
  });

  it('starts Google OAuth with the app chat redirect and account chooser', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: null, redirected: true });

    await expect(signInWithGoogle()).resolves.toEqual({ redirected: true });

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith('google', {
      redirect_uri: `${window.location.origin}/chat`,
      extraParams: { prompt: 'select_account' },
    });
  });

  it('returns a displayable OAuth error instead of throwing', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: { message: 'provider disabled' } });

    await expect(signInWithGoogle()).resolves.toEqual({ error: 'provider disabled', redirected: false });
  });
});

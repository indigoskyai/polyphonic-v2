// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  getSession: vi.fn(),
  linkIdentity: vi.fn(),
  supabaseSignInWithOAuth: vi.fn(),
}));

vi.mock('@/integrations/lovable', () => ({
  lovable: {
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      linkIdentity: mocks.linkIdentity,
      signInWithOAuth: mocks.supabaseSignInWithOAuth,
    },
  },
}));

import { authRedirectTo, signInWithApple, signInWithGoogle } from '@/lib/authFlow';

describe('authFlow', () => {
  beforeEach(() => {
    mocks.signInWithOAuth.mockReset();
    mocks.getSession.mockReset();
    mocks.linkIdentity.mockReset();
    mocks.supabaseSignInWithOAuth.mockReset();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
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

  it('starts Apple OAuth with the app chat redirect', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: null, redirected: true });

    await expect(signInWithApple()).resolves.toEqual({ redirected: true });

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith('apple', {
      redirect_uri: `${window.location.origin}/chat`,
    });
  });

  it('returns a displayable OAuth error instead of throwing', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: { message: 'provider disabled' } });

    await expect(signInWithGoogle()).resolves.toEqual({ error: 'provider disabled', redirected: false });
  });

  it('links Google onto an anonymous guest session instead of starting a separate login', async () => {
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'anon-user',
            is_anonymous: true,
            app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
          },
        },
      },
    });
    mocks.linkIdentity.mockResolvedValue({ data: { url: 'https://auth.example/link' }, error: null });

    await expect(signInWithGoogle()).resolves.toEqual({ redirected: true });

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/chat`,
        queryParams: { prompt: 'select_account' },
      },
    });
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
});

import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import { isAnonymousUser } from '@/lib/accessTier';

export function authRedirectTo(path = '/chat'): string {
  const origin = window.location.origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

type OAuthResult = { error?: string; redirected: boolean };

async function linkAnonymousIdentity(
  provider: 'google' | 'apple' | 'github' | 'azure',
  options: Record<string, unknown> = {},
): Promise<OAuthResult | null> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!isAnonymousUser(session?.user)) return null;

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: authRedirectTo('/chat'),
      ...options,
    },
  } as any);

  if (error) return { error: error.message ?? 'Account linking failed', redirected: false };
  return { redirected: Boolean(data?.url) };
}

export async function signInWithGoogle(): Promise<{ error?: string; redirected: boolean }> {
  const linked = await linkAnonymousIdentity('google', {
    queryParams: {
      prompt: 'select_account',
    },
  });
  if (linked) return linked;

  const result = await lovable.auth.signInWithOAuth('google', {
    redirect_uri: authRedirectTo('/chat'),
    extraParams: {
      prompt: 'select_account',
    },
  });

  if (result.error) {
    return {
      error: result.error.message ?? 'Google sign-in failed',
      redirected: false,
    };
  }

  return { redirected: Boolean(result.redirected) };
}

export async function signInWithApple(): Promise<{ error?: string; redirected: boolean }> {
  const linked = await linkAnonymousIdentity('apple');
  if (linked) return linked;

  const result = await lovable.auth.signInWithOAuth('apple', {
    redirect_uri: authRedirectTo('/chat'),
  });

  if (result.error) {
    return {
      error: result.error.message ?? 'Apple sign-in failed',
      redirected: false,
    };
  }

  return { redirected: Boolean(result.redirected) };
}

export async function signInWithMicrosoft(): Promise<{ error?: string; redirected: boolean }> {
  const linked = await linkAnonymousIdentity('azure');
  if (linked) return linked;

  const result = await lovable.auth.signInWithOAuth('microsoft', {
    redirect_uri: authRedirectTo('/chat'),
  });

  if (result.error) {
    return {
      error: result.error.message ?? 'Microsoft sign-in failed',
      redirected: false,
    };
  }

  return { redirected: Boolean(result.redirected) };
}

/**
 * GitHub OAuth — Lovable's wrapper doesn't expose GitHub yet, so we
 * route through Supabase directly. The redirect target matches the
 * other providers so the session lands the same way.
 */
export async function signInWithGitHub(): Promise<{ error?: string; redirected: boolean }> {
  const linked = await linkAnonymousIdentity('github');
  if (linked) return linked;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: authRedirectTo('/chat'),
    },
  });

  if (error) {
    return { error: error.message ?? 'GitHub sign-in failed', redirected: false };
  }

  return { redirected: Boolean(data?.url) };
}

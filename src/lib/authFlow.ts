import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';

export function authRedirectTo(path = '/chat'): string {
  const origin = window.location.origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function signInWithGoogle(): Promise<{ error?: string; redirected: boolean }> {
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

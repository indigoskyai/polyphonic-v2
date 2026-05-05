import { lovable } from '@/integrations/lovable';

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

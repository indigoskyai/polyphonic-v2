import type { User } from '@supabase/supabase-js';

export type AccessTier = 'guest' | 'account_free' | 'advanced' | 'byok';
export type ModelKeyStatus = 'checking' | 'present' | 'missing' | 'unknown';
export type GateStatus = 'unknown' | 'checking' | 'verified' | 'denied' | 'bypass';

export function isAnonymousUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const u = user as User & {
    is_anonymous?: boolean;
    app_metadata?: { provider?: string; providers?: string[] };
  };
  return (
    u.is_anonymous === true ||
    u.app_metadata?.provider === 'anonymous' ||
    (Array.isArray(u.app_metadata?.providers) && u.app_metadata.providers.includes('anonymous'))
  );
}

export function resolveAccessTier(opts: {
  user: User | null | undefined;
  modelKeyStatus?: ModelKeyStatus;
  gateStatus?: GateStatus;
}): AccessTier | null {
  if (!opts.user) return null;
  if (opts.modelKeyStatus === 'present') return 'byok';
  if (opts.gateStatus === 'verified' || opts.gateStatus === 'bypass') return 'advanced';
  if (isAnonymousUser(opts.user)) return 'guest';
  return 'account_free';
}

export function canAccessAdvancedSurfaces(tier: AccessTier | null): boolean {
  return tier === 'advanced' || tier === 'byok';
}

export function isPlatformFundedTier(tier: AccessTier | null): boolean {
  return tier === 'guest' || tier === 'account_free' || tier === 'advanced';
}

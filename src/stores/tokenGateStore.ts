import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type GateStatus = 'unknown' | 'checking' | 'verified' | 'denied' | 'bypass';

interface TokenGateState {
  status: GateStatus;
  walletAddress: string | null;
  balance: number;
  usdValue: number;
  priceUsed: number;
  expiresAt: string | null;
  error: string | null;
  hydrate: () => Promise<void>;
  setResult: (r: Partial<TokenGateState>) => void;
  reset: () => void;
}

export const useTokenGateStore = create<TokenGateState>((set) => ({
  status: 'unknown',
  walletAddress: null,
  balance: 0,
  usdValue: 0,
  priceUsed: 0,
  expiresAt: null,
  error: null,
  hydrate: async () => {
    set({ status: 'checking' });
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      set({ status: 'unknown' });
      return;
    }
    // Admin bypass
    const { data: roleData } = await supabase
      .from('user_roles' as any)
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleData) {
      set({ status: 'bypass' });
      return;
    }

    const callRpc = supabase.rpc as unknown as (
      fn: string
    ) => Promise<{ data: boolean | null; error: unknown }>;
    const { data: emailBypass } = await callRpc('current_user_token_gate_email_bypass');
    if (emailBypass === true) {
      set({ status: 'bypass' });
      return;
    }

    const { data } = await supabase
      .from('token_gate_verifications' as any)
      .select('wallet_address,balance,usd_value,price_used,expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (data && new Date((data as any).expires_at).getTime() > Date.now()) {
      const d = data as any;
      set({
        status: 'verified',
        walletAddress: d.wallet_address,
        balance: Number(d.balance),
        usdValue: Number(d.usd_value),
        priceUsed: Number(d.price_used),
        expiresAt: d.expires_at,
      });
    } else {
      set({ status: 'denied' });
    }
  },
  setResult: (r) => set(r as any),
  reset: () =>
    set({
      status: 'unknown',
      walletAddress: null,
      balance: 0,
      usdValue: 0,
      priceUsed: 0,
      expiresAt: null,
      error: null,
    }),
}));

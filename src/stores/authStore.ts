import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { resetClientSessionStores } from '@/stores/sessionReset';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialize: () => () => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialize: () => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          resetClientSessionStores();
        }
        set({ session, user: session?.user ?? null, loading: false });
      }
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false });
    });
    return () => subscription.unsubscribe();
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    resetClientSessionStores();
    set({ session: null, user: null, loading: false });
    if (error) throw error;
  },
}));

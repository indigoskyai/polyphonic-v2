import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
      (_event, session) => {
        set({ session, user: session?.user ?? null, loading: false });
      }
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false });
    });
    return () => subscription.unsubscribe();
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));

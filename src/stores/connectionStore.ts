import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface ConnectionState {
  connected: boolean;
  setConnected: (v: boolean) => void;
  subscribe: () => () => void;
  retry: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: true,

  setConnected: (v) => set({ connected: v }),

  subscribe: () => {
    let closed = false;
    const channel = supabase
      .channel('system:presence')
      .subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') {
          set({ connected: true });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          set({ connected: false });
        }
      });
    return () => {
      closed = true;
      supabase.removeChannel(channel);
    };
  },

  retry: () => {
    // Attempt to re-subscribe by forcing a reconnect
    try {
      supabase.realtime.connect();
    } catch (err) {
      console.warn('[connectionStore] retry failed', err);
    }
  },
}));

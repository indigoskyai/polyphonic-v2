import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Connection store — tracks whether the Supabase realtime channel is alive
 * so the ConnectionBanner can warn the user and offer a real retry.
 *
 * Tara reported (2026-05-09) that the banner gets stuck on a wired
 * connection: the "Retry now" button calls `supabase.realtime.connect()`
 * but never removes the dead channel or re-establishes a fresh subscriber,
 * so the banner persists even after the underlying transport recovers.
 *
 * Fix: track the live channel + close state + last status reason. `retry()`
 * tears down the existing channel, kicks the realtime client to reconnect,
 * and re-subscribes a fresh channel. The banner can render the last failure
 * reason so silent failures stop being silent.
 */

interface ConnectionState {
  connected: boolean;
  /** Last channel status that triggered a disconnect, surfaced in the banner. */
  reason: string | null;
  setConnected: (v: boolean) => void;
  subscribe: () => () => void;
  retry: () => void;
}

let currentChannel: RealtimeChannel | null = null;
let closed = false;
let subscribers = 0;

function tearDown() {
  if (currentChannel) {
    try {
      supabase.removeChannel(currentChannel);
    } catch (err) {
      console.warn('[connectionStore] removeChannel failed', err);
    }
    currentChannel = null;
  }
}

function openChannel(set: (partial: Partial<ConnectionState>) => void) {
  tearDown();
  const channel = supabase
    .channel('system:presence')
    .subscribe((status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        set({ connected: true, reason: null });
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[connectionStore] realtime channel status', status);
        set({ connected: false, reason: 'Channel error — check your connection or the server.' });
      } else if (status === 'TIMED_OUT') {
        console.warn('[connectionStore] realtime channel status', status);
        set({ connected: false, reason: 'Connection timed out — server did not respond.' });
      } else if (status === 'CLOSED') {
        console.warn('[connectionStore] realtime channel status', status);
        set({ connected: false, reason: 'Connection closed.' });
      }
    });
  currentChannel = channel;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: true,
  reason: null,

  setConnected: (v) => set({ connected: v }),

  subscribe: () => {
    subscribers += 1;
    closed = false;
    if (!currentChannel) {
      openChannel(set);
    }
    return () => {
      subscribers = Math.max(0, subscribers - 1);
      if (subscribers === 0) {
        closed = true;
        tearDown();
      }
    };
  },

  retry: () => {
    try {
      // 1. Drop the dead channel.
      tearDown();
      // 2. Kick the realtime client. Some transport states only recover via
      //    an explicit connect() call.
      try {
        supabase.realtime.connect();
      } catch (err) {
        console.warn('[connectionStore] realtime.connect() failed', err);
      }
      // 3. Re-subscribe. The subscribe callback will flip `connected` to
      //    true once we get `SUBSCRIBED`, or update `reason` on failure.
      closed = false;
      openChannel(set);
    } catch (err) {
      console.warn('[connectionStore] retry failed', err);
      set({ reason: err instanceof Error ? err.message : 'Retry failed — see browser console.' });
    }
  },
}));

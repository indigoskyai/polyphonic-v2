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
  /** Delayed visibility avoids flashing the warning for transient reconnects. */
  visible: boolean;
  /** Last channel status that triggered a disconnect, surfaced in the banner. */
  reason: string | null;
  setConnected: (v: boolean) => void;
  subscribe: () => () => void;
  retry: () => void;
}

let currentChannel: RealtimeChannel | null = null;
let closed = false;
let subscribers = 0;
let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

const QUIET_RECONNECT_MS = 1200;
const MAX_RECONNECT_DELAY_MS = 8000;
const SURFACE_AFTER_MS = 30000;
const SURFACE_AFTER_FAILURES = 3;

function clearVisibilityTimer() {
  if (visibilityTimer) {
    clearTimeout(visibilityTimer);
    visibilityTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

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

function markConnected(set: (partial: Partial<ConnectionState>) => void) {
  clearVisibilityTimer();
  clearReconnectTimer();
  reconnectAttempts = 0;
  set({ connected: true, visible: false, reason: null });
}

function markDisconnected(
  set: (partial: Partial<ConnectionState>) => void,
  reason: string,
  options: { surfaceAfterMs?: number | null; forceVisible?: boolean } = {},
) {
  clearVisibilityTimer();
  const surfaceAfterMs = options.surfaceAfterMs === undefined ? SURFACE_AFTER_MS : options.surfaceAfterMs;
  const shouldSurfaceNow = Boolean(options.forceVisible) || reconnectAttempts >= SURFACE_AFTER_FAILURES;

  set({ connected: false, visible: shouldSurfaceNow, reason });
  if (shouldSurfaceNow || surfaceAfterMs === null) return;

  visibilityTimer = setTimeout(() => {
    if (!closed && subscribers > 0 && reconnectAttempts > 0) {
      set({ connected: false, visible: true, reason });
    }
  }, surfaceAfterMs);
}

function scheduleReconnect(set: (partial: Partial<ConnectionState>) => void) {
  if (closed || subscribers === 0) return;
  clearReconnectTimer();

  const delay = Math.min(
    QUIET_RECONNECT_MS * Math.max(1, reconnectAttempts),
    MAX_RECONNECT_DELAY_MS,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (closed || subscribers === 0) return;
    try {
      supabase.realtime.connect();
    } catch (err) {
      console.warn('[connectionStore] realtime.connect() failed', err);
    }
    openChannel(set);
  }, delay);
}

function openChannel(set: (partial: Partial<ConnectionState>) => void) {
  clearReconnectTimer();
  tearDown();
  const channel: RealtimeChannel = supabase
    .channel('system:presence')
    .subscribe((status) => {
      if (closed || currentChannel !== channel) return;
      if (status === 'SUBSCRIBED') {
        markConnected(set);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[connectionStore] realtime channel status', status);
        reconnectAttempts += 1;
        markDisconnected(set, 'Channel error. Retrying realtime updates.');
        scheduleReconnect(set);
      } else if (status === 'TIMED_OUT') {
        console.warn('[connectionStore] realtime channel status', status);
        reconnectAttempts += 1;
        markDisconnected(set, 'Server did not respond before the realtime timeout.');
        scheduleReconnect(set);
      } else if (status === 'CLOSED') {
        console.warn('[connectionStore] realtime channel status', status);
        // Supabase can close idle channels as part of normal lifecycle work.
        // Reconnect quietly; sustained CHANNEL_ERROR/TIMED_OUT statuses are the
        // conditions that should interrupt the user.
        markDisconnected(set, 'Realtime updates are reconnecting in the background.', {
          surfaceAfterMs: null,
        });
        scheduleReconnect(set);
      }
    });
  currentChannel = channel;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: true,
  visible: false,
  reason: null,

  setConnected: (v) => {
    if (v) {
      markConnected(set);
    } else {
      markDisconnected(set, 'Realtime connection interrupted.');
    }
  },

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
        clearVisibilityTimer();
        clearReconnectTimer();
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
      reconnectAttempts = 0;
      closed = false;
      clearVisibilityTimer();
      clearReconnectTimer();
      set({ connected: false, visible: false, reason: 'Trying a fresh realtime connection.' });
      openChannel(set);
    } catch (err) {
      console.warn('[connectionStore] retry failed', err);
      set({
        connected: false,
        visible: true,
        reason: err instanceof Error ? err.message : 'Retry failed. See browser console.',
      });
    }
  },
}));

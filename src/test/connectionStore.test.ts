import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realtimeMock = vi.hoisted(() => ({
  channels: [] as Array<{
    callback?: (status: string) => void;
    subscribe: ReturnType<typeof vi.fn>;
  }>,
  channel: vi.fn(),
  connect: vi.fn(),
  removeChannel: vi.fn(),
  reset() {
    this.channels.length = 0;
    this.channel.mockReset();
    this.connect.mockReset();
    this.removeChannel.mockReset();
    this.channel.mockImplementation(() => {
      const channel = {
        callback: undefined as ((status: string) => void) | undefined,
        subscribe: vi.fn((callback: (status: string) => void) => {
          channel.callback = callback;
          return channel;
        }),
      };
      this.channels.push(channel);
      return channel;
    });
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: realtimeMock.channel,
    realtime: {
      connect: realtimeMock.connect,
    },
    removeChannel: realtimeMock.removeChannel,
  },
}));

async function loadConnectionStore() {
  const mod = await import('@/stores/connectionStore');
  return mod.useConnectionStore;
}

describe('connection store realtime health', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    realtimeMock.reset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps transient realtime channel closes quiet and reconnects automatically', async () => {
    const useConnectionStore = await loadConnectionStore();
    const unsubscribe = useConnectionStore.getState().subscribe();

    realtimeMock.channels[0].callback?.('SUBSCRIBED');
    expect(useConnectionStore.getState()).toMatchObject({ connected: true, visible: false });

    realtimeMock.channels[0].callback?.('CLOSED');
    expect(useConnectionStore.getState()).toMatchObject({ connected: false, visible: false });

    vi.advanceTimersByTime(60_000);
    expect(realtimeMock.connect).toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({ connected: false, visible: false });
    expect(realtimeMock.channel).toHaveBeenCalledTimes(2);

    realtimeMock.channels[1].callback?.('SUBSCRIBED');
    expect(useConnectionStore.getState()).toMatchObject({ connected: true, visible: false, reason: null });

    unsubscribe();
  });

  it('surfaces a banner only after sustained realtime failure', async () => {
    const useConnectionStore = await loadConnectionStore();
    const unsubscribe = useConnectionStore.getState().subscribe();

    realtimeMock.channels[0].callback?.('CHANNEL_ERROR');
    expect(useConnectionStore.getState()).toMatchObject({ connected: false, visible: false });

    vi.advanceTimersByTime(29_999);
    expect(useConnectionStore.getState()).toMatchObject({ visible: false });

    vi.advanceTimersByTime(1);
    expect(useConnectionStore.getState()).toMatchObject({ connected: false, visible: true });

    unsubscribe();
  });
});

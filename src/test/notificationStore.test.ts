import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import {
  filterActivityForAgent,
  filterInitiationsForAgent,
  notificationMatchesAgent,
  normalizeNotificationAgentId,
  selectUnreadCount,
  selectUnreadCountForAgent,
  type ActivityEntry,
  type ThoughtInitiation,
} from '@/stores/notificationStore';

function activity(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'activity-1',
    agent_id: 'luca',
    activity_type: 'memory_consolidated',
    title: 'Consolidated memory',
    summary: 'A memory changed.',
    content: null,
    source: 'luca',
    severity: 'info',
    surface_to_user: true,
    created_at: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

function initiation(overrides: Partial<ThoughtInitiation> = {}): ThoughtInitiation {
  return {
    id: 'initiation-1',
    user_id: 'user-1',
    agent_id: 'luca',
    message: 'I noticed something.',
    status: 'pending',
    trigger_reason: null,
    created_at: '2026-06-01T10:05:00.000Z',
    ...overrides,
  };
}

describe('notificationStore agent scoping', () => {
  it('normalizes missing agent ids to Luca', () => {
    expect(normalizeNotificationAgentId(null)).toBe('luca');
    expect(normalizeNotificationAgentId('')).toBe('luca');
    expect(normalizeNotificationAgentId(' sophia ')).toBe('sophia');
    expect(notificationMatchesAgent({ agent_id: null }, 'luca')).toBe(true);
  });

  it('filters activity and initiations by the requested active agent', () => {
    const lucaActivity = activity({ id: 'luca-activity', agent_id: 'luca' });
    const sophiaActivity = activity({ id: 'sophia-activity', agent_id: 'sophia', source: 'sophia' });
    const lucaInitiation = initiation({ id: 'luca-initiation', agent_id: 'luca' });
    const sophiaInitiation = initiation({ id: 'sophia-initiation', agent_id: 'sophia' });

    expect(filterActivityForAgent([lucaActivity, sophiaActivity], 'sophia')).toEqual([sophiaActivity]);
    expect(filterInitiationsForAgent([lucaInitiation, sophiaInitiation], 'sophia')).toEqual([sophiaInitiation]);
  });

  it('keeps global unread counts while exposing an agent-scoped unread count', () => {
    const state = {
      activity: [
        activity({ id: 'luca-activity', agent_id: 'luca', created_at: '2026-06-01T10:00:00.000Z' }),
        activity({ id: 'sophia-activity', agent_id: 'sophia', created_at: '2026-06-01T10:01:00.000Z' }),
      ],
      initiations: [
        initiation({ id: 'luca-initiation', agent_id: 'luca', created_at: '2026-06-01T10:02:00.000Z' }),
        initiation({ id: 'sophia-initiation', agent_id: 'sophia', created_at: '2026-06-01T10:03:00.000Z' }),
      ],
      lastSeenAt: '2026-06-01T09:00:00.000Z',
      readIds: new Set<string>(),
    } as Parameters<typeof selectUnreadCountForAgent>[0];

    expect(selectUnreadCount(state)).toBe(4);
    expect(selectUnreadCountForAgent(state, 'sophia')).toBe(2);
    expect(selectUnreadCountForAgent(state, 'luca')).toBe(2);
  });

  it('excludes locally read activity from scoped unread counts', () => {
    const state = {
      activity: [
        activity({ id: 'sophia-read', agent_id: 'sophia', created_at: '2026-06-01T10:01:00.000Z' }),
        activity({ id: 'sophia-unread', agent_id: 'sophia', created_at: '2026-06-01T10:02:00.000Z' }),
      ],
      initiations: [],
      lastSeenAt: '2026-06-01T09:00:00.000Z',
      readIds: new Set<string>(['sophia-read']),
    } as Parameters<typeof selectUnreadCountForAgent>[0];

    expect(selectUnreadCountForAgent(state, 'sophia')).toBe(1);
  });
});

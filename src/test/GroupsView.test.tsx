import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupsView from '@/pages/GroupsView';
import type { GroupRoom, GroupRoomMember } from '@/lib/groupRooms';

const room: GroupRoom = {
  id: 'room-1',
  owner_user_id: 'user-1',
  title: 'Studio room',
  description: null,
  visibility: 'invite_only',
  state: 'active',
  history_policy: 'join_forward',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-01T10:00:00.000Z',
};

const member: GroupRoomMember = {
  id: 'member-1',
  room_id: 'room-1',
  user_id: 'user-1',
  role: 'owner',
  state: 'active',
  joined_at: '2026-07-01T10:00:00.000Z',
  left_at: null,
  last_read_message_id: null,
  muted: false,
  can_see_history_before_join: true,
  display_snapshot: { display_name: 'Riley', handle: 'riley' },
  notification_prefs: {},
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-01T10:00:00.000Z',
};

const groupStore = {
  rooms: [room],
  membersByRoom: { 'room-1': [member] },
  agentsByRoom: { 'room-1': [] },
  messagesByRoom: { 'room-1': [] },
  jobsByRoom: { 'room-1': [] },
  memoryByRoom: { 'room-1': [] },
  loadingRooms: false,
  loadingRoomId: null,
  creatingRoom: false,
  error: null,
  inviteUrl: null,
  loadRooms: vi.fn(),
  loadRoom: vi.fn(),
  subscribeRoom: vi.fn(() => () => undefined),
  createRoom: vi.fn(),
  inviteRoom: vi.fn(),
  acceptInvite: vi.fn(),
  addAgent: vi.fn(),
  removeAgent: vi.fn(),
  sendMessage: vi.fn(),
  requestAgent: vi.fn(),
  deleteMessage: vi.fn(),
  updateMember: vi.fn(),
  createMemoryCandidate: vi.fn(),
  reviewMemoryCandidate: vi.fn(),
  roomUnreadCount: vi.fn(() => 0),
  clearError: vi.fn(),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      track: vi.fn(),
      presenceState: vi.fn(() => ({})),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    id: 'user-1',
    is_anonymous: false,
    app_metadata: {},
  })),
}));

vi.mock('@/stores/agentSettingsStore', () => ({
  useAgentSettingsStore: vi.fn((selector?: (state: { agents: unknown[]; load: () => void }) => unknown) => {
    const state = { agents: [], load: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/groupRoomStore', () => ({
  useGroupRoomStore: vi.fn(() => groupStore),
}));

describe('GroupsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupStore.error = null;
    groupStore.creatingRoom = false;
  });

  it('renders the room list route', () => {
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <Routes>
          <Route path="/groups" element={<GroupsView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Studio room/i })).toBeInTheDocument();
  });

  it('renders the room detail route with panels and composer', () => {
    render(
      <MemoryRouter initialEntries={['/groups/room-1']}>
        <Routes>
          <Route path="/groups/:roomId" element={<GroupsView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Studio room' })).toBeInTheDocument();
    expect(screen.getByLabelText('Room transcript')).toBeInTheDocument();
    expect(screen.getByLabelText('Message the room')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Room panels' })).toBeInTheDocument();
  });

  it('surfaces create-room errors on the list route', () => {
    groupStore.error = 'Group room backend is not deployed yet.';
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <Routes>
          <Route path="/groups" element={<GroupsView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Group room backend is not deployed yet.');
  });
});

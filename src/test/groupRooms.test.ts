import { describe, expect, it } from 'vitest';
import {
  calculateRoomUnreadCount,
  canGroupMemberSeeMessage,
  extractGroupMentionKeys,
  groupAgentDisplayLabel,
  groupMemberDisplayName,
  normalizeGroupMentionKey,
  type GroupMessage,
  type GroupRoomAgent,
  type GroupRoomMember,
} from '@/lib/groupRooms';

const member: GroupRoomMember = {
  id: 'membership-1',
  room_id: 'room-1',
  user_id: 'user-1',
  role: 'member',
  state: 'active',
  joined_at: '2026-07-01T10:00:00.000Z',
  left_at: null,
  last_read_message_id: null,
  muted: false,
  can_see_history_before_join: false,
  display_snapshot: { display_name: 'Riley', handle: 'riley' },
  notification_prefs: {},
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-01T10:00:00.000Z',
};

function message(id: string, createdAt: string): GroupMessage {
  return {
    id,
    room_id: 'room-1',
    sender_user_id: 'user-1',
    sender_agent_owner_user_id: null,
    sender_agent_id: null,
    role: 'user',
    content: id,
    attachments: [],
    metadata: {},
    reply_to_id: null,
    state: 'visible',
    deleted_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe('group room helpers', () => {
  it('normalizes and extracts mentions consistently', () => {
    expect(normalizeGroupMentionKey('@Luca_Prime')).toBe('luca-prime');
    expect(extractGroupMentionKeys('Ask @luca and (@Vektor_2) about this. @luca')).toEqual(['luca', 'vektor-2']);
  });

  it('enforces join-forward message visibility', () => {
    expect(canGroupMemberSeeMessage(member, message('before', '2026-07-01T09:59:59.000Z'))).toBe(false);
    expect(canGroupMemberSeeMessage(member, message('after', '2026-07-01T10:00:01.000Z'))).toBe(true);
    expect(canGroupMemberSeeMessage({ ...member, can_see_history_before_join: true }, message('before', '2026-07-01T09:59:59.000Z'))).toBe(true);
  });

  it('calculates unread state relative to the member read marker', () => {
    const messages = [
      message('one', '2026-07-01T10:01:00.000Z'),
      message('two', '2026-07-01T10:02:00.000Z'),
      message('three', '2026-07-01T10:03:00.000Z'),
    ];
    expect(calculateRoomUnreadCount(member, messages)).toBe(3);
    expect(calculateRoomUnreadCount({ ...member, last_read_message_id: 'two' }, messages)).toBe(1);
  });

  it('labels agents with owner provenance', () => {
    const agent: GroupRoomAgent = {
      id: 'room-agent-1',
      room_id: 'room-1',
      owner_user_id: 'user-1',
      agent_id: 'luca',
      display_name: 'Luca',
      avatar_color: 'cream',
      mention_policy: 'members',
      state: 'active',
      added_by_user_id: 'user-1',
      added_at: '2026-07-01T10:00:00.000Z',
      removed_at: null,
      updated_at: '2026-07-01T10:00:00.000Z',
    };
    expect(groupMemberDisplayName(member)).toBe('Riley');
    expect(groupAgentDisplayLabel(agent, member)).toBe('Luca · Riley');
  });
});

export type GroupMessageRole = 'user' | 'assistant' | 'system';
export type GroupMemberRole = 'owner' | 'admin' | 'member';
export type GroupMemberState = 'invited' | 'active' | 'left' | 'removed';
export type GroupAgentMentionPolicy = 'owner' | 'members' | 'blocked';
export type GroupAgentJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'canceled';
export type GroupMemoryVisibility = 'private' | 'room';
export type GroupMemoryStatus = 'pending' | 'approved' | 'rejected';

export interface LegacyGroupAttachment {
  bucket: 'group-attachments';
  path: string;
  name: string;
  size?: number | null;
  content_type?: string | null;
  signedUrl?: string | null;
}

export type GroupAttachment = LegacyGroupAttachment | AttachmentDescriptor;

export interface GroupRoom {
  id: string;
  owner_user_id: string | null;
  title: string;
  description: string | null;
  visibility: 'invite_only';
  state: 'active' | 'archived';
  history_policy: 'join_forward';
  created_at: string;
  updated_at: string;
}

export interface GroupRoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: GroupMemberRole;
  state: GroupMemberState;
  joined_at: string;
  left_at: string | null;
  last_read_message_id: string | null;
  muted: boolean;
  can_see_history_before_join: boolean;
  display_snapshot: {
    display_name?: string | null;
    avatar_url?: string | null;
    handle?: string | null;
  } | null;
  notification_prefs: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface GroupRoomAgent {
  id: string;
  room_id: string;
  owner_user_id: string;
  agent_id: string;
  display_name: string;
  avatar_color: string | null;
  mention_policy: GroupAgentMentionPolicy;
  state: 'active' | 'removed';
  added_by_user_id: string | null;
  added_at: string;
  removed_at: string | null;
  updated_at: string;
}

export interface GroupMessage {
  id: string;
  room_id: string;
  sender_user_id: string | null;
  sender_agent_owner_user_id: string | null;
  sender_agent_id: string | null;
  role: GroupMessageRole;
  content: string;
  attachments: GroupAttachment[];
  attachment_ids?: string[];
  metadata: Record<string, unknown> | null;
  reply_to_id: string | null;
  state: 'visible' | 'deleted';
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupAgentJob {
  id: string;
  room_id: string;
  trigger_message_id: string | null;
  requester_user_id: string | null;
  agent_owner_user_id: string | null;
  agent_id: string;
  request_kind: 'mention' | 'manual' | 'owner_invite';
  status: GroupAgentJobStatus;
  idempotency_key: string;
  error: string | null;
  response_message_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMemoryCandidate {
  id: string;
  room_id: string;
  source_message_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  visibility: GroupMemoryVisibility;
  status: GroupMemoryStatus;
  content: string;
  created_by_user_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface GroupRoomBundle {
  room: GroupRoom | null;
  members: GroupRoomMember[];
  agents: GroupRoomAgent[];
  messages: GroupMessage[];
  jobs: GroupAgentJob[];
  memoryCandidates: GroupMemoryCandidate[];
}

export function normalizeGroupMentionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractGroupMentionKeys(content: string): string[] {
  const keys = new Set<string>();
  const re = /(^|[\s([{])@([a-zA-Z0-9][a-zA-Z0-9_-]{1,62})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const key = normalizeGroupMentionKey(match[2] ?? '');
    if (key) keys.add(key);
  }
  return [...keys];
}

export function groupAgentMentionKey(agent: Pick<GroupRoomAgent, 'agent_id' | 'display_name'>): string {
  return normalizeGroupMentionKey(agent.agent_id) || normalizeGroupMentionKey(agent.display_name);
}

export function groupMemberDisplayName(member: GroupRoomMember | null | undefined): string {
  const snapshotName = member?.display_snapshot?.display_name?.trim();
  if (snapshotName) return snapshotName;
  const handle = member?.display_snapshot?.handle?.trim();
  if (handle) return `@${handle}`;
  if (member?.state === 'left' || member?.state === 'removed') return 'Former member';
  return 'Member';
}

export function groupAgentDisplayLabel(agent: GroupRoomAgent, owner?: GroupRoomMember | null): string {
  return `${agent.display_name} · ${groupMemberDisplayName(owner)}`;
}

export function canGroupMemberSeeMessage(member: GroupRoomMember | null | undefined, message: Pick<GroupMessage, 'created_at'>): boolean {
  if (!member || member.state !== 'active') return false;
  if (member.can_see_history_before_join) return true;
  return new Date(member.joined_at).getTime() <= new Date(message.created_at).getTime();
}

export function calculateRoomUnreadCount(
  member: GroupRoomMember | null | undefined,
  messages: GroupMessage[],
): number {
  if (!member || member.state !== 'active') return 0;
  const visible = messages.filter((message) => message.state === 'visible' && canGroupMemberSeeMessage(member, message));
  if (!member.last_read_message_id) return visible.length;
  const lastRead = visible.find((message) => message.id === member.last_read_message_id);
  const lastReadMs = lastRead ? new Date(lastRead.created_at).getTime() : 0;
  return visible.filter((message) => new Date(message.created_at).getTime() > lastReadMs).length;
}

export function isQueuedGroupAgentJob(job: GroupAgentJob): boolean {
  return job.status === 'queued';
}

export function shouldShowGroupJobUnderMessage(job: GroupAgentJob, messageId: string): boolean {
  return job.trigger_message_id === messageId && job.status !== 'complete';
}
import type { AttachmentDescriptor } from '@/types/attachments';

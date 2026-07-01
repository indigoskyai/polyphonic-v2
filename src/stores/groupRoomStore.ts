import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  calculateRoomUnreadCount,
  isQueuedGroupAgentJob,
  type GroupAgentJob,
  type GroupAttachment,
  type GroupMemoryCandidate,
  type GroupMessage,
  type GroupRoom,
  type GroupRoomAgent,
  type GroupRoomBundle,
  type GroupRoomMember,
} from '@/lib/groupRooms';

type Db = typeof supabase & Record<string, any>;

interface GroupRoomState {
  rooms: GroupRoom[];
  membersByRoom: Record<string, GroupRoomMember[]>;
  agentsByRoom: Record<string, GroupRoomAgent[]>;
  messagesByRoom: Record<string, GroupMessage[]>;
  jobsByRoom: Record<string, GroupAgentJob[]>;
  memoryByRoom: Record<string, GroupMemoryCandidate[]>;
  loadingRooms: boolean;
  loadingRoomId: string | null;
  creatingRoom: boolean;
  error: string | null;
  inviteUrl: string | null;
  loadRooms: (userId: string) => Promise<void>;
  loadRoom: (roomId: string) => Promise<GroupRoomBundle>;
  subscribeRoom: (roomId: string) => () => void;
  createRoom: (title: string) => Promise<GroupRoom | null>;
  inviteRoom: (roomId: string, inviteeHandle?: string) => Promise<string | null>;
  acceptInvite: (token: string) => Promise<string | null>;
  addAgent: (roomId: string, agentId: string, mentionPolicy: GroupRoomAgent['mention_policy']) => Promise<void>;
  removeAgent: (roomId: string, agentId: string, ownerUserId: string) => Promise<void>;
  sendMessage: (roomId: string, content: string, files?: File[]) => Promise<GroupMessage | null>;
  requestAgent: (job: GroupAgentJob) => Promise<void>;
  deleteMessage: (roomId: string, messageId: string) => Promise<void>;
  updateMember: (roomId: string, action: string, input?: Record<string, unknown>) => Promise<void>;
  createMemoryCandidate: (roomId: string, messageId: string, content: string, visibility: 'private' | 'room') => Promise<void>;
  reviewMemoryCandidate: (roomId: string, candidateId: string, action: 'approve' | 'reject') => Promise<void>;
  roomUnreadCount: (roomId: string, userId: string) => number;
  clearError: () => void;
}

const db = supabase as Db;

function setError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Something went wrong');
}

async function readInvokeError(error: unknown, fallback = 'Request failed'): Promise<string> {
  const base = setError(error) || fallback;
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const text = await context.clone().text();
      if (!text) return base;
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown; code?: unknown };
      const detail = typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.message === 'string'
          ? parsed.message
          : '';
      if (context.status === 404 && /function|not found/i.test(detail)) {
        return 'Group room backend is not deployed yet. The app can render Groups, but Supabase does not have the group-room edge functions.';
      }
      return detail || base;
    } catch {
      return base;
    }
  }
  return base;
}

function sortRooms(rooms: GroupRoom[]): GroupRoom[] {
  return [...rooms].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

function sortMessages(messages: GroupMessage[]): GroupMessage[] {
  const byId = new Map<string, GroupMessage>();
  for (const message of messages) byId.set(message.id, normalizeMessage(message));
  return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function sortJobs(jobs: GroupAgentJob[]): GroupAgentJob[] {
  const byId = new Map<string, GroupAgentJob>();
  for (const job of jobs) byId.set(job.id, job);
  return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function normalizeMessage(message: GroupMessage): GroupMessage {
  return {
    ...message,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    metadata: message.metadata ?? {},
  };
}

function safeFileName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'attachment';
}

async function uploadGroupAttachments(roomId: string, files: File[] = []): Promise<GroupAttachment[]> {
  const uploads: GroupAttachment[] = [];
  for (const file of files.slice(0, 8)) {
    const path = `${roomId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from('group-attachments')
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw error;
    uploads.push({
      bucket: 'group-attachments',
      path,
      name: file.name,
      size: file.size,
      content_type: file.type || null,
    });
  }
  return uploads;
}

async function signMessageAttachments(messages: GroupMessage[]): Promise<GroupMessage[]> {
  const signed = await Promise.all(messages.map(async (message) => {
    if (!Array.isArray(message.attachments) || message.attachments.length === 0) return normalizeMessage(message);
    const attachments = await Promise.all(message.attachments.map(async (attachment) => {
      if (!attachment?.path) return attachment;
      const { data } = await supabase.storage
        .from('group-attachments')
        .createSignedUrl(attachment.path, 60 * 60);
      return { ...attachment, signedUrl: data?.signedUrl ?? null };
    }));
    return normalizeMessage({ ...message, attachments });
  }));
  return signed;
}

function upsertById<T extends { id: string }>(items: T[], row: T): T[] {
  const found = items.some((item) => item.id === row.id);
  return found ? items.map((item) => (item.id === row.id ? row : item)) : [...items, row];
}

export const useGroupRoomStore = create<GroupRoomState>((set, get) => ({
  rooms: [],
  membersByRoom: {},
  agentsByRoom: {},
  messagesByRoom: {},
  jobsByRoom: {},
  memoryByRoom: {},
  loadingRooms: false,
  loadingRoomId: null,
  creatingRoom: false,
  error: null,
  inviteUrl: null,

  loadRooms: async (userId) => {
    set({ loadingRooms: true, error: null });
    try {
      const { data: memberships, error: memberError } = await db
        .from('group_room_members')
        .select('*')
        .eq('user_id', userId)
        .eq('state', 'active')
        .order('updated_at', { ascending: false });
      if (memberError) throw memberError;
      const roomIds = [...new Set(((memberships ?? []) as GroupRoomMember[]).map((member) => member.room_id))];
      if (!roomIds.length) {
        set({ rooms: [], loadingRooms: false });
        return;
      }

      const [{ data: rooms, error: roomsError }, { data: messages, error: messagesError }] = await Promise.all([
        db.from('group_rooms').select('*').in('id', roomIds).order('updated_at', { ascending: false }),
        db.from('group_messages').select('*').in('room_id', roomIds).order('created_at', { ascending: false }).limit(250),
      ]);
      if (roomsError) throw roomsError;
      if (messagesError) throw messagesError;

      const messagesByRoom: Record<string, GroupMessage[]> = {};
      for (const message of ((messages ?? []) as GroupMessage[])) {
        messagesByRoom[message.room_id] = sortMessages([...(messagesByRoom[message.room_id] ?? []), message]);
      }
      const membersByRoom = { ...get().membersByRoom };
      for (const member of (memberships ?? []) as GroupRoomMember[]) {
        membersByRoom[member.room_id] = upsertById(membersByRoom[member.room_id] ?? [], member);
      }

      set({
        rooms: sortRooms((rooms ?? []) as GroupRoom[]),
        membersByRoom,
        messagesByRoom: { ...get().messagesByRoom, ...messagesByRoom },
        loadingRooms: false,
      });
    } catch (error) {
      set({ error: setError(error), loadingRooms: false });
    }
  },

  loadRoom: async (roomId) => {
    set({ loadingRoomId: roomId, error: null });
    try {
      const [roomRes, membersRes, agentsRes, messagesRes, jobsRes, memoryRes] = await Promise.all([
        db.from('group_rooms').select('*').eq('id', roomId).maybeSingle(),
        db.from('group_room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: true }),
        db.from('group_room_agents').select('*').eq('room_id', roomId).order('added_at', { ascending: true }),
        db.from('group_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(400),
        db.from('group_agent_jobs').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200),
        db.from('group_memory_candidates').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100),
      ]);
      for (const result of [roomRes, membersRes, agentsRes, messagesRes, jobsRes, memoryRes]) {
        if (result.error) throw result.error;
      }
      const messages = await signMessageAttachments(((messagesRes.data ?? []) as GroupMessage[]).map(normalizeMessage));
      const bundle: GroupRoomBundle = {
        room: (roomRes.data ?? null) as GroupRoom | null,
        members: (membersRes.data ?? []) as GroupRoomMember[],
        agents: (agentsRes.data ?? []) as GroupRoomAgent[],
        messages,
        jobs: sortJobs((jobsRes.data ?? []) as GroupAgentJob[]),
        memoryCandidates: (memoryRes.data ?? []) as GroupMemoryCandidate[],
      };
      set((state) => ({
        rooms: bundle.room ? sortRooms(upsertById(state.rooms, bundle.room)) : state.rooms,
        membersByRoom: { ...state.membersByRoom, [roomId]: bundle.members },
        agentsByRoom: { ...state.agentsByRoom, [roomId]: bundle.agents },
        messagesByRoom: { ...state.messagesByRoom, [roomId]: bundle.messages },
        jobsByRoom: { ...state.jobsByRoom, [roomId]: bundle.jobs },
        memoryByRoom: { ...state.memoryByRoom, [roomId]: bundle.memoryCandidates },
        loadingRoomId: null,
      }));
      return bundle;
    } catch (error) {
      set({ error: setError(error), loadingRoomId: null });
      return { room: null, members: [], agents: [], messages: [], jobs: [], memoryCandidates: [] };
    }
  },

  subscribeRoom: (roomId) => {
    const channel = supabase
      .channel(`group-room:${roomId}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
        if (payload.eventType === 'DELETE') return;
        const [message] = await signMessageAttachments([payload.new as GroupMessage]);
        set((state) => ({
          messagesByRoom: {
            ...state.messagesByRoom,
            [roomId]: sortMessages(upsertById(state.messagesByRoom[roomId] ?? [], message)),
          },
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_room_members', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const member = payload.new as GroupRoomMember;
        set((state) => ({
          membersByRoom: {
            ...state.membersByRoom,
            [roomId]: upsertById(state.membersByRoom[roomId] ?? [], member),
          },
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_room_agents', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const agent = payload.new as GroupRoomAgent;
        set((state) => ({
          agentsByRoom: {
            ...state.agentsByRoom,
            [roomId]: upsertById(state.agentsByRoom[roomId] ?? [], agent),
          },
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_agent_jobs', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const job = payload.new as GroupAgentJob;
        set((state) => ({
          jobsByRoom: {
            ...state.jobsByRoom,
            [roomId]: sortJobs(upsertById(state.jobsByRoom[roomId] ?? [], job)),
          },
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_memory_candidates', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const candidate = payload.new as GroupMemoryCandidate;
        set((state) => ({
          memoryByRoom: {
            ...state.memoryByRoom,
            [roomId]: upsertById(state.memoryByRoom[roomId] ?? [], candidate),
          },
        }));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  createRoom: async (title) => {
    set({ creatingRoom: true, error: null });
    const { data, error } = await supabase.functions.invoke('group-room-create', { body: { title } });
    if (error) {
      set({ error: await readInvokeError(error, 'Could not create room.'), creatingRoom: false });
      return null;
    }
    const room = data?.room as GroupRoom | undefined;
    if (room) set((state) => ({ rooms: sortRooms(upsertById(state.rooms, room)), creatingRoom: false }));
    else set({ creatingRoom: false });
    return room ?? null;
  },

  inviteRoom: async (roomId, inviteeHandle) => {
    const { data, error } = await supabase.functions.invoke('group-room-invite', {
      body: { room_id: roomId, invitee_handle: inviteeHandle || undefined },
    });
    if (error) {
      set({ error: await readInvokeError(error, 'Could not create invite.') });
      return null;
    }
    const url = typeof data?.invite_url === 'string' ? data.invite_url : null;
    set({ inviteUrl: url });
    return url;
  },

  acceptInvite: async (token) => {
    const { data, error } = await supabase.functions.invoke('group-room-accept-invite', { body: { token } });
    if (error) {
      set({ error: await readInvokeError(error, 'Could not accept invite.') });
      return null;
    }
    return typeof data?.room_id === 'string' ? data.room_id : null;
  },

  addAgent: async (roomId, agentId, mentionPolicy) => {
    const { error } = await supabase.functions.invoke('group-room-agent-save', {
      body: { room_id: roomId, agent_id: agentId, mention_policy: mentionPolicy },
    });
    if (error) set({ error: await readInvokeError(error, 'Could not add agent.') });
  },

  removeAgent: async (roomId, agentId, ownerUserId) => {
    const { error } = await supabase.functions.invoke('group-room-agent-save', {
      body: { room_id: roomId, agent_id: agentId, owner_user_id: ownerUserId, action: 'remove' },
    });
    if (error) set({ error: await readInvokeError(error, 'Could not remove agent.') });
  },

  sendMessage: async (roomId, content, files = []) => {
    try {
      const attachments = await uploadGroupAttachments(roomId, files);
      const clientMessageId = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke('group-message-send', {
        body: { room_id: roomId, content, attachments, client_message_id: clientMessageId },
      });
      if (error) throw new Error(await readInvokeError(error, 'Could not send message.'));
      const message = data?.message as GroupMessage | undefined;
      const jobs = (data?.jobs ?? []) as GroupAgentJob[];
      if (message) {
        const [signed] = await signMessageAttachments([message]);
        set((state) => ({
          messagesByRoom: {
            ...state.messagesByRoom,
            [roomId]: sortMessages(upsertById(state.messagesByRoom[roomId] ?? [], signed)),
          },
          jobsByRoom: {
            ...state.jobsByRoom,
            [roomId]: sortJobs([...(state.jobsByRoom[roomId] ?? []), ...jobs]),
          },
        }));
      }
      for (const job of jobs.filter(isQueuedGroupAgentJob)) {
        void get().requestAgent(job);
      }
      return message ?? null;
    } catch (error) {
      set({ error: setError(error) });
      return null;
    }
  },

  requestAgent: async (job) => {
    const { error } = await supabase.functions.invoke('group-agent-request', {
      body: {
        room_id: job.room_id,
        agent_owner_user_id: job.agent_owner_user_id,
        agent_id: job.agent_id,
        trigger_message_id: job.trigger_message_id,
        client_request_id: job.id,
      },
    });
    if (error) set({ error: await readInvokeError(error, 'Agent request failed.') });
  },

  deleteMessage: async (roomId, messageId) => {
    const { error } = await supabase.functions.invoke('group-message-delete', {
      body: { room_id: roomId, message_id: messageId },
    });
    if (error) set({ error: await readInvokeError(error, 'Could not delete message.') });
  },

  updateMember: async (roomId, action, input = {}) => {
    const { error } = await supabase.functions.invoke('group-room-member-update', {
      body: { room_id: roomId, action, ...input },
    });
    if (error) set({ error: await readInvokeError(error, 'Could not update room membership.') });
  },

  createMemoryCandidate: async (roomId, messageId, content, visibility) => {
    const { error } = await supabase.functions.invoke('group-memory-action', {
      body: { room_id: roomId, action: 'create', source_message_id: messageId, content, visibility },
    });
    if (error) set({ error: await readInvokeError(error, 'Could not create memory candidate.') });
  },

  reviewMemoryCandidate: async (roomId, candidateId, action) => {
    const { error } = await supabase.functions.invoke('group-memory-action', {
      body: { room_id: roomId, action, candidate_id: candidateId },
    });
    if (error) set({ error: await readInvokeError(error, 'Could not review memory candidate.') });
  },

  roomUnreadCount: (roomId, userId) => {
    const member = get().membersByRoom[roomId]?.find((item) => item.user_id === userId);
    return calculateRoomUnreadCount(member, get().messagesByRoom[roomId] ?? []);
  },
  clearError: () => set({ error: null }),
}));

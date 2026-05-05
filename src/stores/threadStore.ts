import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface Thread {
  id: string;
  user_id: string;
  title: string | null;
  pinned: boolean;
  heat: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'code';
  url: string;
  meta?: Record<string, unknown>;
}

export interface Message {
  id: string;
  thread_id: string;
  user_id: string;
  role: string;
  content: string;
  model: string | null;
  agent: string | null;
  thinking_content: string | null;
  tokens_used: number | null;
  bookmarked: boolean;
  created_at: string;
  kind?: 'permission_request' | 'agent_error' | 'text' | 'scheduled_task' | 'scheduled_task_result' | 'subagent_report' | null;
  metadata?: Record<string, unknown> | null;
  attachments?: MessageAttachment[] | null;
}

interface ThreadState {
  threads: Thread[];
  currentThreadId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  loadThreads: () => Promise<void>;
  setCurrentThread: (id: string | null) => void;
  loadMessages: (threadId: string) => Promise<void>;
  subscribeMessages: (threadId: string) => () => void;
  createThread: (userId: string, agentId?: string) => Promise<string>;
  addMessage: (msg: Omit<Message, 'id' | 'created_at'>) => void;
  setStreaming: (s: boolean) => void;
  setStreamingContent: (c: string) => void;
  setStreamingThinking: (t: string) => void;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  updateThreadPinned: (threadId: string, pinned: boolean) => Promise<void>;
  updateThreadAgent: (threadId: string, agentId: string) => Promise<void>;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threads: [],
  currentThreadId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',

  loadThreads: async () => {
    const { data } = await supabase
      .from('threads')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) set({ threads: data as Thread[] });
  },

  setCurrentThread: (id) => set({ currentThreadId: id }),

  loadMessages: async (threadId) => {
    // Exclude guardian/observer messages — they live in the composer alcove,
    // not the main thread.
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .or('agent.is.null,and(agent.neq.guardian,agent.neq.observer)')
      .order('created_at', { ascending: true });
    if (data) set({ messages: data as Message[] });
  },

  // Realtime subscribe for inserts on the current thread. Catches messages
  // produced by background processes (subagent reports, scheduled-task
  // results, future tool-led inserts) without forcing a thread reload.
  //
  // Two de-dupe paths:
  //   1. Same-id row already in state → drop (re-emit safety).
  //   2. A local optimistic stub (added by ChatView's addMessage when a
  //      stream finishes) with the same role + agent + content that
  //      landed within the last 30 seconds → replace it with the canonical
  //      DB row, so future updates can target by real UUID and we don't
  //      render the same message twice.
  subscribeMessages: (threadId) => {
    const norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
    const channel = supabase
      .channel(`thread-messages-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as Message;
          if (!row?.id) return;
          if (row.agent === 'guardian' || row.agent === 'observer') return;
          const existing = get().messages;
          if (existing.some((m) => m.id === row.id)) return;

          const rowTime = new Date(row.created_at).getTime();
          // Match an optimistic stub by role/agent + recency. We deliberately
          // do NOT compare content strictly: the chairman may emit a revised
          // body after the stub was queued, so the canonical row's content
          // can differ slightly. Recency + role + agent is enough to dedupe.
          const stubIndex = existing.findIndex((m) => {
            if (m.id === row.id) return false;
            if (m.role !== row.role) return false;
            if ((m.agent ?? null) !== (row.agent ?? null)) return false;
            // Stub IDs are crypto.randomUUID — DB IDs are also UUIDs, but
            // stubs never collide with row.id (checked above). Treat any
            // assistant stub for this agent in the last 60s as the same reply.
            const stubTime = new Date(m.created_at).getTime();
            if (Math.abs(rowTime - stubTime) > 60_000) return false;
            // Either content matches loosely OR this is the only recent stub
            // for this role+agent (covers the revised-content race).
            if (norm(m.content) === norm(row.content)) return true;
            return m.role === 'assistant';
          });

          if (stubIndex >= 0) {
            const next = existing.slice();
            next[stubIndex] = row;
            set({ messages: next });
            return;
          }

          set({ messages: [...existing, row] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  createThread: async (userId, agentId = 'luca') => {
    const { data } = await supabase
      .from('threads')
      .insert({ user_id: userId, agent_id: agentId })
      .select()
      .single();
    if (data) {
      const thread = data as Thread;
      set((s) => ({ threads: [thread, ...s.threads], currentThreadId: thread.id, messages: [] }));
      return thread.id;
    }
    throw new Error('Failed to create thread');
  },

  addMessage: (msg) => {
    const now = Date.now();
    const existing = get().messages;
    const norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
    const incomingNorm = norm(msg.content);

    // If realtime already delivered the canonical row for this same reply,
    // skip the local stub. We accept either a normalized content match OR
    // any recent assistant row for the same agent (handles revised-content
    // race where the persisted content differs from the buffered stream).
    const realtimeAlreadyHere = existing.some((m) => {
      if (m.role !== msg.role) return false;
      if ((m.agent ?? null) !== (msg.agent ?? null)) return false;
      const mTime = new Date(m.created_at).getTime();
      if (Math.abs(now - mTime) > 60_000) return false;
      if (norm(m.content) === incomingNorm) return true;
      return msg.role === 'assistant';
    });
    if (realtimeAlreadyHere) return;

    const message: Message = {
      ...msg,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    set({ messages: [...existing, message] });
  },

  setStreaming: (s) => set({ isStreaming: s }),
  setStreamingContent: (c) => set({ streamingContent: c }),
  setStreamingThinking: (t) => set({ streamingThinking: t }),

  updateThreadTitle: async (threadId, title) => {
    await supabase.from('threads').update({ title }).eq('id', threadId);
    set((s) => ({
      threads: s.threads.map((t) => (t.id === threadId ? { ...t, title } : t)),
    }));
  },

  updateThreadPinned: async (threadId, pinned) => {
    await supabase.from('threads').update({ pinned }).eq('id', threadId);
    set((s) => ({
      threads: s.threads.map((t) => (t.id === threadId ? { ...t, pinned } : t)),
    }));
  },

  updateThreadAgent: async (threadId, agentId) => {
    await supabase.from('threads').update({ agent_id: agentId }).eq('id', threadId);
    set((s) => ({
      threads: s.threads.map((t) => (t.id === threadId ? { ...t, agent_id: agentId } : t)),
    }));
  },
}));

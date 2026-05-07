import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface Thread {
  id: string;
  user_id: string;
  title: string | null;
  pinned: boolean;
  starred: boolean;
  archived: boolean;
  heat: string;
  agent_id: string;
  project_id: string | null;
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
  createThread: (userId: string, agentId?: string, projectId?: string | null) => Promise<string>;
  addMessage: (msg: Omit<Message, 'id' | 'created_at'>) => void;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  setStreaming: (s: boolean) => void;
  setStreamingContent: (c: string) => void;
  setStreamingThinking: (t: string) => void;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  updateThreadPinned: (threadId: string, pinned: boolean) => Promise<void>;
  updateThreadAgent: (threadId: string, agentId: string) => Promise<void>;
  updateThreadProject: (threadId: string, projectId: string | null) => Promise<void>;
}

const normContent = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
const CONTENT_DEDUPE_WINDOW_MS = 30_000;
const STREAM_STUB_DEDUPE_WINDOW_MS = 60_000;

const isLocalStreamStub = (message: Pick<Message, 'metadata'>) =>
  message.metadata?.local_stream_stub === true;

export const dedupeThreadsById = (threads: Thread[]): Thread[] => {
  const seen = new Set<string>();
  return threads.filter((thread) => {
    if (!thread?.id || seen.has(thread.id)) return false;
    seen.add(thread.id);
    return true;
  });
};

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
    if (data) set({ threads: dedupeThreadsById(data as Thread[]) });
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
  //   2. A local optimistic stream stub with the same role + agent + content
  //      in the recent window → replace it with the canonical DB row. For
  //      stream stubs only, content may differ because Council critique can
  //      revise the persisted body after the client buffered the first body.
  subscribeMessages: (threadId) => {
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
          // Match only local optimistic stubs by role/agent + recency. We
          // deliberately allow content drift for those stubs: the chairman may
          // emit a revised body after the first body was queued, so the DB row
          // can differ. Non-stub messages still require a content match.
          const stubIndex = existing.findIndex((m) => {
            if (m.id === row.id) return false;
            if (m.role !== row.role) return false;
            if ((m.agent ?? null) !== (row.agent ?? null)) return false;
            const stubTime = new Date(m.created_at).getTime();
            const age = Math.abs(rowTime - stubTime);
            if (normContent(m.content) === normContent(row.content)) {
              return age <= CONTENT_DEDUPE_WINDOW_MS;
            }
            return m.role === 'assistant' && isLocalStreamStub(m) && age <= STREAM_STUB_DEDUPE_WINDOW_MS;
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

  createThread: async (userId, agentId = 'luca', projectId = null) => {
    const insertPayload: { user_id: string; agent_id: string; project_id?: string } = {
      user_id: userId,
      agent_id: agentId,
    };
    if (projectId) {
      insertPayload.project_id = projectId;
    }

    const { data } = await supabase
      .from('threads')
      .insert(insertPayload)
      .select()
      .single();
    if (data) {
      const thread = data as Thread;
      set((s) => ({
        threads: dedupeThreadsById([thread, ...s.threads]),
        currentThreadId: thread.id,
        messages: [],
      }));
      return thread.id;
    }
    throw new Error('Failed to create thread');
  },

  addMessage: (msg) => {
    const now = Date.now();
    const existing = get().messages;
    const incomingNorm = normContent(msg.content);

    // If realtime already delivered the canonical row for this same reply,
    // skip the local stub. Normal messages require a normalized content match;
    // local stream stubs may use role/agent/recency only because persisted
    // Council content can be revised after the buffered stream completes.
    const realtimeAlreadyHere = existing.some((m) => {
      if (m.role !== msg.role) return false;
      if ((m.agent ?? null) !== (msg.agent ?? null)) return false;
      const mTime = new Date(m.created_at).getTime();
      const age = Math.abs(now - mTime);
      if (normContent(m.content) === incomingNorm) {
        return age <= CONTENT_DEDUPE_WINDOW_MS;
      }
      return msg.role === 'assistant' && isLocalStreamStub(msg) && age <= STREAM_STUB_DEDUPE_WINDOW_MS;
    });
    if (realtimeAlreadyHere) return;

    const message: Message = {
      ...msg,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    set({ messages: [...existing, message] });
  },

  patchMessage: (id, patch) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
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

  updateThreadProject: async (threadId, projectId) => {
    await supabase.from('threads').update({ project_id: projectId }).eq('id', threadId);
    set((s) => ({
      threads: s.threads.map((t) => (t.id === threadId ? { ...t, project_id: projectId } : t)),
    }));
  },
}));

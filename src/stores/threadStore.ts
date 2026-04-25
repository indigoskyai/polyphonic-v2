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
  kind?: 'permission_request' | 'agent_error' | 'text' | null;
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
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (data) set({ messages: data as Message[] });
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
    const message: Message = {
      ...msg,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, message] }));
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

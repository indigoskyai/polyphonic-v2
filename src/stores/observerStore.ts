import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface ObserverNote {
  id: string;
  user_id: string;
  thread_id: string;
  kind: 'note' | 'concern' | 'welfare' | 'pattern' | 'summary';
  content: string;
  salience: number;
  pinned: boolean;
  created_at: string;
}

export interface ObserverChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface ObserverState {
  notesByThread: Record<string, ObserverNote[]>;
  chatByThread: Record<string, ObserverChatMessage[]>;
  loadingThread: string | null;
  asking: boolean;
  loadThread: (userId: string, threadId: string) => Promise<void>;
  subscribeThread: (userId: string, threadId: string) => () => void;
  askObserver: (threadId: string, message: string) => Promise<{ ok: boolean; error?: string }>;
  togglePin: (noteId: string) => Promise<void>;
}

export const useObserverStore = create<ObserverState>((set, get) => ({
  notesByThread: {},
  chatByThread: {},
  loadingThread: null,
  asking: false,

  loadThread: async (userId, threadId) => {
    set({ loadingThread: threadId });
    const [notesRes, chatRes] = await Promise.allSettled([
      supabase.from('observer_notes').select('*')
        .eq('user_id', userId).eq('thread_id', threadId)
        .order('created_at', { ascending: false }),
      supabase.from('observer_chat_messages').select('*')
        .eq('user_id', userId).eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
    ]);
    const notes = notesRes.status === 'fulfilled' ? (notesRes.value.data || []) : [];
    const chat = chatRes.status === 'fulfilled' ? (chatRes.value.data || []) : [];
    set((s) => ({
      notesByThread: { ...s.notesByThread, [threadId]: notes as ObserverNote[] },
      chatByThread: { ...s.chatByThread, [threadId]: chat as ObserverChatMessage[] },
      loadingThread: null,
    }));
  },

  subscribeThread: (userId, threadId) => {
    const channel = supabase
      .channel(`observer-${threadId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'observer_notes', filter: `thread_id=eq.${threadId}`,
      }, () => { get().loadThread(userId, threadId); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'observer_chat_messages', filter: `thread_id=eq.${threadId}`,
      }, () => { get().loadThread(userId, threadId); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },

  askObserver: async (threadId, message) => {
    set({ asking: true });
    try {
      const { data, error } = await supabase.functions.invoke('observer-chat', {
        body: { thread_id: threadId, message },
      });
      if (error) return { ok: false, error: error.message };
      if (data?.error) return { ok: false, error: data.error };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
    } finally {
      set({ asking: false });
    }
  },

  togglePin: async (noteId) => {
    const { notesByThread } = get();
    let target: ObserverNote | undefined;
    for (const arr of Object.values(notesByThread)) {
      target = arr.find((n) => n.id === noteId);
      if (target) break;
    }
    if (!target) return;
    await supabase.from('observer_notes')
      .update({ pinned: !target.pinned })
      .eq('id', noteId);
  },
}));

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface ThoughtInitiation {
  id: string;
  user_id: string;
  message: string;
  status: string;
  trigger_reason: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  activity_type: string;
  title: string | null;
  summary: string | null;
  content: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

export type NotificationFilter = 'all' | 'unread' | 'agents' | 'permissions' | 'memory';

interface NotificationState {
  initiations: ThoughtInitiation[];
  activity: ActivityEntry[];
  readIds: Set<string>;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  load: (userId: string) => Promise<void>;
  subscribe: (userId: string) => () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  updateInitiationStatus: (id: string, status: 'delivered' | 'dismissed') => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  initiations: [],
  activity: [],
  readIds: new Set<string>(),
  filter: 'all',
  setFilter: (f) => set({ filter: f }),

  load: async (userId: string) => {
    const settled = await Promise.allSettled([
      supabase
        .from('thought_initiations')
        .select('id, user_id, message, status, trigger_reason, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('entity_activity_log')
        .select('id, activity_type, title, summary, content, source, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(60),
    ]);
    const initRes = settled[0].status === 'fulfilled' ? settled[0].value : { data: [] };
    const actRes = settled[1].status === 'fulfilled' ? settled[1].value : { data: [] };
    set({
      initiations: (initRes.data ?? []) as ThoughtInitiation[],
      activity: (actRes.data ?? []) as ActivityEntry[],
    });
  },

  subscribe: (userId: string) => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thought_initiations', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as ThoughtInitiation;
          if (payload.eventType === 'DELETE') {
            set((s) => ({ initiations: s.initiations.filter((i) => i.id !== (payload.old as ThoughtInitiation).id) }));
          } else if (payload.eventType === 'INSERT') {
            set((s) => ({ initiations: [row, ...s.initiations].slice(0, 50) }));
          } else if (payload.eventType === 'UPDATE') {
            set((s) => ({
              initiations: s.initiations.map((i) => (i.id === row.id ? row : i)),
            }));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'entity_activity_log', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as ActivityEntry;
          set((s) => ({ activity: [row, ...s.activity].slice(0, 60) }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  markRead: (id: string) =>
    set((s) => {
      if (s.readIds.has(id)) return {};
      const next = new Set(s.readIds);
      next.add(id);
      return { readIds: next };
    }),

  markAllRead: () => {
    const { initiations, activity } = get();
    const ids = new Set<string>();
    initiations.forEach((i) => ids.add(i.id));
    activity.forEach((a) => ids.add(a.id));
    set({ readIds: ids });
  },

  updateInitiationStatus: async (id, status) => {
    const { error } = await supabase
      .from('thought_initiations')
      .update({ status })
      .eq('id', id);
    if (!error) {
      set((s) => ({
        initiations: s.initiations.map((i) => (i.id === id ? { ...i, status } : i)),
      }));
    }
  },
}));

/** Count of pending (not delivered/dismissed) initiations — for Rail bell amber dot. */
export function selectPendingInitiationsCount(s: NotificationState): number {
  return s.initiations.filter((i) => i.status !== 'delivered' && i.status !== 'dismissed').length;
}

/** Unread count for header crumb. */
export function selectUnreadCount(s: NotificationState): number {
  const unreadInits = s.initiations.filter((i) => !s.readIds.has(i.id) && i.status !== 'delivered' && i.status !== 'dismissed').length;
  const unreadActivity = s.activity.filter((a) => !s.readIds.has(a.id)).length;
  return unreadInits + unreadActivity;
}

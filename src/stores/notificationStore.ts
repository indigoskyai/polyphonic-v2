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
  severity: 'info' | 'notable' | 'important';
  surface_to_user: boolean;
  created_at: string;
}

export type NotificationFilter = 'all' | 'unread' | 'agents' | 'permissions' | 'memory';

interface NotificationState {
  initiations: ThoughtInitiation[];
  activity: ActivityEntry[];
  /** Persisted server-side via profiles.last_seen_activity_at — drives unread. */
  lastSeenAt: string | null;
  /** Local fallback for items the user has explicitly clicked. */
  readIds: Set<string>;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  load: (userId: string) => Promise<void>;
  subscribe: (userId: string) => () => void;
  markRead: (id: string) => void;
  markAllSeen: () => Promise<void>;
  updateInitiationStatus: (id: string, status: 'delivered' | 'dismissed') => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  initiations: [],
  activity: [],
  lastSeenAt: null,
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
        .select('id, activity_type, title, summary, content, source, severity, surface_to_user, created_at')
        .eq('user_id', userId)
        .eq('surface_to_user', true)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('profiles')
        .select('last_seen_activity_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    const initRes = settled[0].status === 'fulfilled' ? settled[0].value : { data: [] };
    const actRes = settled[1].status === 'fulfilled' ? settled[1].value : { data: [] };
    const profRes = settled[2].status === 'fulfilled' ? settled[2].value : { data: null };
    set({
      initiations: (initRes.data ?? []) as ThoughtInitiation[],
      activity: (actRes.data ?? []) as ActivityEntry[],
      lastSeenAt: ((profRes as any)?.data?.last_seen_activity_at as string | null) ?? null,
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
          if (!row.surface_to_user) return;
          set((s) => ({ activity: [row, ...s.activity].slice(0, 80) }));
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

  markAllSeen: async () => {
    const nowIso = new Date().toISOString();
    set({ lastSeenAt: nowIso });
    const { error } = await supabase.rpc('mark_activity_seen');
    if (error) {
      // Fallback: update locally only.
      console.error('[notifications] mark_activity_seen failed', error);
    }
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

/** Unread count = items newer than last_seen_activity_at, plus pending initiations. */
export function selectUnreadCount(s: NotificationState): number {
  const seenMs = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
  const unreadActivity = s.activity.filter(
    (a) => new Date(a.created_at).getTime() > seenMs && !s.readIds.has(a.id),
  ).length;
  const unreadInits = s.initiations.filter(
    (i) =>
      i.status !== 'delivered' &&
      i.status !== 'dismissed' &&
      new Date(i.created_at).getTime() > seenMs,
  ).length;
  return unreadActivity + unreadInits;
}

/** Notable + important activity since last_seen_at — drives the welcome-back card. */
export function selectUnseenImportant(s: NotificationState): ActivityEntry[] {
  const seenMs = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
  return s.activity.filter(
    (a) =>
      (a.severity === 'notable' || a.severity === 'important') &&
      new Date(a.created_at).getTime() > seenMs,
  );
}

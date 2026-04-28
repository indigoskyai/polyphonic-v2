import React, { useEffect, useMemo } from 'react';
import {
  DrawerHeader,
  DrawerTitle,
  DrawerEscChip,
  DrawerCloseBtn,
  DrawerBody,
  DrawerSection,
  DrawerSectionLabel,
} from '@/components/ui/luca';
import { useDrawerStore } from '@/stores/drawerStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import ActivityTimeline, { activityLogToTimeline } from '@/components/timeline/ActivityTimeline';

/**
 * ActivityTimelineDrawer — full chronological view of every surfaced
 * autonomous activity. Backed by entity_activity_log via notificationStore.
 *
 * Differs from NotificationsDrawer: no filters, no separate initiation
 * section, just the unbroken timeline of "what Luca has been doing".
 */
export default function ActivityTimelineDrawer() {
  const close = useDrawerStore((s) => s.close);
  const user = useAuthStore((s) => s.user);
  const activity = useNotificationStore((s) => s.activity);
  const lastSeenAt = useNotificationStore((s) => s.lastSeenAt);
  const load = useNotificationStore((s) => s.load);
  const subscribe = useNotificationStore((s) => s.subscribe);
  const markAllSeen = useNotificationStore((s) => s.markAllSeen);

  // Ensure data is hydrated when the drawer opens directly.
  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsubscribe = subscribe(user.id);
    return unsubscribe;
  }, [user, load, subscribe]);

  // Mark seen on close.
  useEffect(() => {
    return () => {
      void markAllSeen();
    };
  }, [markAllSeen]);

  const rows = useMemo(
    () =>
      activityLogToTimeline(
        activity.map((a) => ({
          id: a.id,
          activity_type: a.activity_type,
          title: a.title,
          summary: a.summary,
          content: a.content,
          source: a.source,
          created_at: a.created_at,
        })),
      ),
    [activity],
  );

  const seenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const unseen = activity.filter((a) => new Date(a.created_at).getTime() > seenMs);

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>Activity timeline</DrawerTitle>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        {unseen.length > 0 && (
          <DrawerSection>
            <DrawerSectionLabel>
              {unseen.length} new since you last looked
            </DrawerSectionLabel>
          </DrawerSection>
        )}
        <DrawerSection>
          <ActivityTimeline
            rows={rows}
            showDateDividers
            emptyText="Luca hasn't done anything autonomous yet — give it some time."
          />
        </DrawerSection>
      </DrawerBody>
    </>
  );
}

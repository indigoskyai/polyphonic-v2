import React, { useEffect, useMemo, useRef } from 'react';
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
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { filterActivityForAgent, useNotificationStore } from '@/stores/notificationStore';
import ActivityTimeline, { activityLogToTimeline } from '@/components/timeline/ActivityTimeline';

function labelForAgent(agentId: string, agents: { id: string; name: string }[]): string {
  const fromStore = agents.find((agent) => agent.id === agentId)?.name;
  if (fromStore) return fromStore;
  if (agentId === 'guardian' || agentId === 'observer') return 'Observer';
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

/**
 * ActivityTimelineDrawer — full chronological view of every surfaced
 * autonomous activity. Backed by entity_activity_log via notificationStore.
 *
 * Differs from NotificationsDrawer: no filters, no separate initiation
 * section, just the unbroken timeline of what the active agent has been doing.
 */
export default function ActivityTimelineDrawer() {
  const close = useDrawerStore((s) => s.close);
  const user = useAuthStore((s) => s.user);
  const activity = useNotificationStore((s) => s.activity);
  const lastSeenAt = useNotificationStore((s) => s.lastSeenAt);
  const readIds = useNotificationStore((s) => s.readIds);
  const load = useNotificationStore((s) => s.load);
  const subscribe = useNotificationStore((s) => s.subscribe);
  const markRead = useNotificationStore((s) => s.markRead);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  const activeAgentName = useMemo(
    () => labelForAgent(activeAgentId, availableAgents),
    [activeAgentId, availableAgents],
  );

  const scopedActivity = useMemo(
    () => filterActivityForAgent(activity, activeAgentId),
    [activity, activeAgentId],
  );
  const scopedActivityRef = useRef(scopedActivity);

  // Ensure data is hydrated when the drawer opens directly.
  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsubscribe = subscribe(user.id);
    return unsubscribe;
  }, [user, load, subscribe]);

  useEffect(() => {
    scopedActivityRef.current = scopedActivity;
  }, [scopedActivity]);

  // Mark only the visible agent scope read on close. Global profile-level
  // last_seen_activity_at would clear other agents too.
  useEffect(() => {
    return () => {
      scopedActivityRef.current.forEach((entry) => markRead(entry.id));
    };
  }, [markRead]);

  const rows = useMemo(
    () =>
      activityLogToTimeline(
        scopedActivity.map((a) => ({
          id: a.id,
          activity_type: a.activity_type,
          title: a.title,
          summary: a.summary,
          content: a.content,
          source: a.source ?? activeAgentName,
          created_at: a.created_at,
        })),
      ),
    [scopedActivity, activeAgentName],
  );

  const seenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const unseen = scopedActivity.filter((a) => new Date(a.created_at).getTime() > seenMs && !readIds.has(a.id));

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{activeAgentName} activity timeline</DrawerTitle>
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
            emptyText={`${activeAgentName} hasn't done anything autonomous yet — give it some time.`}
          />
        </DrawerSection>
      </DrawerBody>
    </>
  );
}

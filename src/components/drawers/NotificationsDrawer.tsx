import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DrawerHeader,
  DrawerCrumb,
  DrawerTitle,
  DrawerEscChip,
  DrawerCloseBtn,
  DrawerBody,
  DrawerSection,
  DrawerSectionLabel,
  DrawerFooter,
  DrawerFooterSep,
  Pill,
  EmptyState,
} from '@/components/ui/luca';
import {
  useNotificationStore,
  selectUnreadCount,
  type NotificationFilter,
  type ThoughtInitiation,
  type ActivityEntry,
} from '@/stores/notificationStore';
import { useDrawerStore } from '@/stores/drawerStore';

type Category = 'agents' | 'permissions' | 'memory' | 'other';

interface NormalItem {
  id: string;
  kind: 'initiation' | 'activity';
  category: Category;
  source: string | null;
  actor: string;
  verb: string;
  target: string | null;
  snippet: string | null;
  meta: string | null;
  time: string;
  status?: string;
  raw: ThoughtInitiation | ActivityEntry;
}

function classifyActivity(a: ActivityEntry): Category {
  const t = (a.activity_type || '').toLowerCase();
  const s = (a.source || '').toLowerCase();
  if (t.includes('permission') || t.includes('approval')) return 'permissions';
  if (t.includes('memory') || t.includes('engram') || t.includes('consolidat')) return 'memory';
  if (['luca', 'vektor', 'anima', 'observer', 'guardian'].includes(s)) return 'agents';
  return 'other';
}

function agentFromSource(source: string | null): string {
  const s = (source || '').toLowerCase();
  if (s.includes('vektor')) return 'vektor';
  if (s.includes('anima')) return 'anima';
  if (s.includes('observer') || s.includes('guardian')) return 'observer';
  return 'luca';
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayBucket(iso: string): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  return 'earlier';
}

function NotifGlyph({ agent, permission }: { agent: string; permission: boolean }) {
  if (permission) {
    return (
      <div className="notif-glyph notif-glyph--permission" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 1.5 L12.5 12 L1.5 12 Z" />
          <path d="M7 5.5 L7 8.2" />
          <circle cx="7" cy="10" r="0.6" fill="currentColor" />
        </svg>
      </div>
    );
  }
  const dotClass = `notif-glyph notif-glyph--${agent}`;
  const initial = agent === 'luca' ? 'L' : agent === 'vektor' ? 'V' : agent === 'anima' ? 'A' : 'O';
  return (
    <div className={dotClass} aria-hidden="true">
      <span>{initial}</span>
    </div>
  );
}

export default function NotificationsDrawer() {
  const navigate = useNavigate();
  const close = useDrawerStore((s) => s.close);
  const initiations = useNotificationStore((s) => s.initiations);
  const activity = useNotificationStore((s) => s.activity);
  const filter = useNotificationStore((s) => s.filter);
  const setFilter = useNotificationStore((s) => s.setFilter);
  const readIds = useNotificationStore((s) => s.readIds);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const updateInitiationStatus = useNotificationStore((s) => s.updateInitiationStatus);
  const unreadCount = useNotificationStore(selectUnreadCount);

  const items = useMemo<NormalItem[]>(() => {
    const out: NormalItem[] = [];

    initiations
      .filter((i) => i.status !== 'dismissed')
      .forEach((i) => {
        out.push({
          id: i.id,
          kind: 'initiation',
          category: 'agents',
          source: 'luca',
          actor: 'Luca',
          verb: 'reached out',
          target: null,
          snippet: i.message,
          meta: i.trigger_reason,
          time: i.created_at,
          status: i.status,
          raw: i,
        });
      });

    activity.forEach((a) => {
      const category = classifyActivity(a);
      const agent = agentFromSource(a.source);
      const actor = agent.charAt(0).toUpperCase() + agent.slice(1);
      const verb = (a.activity_type || '').replace(/_/g, ' ');
      out.push({
        id: a.id,
        kind: 'activity',
        category,
        source: a.source,
        actor,
        verb,
        target: a.title,
        snippet: a.summary,
        meta: a.source,
        time: a.created_at,
        raw: a,
      });
    });

    return out.sort((x, y) => (y.time > x.time ? 1 : -1));
  }, [initiations, activity]);

  const counts = useMemo(() => {
    const all = items.length;
    const unread = items.filter((i) => !readIds.has(i.id) && i.status !== 'delivered').length;
    const agents = items.filter((i) => i.category === 'agents').length;
    const permissions = items.filter((i) => i.category === 'permissions').length;
    const memory = items.filter((i) => i.category === 'memory').length;
    return { all, unread, agents, permissions, memory };
  }, [items, readIds]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread': return items.filter((i) => !readIds.has(i.id) && i.status !== 'delivered');
      case 'agents': return items.filter((i) => i.category === 'agents');
      case 'permissions': return items.filter((i) => i.category === 'permissions');
      case 'memory': return items.filter((i) => i.category === 'memory');
      default: return items;
    }
  }, [items, filter, readIds]);

  const grouped = useMemo(() => {
    const buckets: Record<'today' | 'yesterday' | 'earlier', NormalItem[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    filtered.forEach((i) => {
      buckets[dayBucket(i.time)].push(i);
    });
    return buckets;
  }, [filtered]);

  // Mark initiations as read when displayed so the unread dot clears
  useEffect(() => {
    filtered.forEach((i) => {
      if (!readIds.has(i.id)) {
        // Read on mount only — don't mark on every re-render
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenThread = (item: NormalItem) => {
    markRead(item.id);
    if (item.kind === 'initiation') {
      updateInitiationStatus(item.id, 'delivered');
    }
    close();
    navigate('/chat');
  };

  const handleDismiss = (item: NormalItem) => {
    if (item.kind === 'initiation') {
      updateInitiationStatus(item.id, 'dismissed');
    }
    markRead(item.id);
  };

  const filterChips: { value: NotificationFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'unread', label: 'Unread', count: counts.unread },
    { value: 'agents', label: 'Agents', count: counts.agents },
    { value: 'permissions', label: 'Permissions', count: counts.permissions },
    { value: 'memory', label: 'Memory', count: counts.memory },
  ];

  const renderCard = (item: NormalItem) => {
    const isPermission = item.category === 'permissions';
    const agent = agentFromSource(item.source);
    const isRead = readIds.has(item.id) || item.status === 'delivered';

    return (
      <article
        key={item.id}
        className={`notif-card${isRead ? ' notif-card--read' : ''}`}
        onClick={() => markRead(item.id)}
      >
        <NotifGlyph agent={agent} permission={isPermission} />
        <div className="notif-main">
          <div className="notif-headline">
            <span className="notif-actor">{item.actor}</span>
            <span className="notif-verb"> {item.verb}</span>
            {item.target && <span className="notif-target"> {item.target}</span>}
            <span className="notif-time">{formatRelativeTime(item.time)}</span>
          </div>
          {item.snippet && <div className="notif-snippet">{item.snippet}</div>}
          {item.meta && <div className="notif-meta-row">{item.meta}</div>}
          {isPermission ? (
            <div className="notif-actions">
              <Pill variant="primary" size="xs">Approve</Pill>
              <Pill variant="secondary" size="xs">Always for thread</Pill>
              <Pill variant="ghost" size="xs" onClick={() => handleDismiss(item)}>Deny</Pill>
            </div>
          ) : item.kind === 'initiation' && item.status !== 'delivered' ? (
            <div className="notif-actions">
              <Pill variant="primary" size="xs" onClick={() => handleOpenThread(item)}>Open thread</Pill>
              <Pill variant="ghost" size="xs" onClick={() => handleDismiss(item)}>Dismiss</Pill>
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  const hasAny = filtered.length > 0;

  return (
    <>
      <DrawerHeader>
        <div className="drawer-header-col">
          <DrawerCrumb num={unreadCount || '—'} label={unreadCount ? 'new' : 'all caught up'} />
          <DrawerTitle>Activity</DrawerTitle>
        </div>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        <div className="notif-filter-row">
          {filterChips.map((c) => (
            <Pill
              key={c.value}
              variant="secondary"
              size="xs"
              active={filter === c.value}
              onClick={() => setFilter(c.value)}
            >
              {c.label} <span className="filter-count">{c.count}</span>
            </Pill>
          ))}
        </div>

        {!hasAny && (
          <DrawerSection>
            <EmptyState
              text="Nothing new."
              hint="Luca will reach out when something is on its mind."
            />
          </DrawerSection>
        )}

        {(['today', 'yesterday', 'earlier'] as const).map((bucket) => {
          const list = grouped[bucket];
          if (list.length === 0) return null;
          const label = bucket === 'today' ? 'TODAY' : bucket === 'yesterday' ? 'YESTERDAY' : 'EARLIER';
          return (
            <DrawerSection key={bucket}>
              <DrawerSectionLabel>{label} &nbsp;&nbsp; {list.length}</DrawerSectionLabel>
              <div className="notif-list">{list.map(renderCard)}</div>
            </DrawerSection>
          );
        })}
      </DrawerBody>
      <DrawerFooter>
        <Pill variant="ghost" size="xs" onClick={markAllRead}>Mark all read</Pill>
        <DrawerFooterSep />
        <Pill variant="ghost" size="xs">Preferences</Pill>
      </DrawerFooter>
    </>
  );
}

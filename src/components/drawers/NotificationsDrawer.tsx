import React, { useMemo, useEffect, useState } from 'react';
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
  filterActivityForAgent,
  filterInitiationsForAgent,
  normalizeNotificationAgentId,
  selectUnreadCountForAgent,
  type NotificationFilter,
  type ThoughtInitiation,
  type ActivityEntry,
} from '@/stores/notificationStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

type Category = 'agents' | 'permissions' | 'memory' | 'other';

interface NormalItem {
  id: string;
  kind: 'initiation' | 'activity';
  category: Category;
  source: string | null;
  agentId: string;
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
  const agentId = normalizeNotificationAgentId(a.agent_id);
  if (t.includes('permission') || t.includes('approval')) return 'permissions';
  if (t.includes('memory') || t.includes('engram') || t.includes('consolidat')) return 'memory';
  if (agentId !== 'luca' || ['luca', 'vektor', 'anima', 'observer', 'guardian'].includes(s)) return 'agents';
  return 'other';
}

function labelForAgent(agentId: string, names: Map<string, string>): string {
  const fromStore = names.get(agentId);
  if (fromStore) return fromStore;
  if (agentId === 'guardian' || agentId === 'observer') return 'Observer';
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

function glyphClassForAgent(agentId: string): string {
  if (agentId === 'vektor' || agentId === 'anima' || agentId === 'observer') return agentId;
  if (agentId === 'guardian') return 'observer';
  if (agentId === 'luca') return 'luca';
  return 'custom';
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

function extractRationale(item: NormalItem): string | null {
  if (item.kind === 'initiation') {
    const init = item.raw as ThoughtInitiation;
    return init.trigger_reason ? init.trigger_reason : null;
  }
  const activity = item.raw as ActivityEntry;
  const content = activity.content as Record<string, unknown> | null;
  if (!content) return null;
  const r = content.rationale;
  if (typeof r === 'string' && r.trim().length > 0) return r;
  return null;
}

function RationaleToggle({ rationale }: { rationale: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-mono)',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
        aria-expanded={open}
      >
        {open ? 'hide reason' : 'why am I seeing this?'}
      </button>
      {open && (
        <div
          style={{
            marginTop: 6,
            padding: '8px 10px',
            borderLeft: '1px solid var(--border-faint)',
            color: 'var(--text-body)',
            fontSize: 12,
            lineHeight: 1.55,
            background: 'var(--surface-raised)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {rationale}
        </div>
      )}
    </div>
  );
}

function NotifGlyph({ agent, label, permission }: { agent: string; label: string; permission: boolean }) {
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
  const dotClass = `notif-glyph notif-glyph--${glyphClassForAgent(agent)}`;
  const initial = label.trim().charAt(0).toUpperCase() || 'A';
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
  const updateInitiationStatus = useNotificationStore((s) => s.updateInitiationStatus);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  const unreadCount = useNotificationStore((s) => selectUnreadCountForAgent(s, activeAgentId));

  const agentNameById = useMemo(
    () => new Map(availableAgents.map((agent) => [agent.id, agent.name])),
    [availableAgents],
  );
  const activeAgentName = labelForAgent(activeAgentId, agentNameById);
  const scopedInitiations = useMemo(
    () => filterInitiationsForAgent(initiations, activeAgentId),
    [initiations, activeAgentId],
  );
  const scopedActivity = useMemo(
    () => filterActivityForAgent(activity, activeAgentId),
    [activity, activeAgentId],
  );

  const items = useMemo<NormalItem[]>(() => {
    const out: NormalItem[] = [];

    scopedInitiations
      .filter((i) => i.status !== 'dismissed')
      .forEach((i) => {
        const agentId = normalizeNotificationAgentId(i.agent_id);
        out.push({
          id: i.id,
          kind: 'initiation',
          category: 'agents',
          source: agentId,
          agentId,
          actor: labelForAgent(agentId, agentNameById),
          verb: 'reached out',
          target: null,
          snippet: i.message,
          meta: i.trigger_reason,
          time: i.created_at,
          status: i.status,
          raw: i,
        });
      });

    scopedActivity.forEach((a) => {
      const category = classifyActivity(a);
      const agentId = normalizeNotificationAgentId(a.agent_id);
      const actor = labelForAgent(agentId, agentNameById);
      const verb = (a.activity_type || '').replace(/_/g, ' ');
      out.push({
        id: a.id,
        kind: 'activity',
        category,
        source: a.source,
        agentId,
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
  }, [scopedInitiations, scopedActivity, agentNameById]);

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

  const handleOpenThread = (item: NormalItem) => {
    markRead(item.id);
    if (item.kind === 'initiation') {
      updateInitiationStatus(item.id, 'delivered');
    }
    close();
    if (item.kind === 'activity') {
      const content = (item.raw as ActivityEntry).content;
      const roomId = content && typeof content.room_id === 'string' ? content.room_id : null;
      if ((item.raw as ActivityEntry).source === 'group-room' && roomId) {
        navigate(`/groups/${roomId}`);
        return;
      }
    }
    navigate('/chat');
  };

  const handleDismiss = (item: NormalItem) => {
    if (item.kind === 'initiation') {
      updateInitiationStatus(item.id, 'dismissed');
    }
    markRead(item.id);
  };

  const handleMarkScopedRead = () => {
    items.forEach((item) => {
      markRead(item.id);
      if (item.kind === 'initiation' && item.status !== 'delivered') {
        void updateInitiationStatus(item.id, 'delivered');
      }
    });
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
    const isRead = readIds.has(item.id) || item.status === 'delivered';
    const rationale = extractRationale(item);

    return (
      <article
        key={item.id}
        className={`notif-card${isRead ? ' notif-card--read' : ''}`}
        onClick={() => markRead(item.id)}
      >
        <NotifGlyph agent={item.agentId} label={item.actor} permission={isPermission} />
        <div className="notif-main">
          <div className="notif-headline">
            <span className="notif-actor">{item.actor}</span>
            <span className="notif-verb"> {item.verb}</span>
            {item.target && <span className="notif-target"> {item.target}</span>}
            <span className="notif-time">{formatRelativeTime(item.time)}</span>
          </div>
          {item.snippet && <div className="notif-snippet">{item.snippet}</div>}
          {item.meta && <div className="notif-meta-row">{item.meta}</div>}
          {rationale && <RationaleToggle rationale={rationale} />}
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
          <DrawerCrumb num={unreadCount || '—'} label={unreadCount ? `new for ${activeAgentName}` : `${activeAgentName} caught up`} />
          <DrawerTitle>{activeAgentName} activity</DrawerTitle>
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
              hint={`${activeAgentName} will reach out when something is on its mind.`}
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
        <Pill variant="ghost" size="xs" onClick={handleMarkScopedRead}>Mark {activeAgentName} read</Pill>
        <DrawerFooterSep />
        <Pill
          variant="ghost"
          size="xs"
          onClick={() => useDrawerStore.getState().open('activity-timeline')}
        >
          Full timeline
        </Pill>
        <DrawerFooterSep />
        <Pill variant="ghost" size="xs">Preferences</Pill>
      </DrawerFooter>
    </>
  );
}

import React, { useMemo } from 'react';
import { EmptyState } from '@/components/ui/luca';
import { collectActivityThreadRefs } from '@/lib/threadActivity';

export type TimelineRowType = 'default' | 'checkpoint' | 'handoff' | 'tool' | 'file' | 'error';

export interface TimelineRow {
  id: string;
  timestamp: string;
  agent?: string;
  verb: string;
  target?: string;
  type?: TimelineRowType;
  description?: string;
  duration?: string;
}

interface ActivityTimelineProps {
  rows: TimelineRow[];
  showDateDividers?: boolean;
  emptyText?: string;
}

function formatTimeCompact(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'TODAY';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function Row({ row }: { row: TimelineRow }) {
  const isCheckpoint = row.type === 'checkpoint';
  return (
    <div className="timeline-row">
      <span className={`timeline-dot ${row.type ?? 'default'}`} aria-hidden="true" />
      <span className="timeline-time">{formatTimeCompact(row.timestamp)}</span>
      <span className="timeline-text">
        {isCheckpoint ? (
          <>
            <span className="checkpoint-label">{row.verb}</span>
            {row.description && <span className="checkpoint-desc">{row.description}</span>}
          </>
        ) : (
          <>
            {row.agent && <span className="agent">{row.agent}</span>}
            {row.agent && ' '}
            <span className={isCheckpoint ? 'emphasis' : undefined}>{row.verb}</span>
            {row.target && (
              <>
                {' '}
                <span className="file-ref">{row.target}</span>
              </>
            )}
            {row.description && !isCheckpoint && (
              <span className="checkpoint-desc">{row.description}</span>
            )}
          </>
        )}
      </span>
      <span className="timeline-meta">{row.duration ?? ''}</span>
    </div>
  );
}

export default function ActivityTimeline({ rows, showDateDividers, emptyText }: ActivityTimelineProps) {
  const grouped = useMemo(() => {
    if (!showDateDividers) return [{ key: '', label: '', rows }] as { key: string; label: string; rows: TimelineRow[] }[];
    const map = new Map<string, { label: string; rows: TimelineRow[] }>();
    rows.forEach((r) => {
      const k = dayKey(r.timestamp);
      if (!map.has(k)) map.set(k, { label: dayLabel(r.timestamp), rows: [] });
      map.get(k)!.rows.push(r);
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [rows, showDateDividers]);

  if (rows.length === 0) {
    return <EmptyState text={emptyText || 'No activity yet'} />;
  }

  return (
    <div className="timeline">
      {grouped.map((g) => (
        <React.Fragment key={g.key || 'all'}>
          {showDateDividers && g.label && (
            <div className="timeline-divider">
              <span className="timeline-divider-time">{g.label}</span>
              <span className="timeline-divider-line" aria-hidden="true" />
            </div>
          )}
          {g.rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ═══ Data source helper — maps entity_activity_log rows ═══ */

interface ActivityLogShape {
  id: string;
  activity_type: string;
  title: string | null;
  summary: string | null;
  content: Record<string, unknown> | null;
  source: string | null;
  created_at: string;
}

function typeForActivity(activityType: string): TimelineRowType {
  const t = (activityType || '').toLowerCase();
  if (t.includes('reflect') || t.includes('consolidat') || t.includes('checkpoint')) return 'checkpoint';
  if (t.includes('handoff')) return 'handoff';
  if (t.includes('tool') || t.includes('file_read') || t.includes('read_file')) return 'tool';
  if (t.includes('file')) return 'file';
  if (t.includes('error') || t.includes('failed')) return 'error';
  return 'default';
}

function extractTarget(r: ActivityLogShape): string | undefined {
  const c = r.content || {};
  if (typeof c.file === 'string') return c.file;
  if (typeof c.target === 'string') return c.target;
  if (typeof c.ref === 'string') return c.ref;
  const threadRef = collectActivityThreadRefs(c)[0];
  if (threadRef) return `thread:${threadRef.slice(0, 8)}`;
  return undefined;
}

function extractDuration(r: ActivityLogShape): string | undefined {
  const c = r.content || {};
  if (typeof c.duration_ms === 'number') {
    const ms = c.duration_ms;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 100) / 10}s`;
    return `${Math.round(ms / 6000) / 10}m`;
  }
  if (typeof c.duration === 'string') return c.duration;
  return undefined;
}

export function activityLogToTimeline(rows: ActivityLogShape[]): TimelineRow[] {
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.created_at,
    agent: r.source ?? undefined,
    verb: r.title || r.activity_type.replace(/_/g, ' '),
    target: extractTarget(r),
    type: typeForActivity(r.activity_type),
    description: r.summary ?? undefined,
    duration: extractDuration(r),
  }));
}

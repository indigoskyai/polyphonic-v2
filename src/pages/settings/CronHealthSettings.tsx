import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cron health surface — read-only view of public.cron_health.
 *
 * Shows one row per cron job: job name, last run, last success, error count,
 * latest duration, latest error. Auto-refreshes every 30s while mounted.
 *
 * Closes PRODUCTION_LAUNCH_CHECKLIST.md Operations#cron-health-surface
 * ("Cron health surface live and showing recent green ticks").
 */

interface CronHealthRow {
  job_name: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  run_count: number;
  error_count: number;
  updated_at: string;
}

const REFRESH_MS = 30_000;
const STALE_AFTER_MS = 4 * 60 * 60 * 1000; // 4h — flag a job as stale if it hasn't run

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  const delta = Date.now() - t;
  if (delta < 0) return 'in the future';
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function statusFor(row: CronHealthRow): 'green' | 'amber' | 'red' | 'idle' {
  if (!row.last_run_at) return 'idle';
  const lastRunAge = Date.now() - new Date(row.last_run_at).getTime();
  if (row.error_count > 0 && row.last_success_at) {
    const lastSuccessAge = Date.now() - new Date(row.last_success_at).getTime();
    // If the most recent run errored more recently than the last success, red.
    if (row.last_run_at > row.last_success_at && lastSuccessAge > STALE_AFTER_MS) return 'red';
    if (row.last_run_at > row.last_success_at) return 'amber';
  }
  if (row.error_count > 0 && !row.last_success_at) return 'red';
  if (lastRunAge > STALE_AFTER_MS) return 'amber';
  return 'green';
}

const STATUS_COLOR: Record<'green' | 'amber' | 'red' | 'idle', string> = {
  green: '#82b484',
  amber: '#c9a87c',
  red: '#e15873',
  idle: 'rgba(178, 176, 172, 0.4)',
};

export default function CronHealthSettings() {
  const [rows, setRows] = useState<CronHealthRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchRows = async (): Promise<void> => {
    const { data, error } = await supabase
      .from('cron_health')
      .select('*')
      .order('job_name', { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRows(data as CronHealthRow[]);
  };

  useEffect(() => {
    void fetchRows();
    const timer = window.setInterval(() => {
      void fetchRows();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    if (!rows) return null;
    return rows.reduce(
      (acc, r) => {
        acc[statusFor(r)] += 1;
        return acc;
      },
      { green: 0, amber: 0, red: 0, idle: 0 } as Record<'green' | 'amber' | 'red' | 'idle', number>,
    );
  }, [rows]);

  return (
    <div className="folio" style={{ maxWidth: 880, margin: '0 auto', padding: '22px 24px 64px' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          letterSpacing: 'var(--track-meta)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        § 09 / Operations
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: 'var(--track-tight)',
          color: 'var(--text-primary)',
          margin: '0 0 6px',
        }}
      >
        Cron health
      </h1>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          margin: '0 0 28px',
          maxWidth: 600,
        }}
      >
        Background loops powering memory consolidation, autonomous thought, and
        scheduled tasks. Refreshes every {Math.round(REFRESH_MS / 1000)}s.
      </p>

      {summary && (
        <div
          style={{
            display: 'flex',
            gap: 18,
            padding: '14px 18px',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-faint)',
            borderRadius: 12,
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.025)',
            marginBottom: 22,
          }}
        >
          {(['green', 'amber', 'red', 'idle'] as const).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUS_COLOR[k],
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 'var(--track-meta)',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                }}
              >
                {k}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {summary[k]}
              </span>
            </div>
          ))}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: 'rgba(225, 88, 115, 0.08)',
            border: '1px solid rgba(225, 88, 115, 0.32)',
            borderRadius: 12,
            color: 'var(--rose-accent)',
            fontSize: 13,
            marginBottom: 22,
          }}
        >
          Failed to load cron health: {loadError}
        </div>
      )}

      {!rows && !loadError && (
        <div style={{ color: 'var(--text-ghost)', fontSize: 13 }}>Loading…</div>
      )}

      {rows && rows.length === 0 && (
        <div
          style={{
            padding: '32px 18px',
            textAlign: 'center',
            color: 'var(--text-ghost)',
            fontSize: 13,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-faint)',
            borderRadius: 12,
          }}
        >
          No cron runs recorded yet. Background loops will appear here as they tick.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border-faint)',
            borderRadius: 12,
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.025)',
            overflow: 'hidden',
          }}
        >
          {rows.map((row, i) => {
            const status = statusFor(row);
            const open = expanded[row.job_name];
            return (
              <div
                key={row.job_name}
                style={{
                  padding: '14px 18px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-faint)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    aria-label={status}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: STATUS_COLOR[status],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.job_name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      letterSpacing: 'var(--track-meta)',
                      textTransform: 'uppercase',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {relativeTime(row.last_run_at)}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 18,
                    paddingLeft: 20,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>runs {row.run_count}</span>
                  <span style={{ color: row.error_count > 0 ? 'var(--rose-accent)' : 'inherit' }}>
                    errors {row.error_count}
                  </span>
                  {row.last_duration_ms != null && (
                    <span>last {row.last_duration_ms}ms</span>
                  )}
                  <span>success {relativeTime(row.last_success_at)}</span>
                </div>
                {row.last_error && (
                  <div style={{ paddingLeft: 20 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [row.job_name]: !e[row.job_name] }))
                      }
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-meta)',
                        textTransform: 'uppercase',
                        color: 'var(--rose-accent)',
                      }}
                    >
                      {open ? 'Hide last error' : 'Show last error'}
                    </button>
                    {open && (
                      <pre
                        style={{
                          marginTop: 8,
                          padding: 12,
                          background: 'var(--floor)',
                          border: '1px solid var(--border-faint)',
                          borderRadius: 8,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 200,
                          overflow: 'auto',
                        }}
                      >
                        {row.last_error}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

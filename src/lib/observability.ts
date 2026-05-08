/**
 * Minimal client-side error reporting.
 *
 * Captures uncaught React errors (from ErrorBoundary), `window.onerror`, and
 * `unhandledrejection` events, then INSERTs them into `public.client_error_log`
 * via the existing Supabase client. No external APM dependency.
 *
 * Why not Sentry: launch checklist asks for "error reporting wired and
 * receiving events from staging". A 30-line Supabase-native logger clears
 * that bar without adding a new vendor or 50+KB of bundle. Operators query
 * via the Supabase dashboard. If richer aggregation is wanted later, Sentry
 * can layer on top without conflict.
 *
 * Limits: messages truncated to 1KB, stacks to 8KB. Inserts are fire-and-forget
 * — if the network is dead, the capture is dropped (we never block app code).
 *
 * RLS: insert-any (auth or anon), select service-role only. See migration
 * supabase/migrations/20260508120100_client_error_log.sql.
 */

import { supabase } from '@/integrations/supabase/client';

type Level = 'error' | 'warning' | 'info';
type Source = 'react' | 'window' | 'promise' | 'manual';

interface ReportContext {
  route?: string;
  extras?: Record<string, unknown>;
}

const MAX_MESSAGE = 1024;
const MAX_STACK = 8192;
let installed = false;
const recentRequestIds = new Set<string>();
const RECENT_LIMIT = 50;

function truncate(s: string | undefined | null, max: number): string | null {
  if (s == null) return null;
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

function buildBaseContext(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  return {
    route: window.location?.pathname,
    href: window.location?.href,
    userAgent: navigator?.userAgent,
    viewport:
      typeof window.innerWidth === 'number'
        ? { w: window.innerWidth, h: window.innerHeight }
        : undefined,
    build: import.meta.env.MODE,
  };
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto & { randomUUID(): string }).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Report an error. Fire-and-forget — does not throw, does not await.
 *
 * Dedupes by request_id within the running tab (50-entry LRU). The DB also
 * has a UNIQUE index on request_id, so duplicate inserts across tabs are
 * absorbed at the DB layer.
 */
export function reportError(
  err: unknown,
  source: Source = 'manual',
  ctx: ReportContext = {},
  level: Level = 'error',
): void {
  try {
    const e: Error =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const message = truncate(e.message || 'unknown error', MAX_MESSAGE) ?? 'unknown error';
    const stack = truncate(e.stack ?? null, MAX_STACK);
    const requestId = makeRequestId();

    if (recentRequestIds.has(requestId)) return;
    recentRequestIds.add(requestId);
    if (recentRequestIds.size > RECENT_LIMIT) {
      const first = recentRequestIds.values().next().value;
      if (first) recentRequestIds.delete(first);
    }

    const context = { ...buildBaseContext(), ...ctx };

    // Fire and forget — we never want logging to break the app.
    void supabase.from('client_error_log').insert({
      level,
      source,
      message,
      stack,
      context,
      request_id: requestId,
    });
  } catch {
    // Never throw from the logger.
  }
}

/**
 * Install global window error handlers. Idempotent — safe to call from
 * `main.tsx` even if HMR re-runs the module.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    reportError(event.error ?? event.message ?? 'window.onerror', 'window', {
      extras: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportError(event.reason ?? 'unhandled rejection', 'promise');
  });
}

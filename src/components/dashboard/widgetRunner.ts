// Executes a WidgetSpec against Supabase, returns shaped data for the renderer.
// Pure client-side; uses the user-scoped supabase client (RLS enforces user_id).

import { supabase } from '@/integrations/supabase/client';
import type { WidgetSpec } from './dashboardStore';

export interface WidgetData {
  rows: any[];
  // Optional shaped views the renderers may use:
  metric?: { value: number | string; sparkline?: number[] };
  buckets?: { key: string; count: number; value?: number }[];
  heatmap?: { x: string; y: string; v: number }[];
}

const ALLOWED_TABLES = new Set([
  'engrams', 'beliefs', 'mnemos_emotional_state', 'thought_stream',
  'messages', 'curiosity_questions', 'connections', 'memories',
]);

function safeColumns(spec: WidgetSpec): string {
  const sel = spec.query.select;
  if (!Array.isArray(sel) || sel.length === 0) return '*';
  // Whitelist: only allow plain identifiers
  const ok = sel.filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
  return ok.length ? ok.join(',') : '*';
}

export async function runWidgetQuery(spec: WidgetSpec): Promise<WidgetData> {
  const q = spec.query;
  if (!ALLOWED_TABLES.has(q.table)) throw new Error(`Table not allowed: ${q.table}`);

  let query = (supabase.from as any)(q.table).select(safeColumns(spec));

  if (q.time_column && q.time_range_days && q.time_range_days > 0) {
    const since = new Date(Date.now() - q.time_range_days * 86400000).toISOString();
    query = query.gte(q.time_column, since);
  }

  if (q.order_by) {
    const [col, dir] = q.order_by.split(/\s+/);
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      query = query.order(col, { ascending: (dir ?? 'desc').toLowerCase() === 'asc' });
    }
  } else if (q.time_column) {
    query = query.order(q.time_column, { ascending: false });
  }

  const limit = Math.min(500, q.limit ?? 200);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows: any[] = data ?? [];

  // Tag filter (client-side post-process)
  if (q.tag_filter && q.tag_filter.length) {
    const set = new Set(q.tag_filter.map((t) => t.toLowerCase()));
    rows = rows.filter((r: any) => Array.isArray(r.tags) && r.tags.some((t: string) => set.has(String(t).toLowerCase())));
  }

  const out: WidgetData = { rows };

  // Aggregation for metric kind
  if (spec.kind === 'metric') {
    const agg = q.aggregate ?? 'count';
    const col = q.aggregate_column;
    let value: number = 0;
    if (agg === 'count' || !col) value = rows.length;
    else {
      const nums = rows.map((r) => Number(r[col])).filter((n) => Number.isFinite(n));
      if (!nums.length) value = 0;
      else if (agg === 'avg') value = nums.reduce((a, b) => a + b, 0) / nums.length;
      else if (agg === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (agg === 'min') value = Math.min(...nums);
      else if (agg === 'max') value = Math.max(...nums);
    }
    const sparkline = spec.render_hints?.sparkline ? buildSparkline(rows, q.time_column) : undefined;
    out.metric = { value: Number.isFinite(value as number) ? roundSmart(value as number) : '—', sparkline };
  }

  // Bucketing for timeline / heatmap / radial / comparison
  if (['timeline', 'heatmap', 'radial', 'comparison'].includes(spec.kind)) {
    out.buckets = bucket(rows, q.group_by, q.time_column, q.aggregate, q.aggregate_column);
  }

  if (spec.kind === 'heatmap') {
    out.heatmap = buildHeatmap(rows, q.time_column);
  }

  return out;
}

function roundSmart(n: number): number {
  if (Math.abs(n) >= 100) return Math.round(n);
  if (Math.abs(n) >= 1) return Math.round(n * 100) / 100;
  return Math.round(n * 1000) / 1000;
}

function buildSparkline(rows: any[], timeCol?: string): number[] {
  if (!timeCol) return [];
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    const t = r[timeCol];
    if (!t) continue;
    const day = String(t).slice(0, 10);
    buckets[day] = (buckets[day] ?? 0) + 1;
  }
  return Object.keys(buckets).sort().map((k) => buckets[k]);
}

function bucket(rows: any[], groupBy?: string, timeCol?: string, agg?: string, aggCol?: string) {
  const map: Record<string, { count: number; sum: number; n: number }> = {};
  const keyOf = (r: any): string => {
    if (!groupBy) {
      if (timeCol && r[timeCol]) return String(r[timeCol]).slice(0, 10);
      return 'all';
    }
    if (groupBy === 'day' && timeCol) return String(r[timeCol] ?? '').slice(0, 10);
    if (groupBy === 'hour' && timeCol) {
      const d = new Date(r[timeCol]);
      return Number.isFinite(d.getTime()) ? String(d.getHours()) : 'na';
    }
    if (groupBy === 'weekday' && timeCol) {
      const d = new Date(r[timeCol]);
      return Number.isFinite(d.getTime()) ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : 'na';
    }
    if (groupBy === 'tag' && Array.isArray(r.tags)) return r.tags[0] ?? 'untagged';
    const v = r[groupBy];
    if (Array.isArray(v)) return v[0] ?? 'none';
    return v != null ? String(v) : 'none';
  };

  // For tag grouping, expand multi-tags
  const expand = groupBy === 'tag';

  for (const r of rows) {
    const keys = expand && Array.isArray(r.tags) && r.tags.length ? r.tags.map(String) : [keyOf(r)];
    for (const k of keys) {
      if (!map[k]) map[k] = { count: 0, sum: 0, n: 0 };
      map[k].count += 1;
      if (aggCol && Number.isFinite(Number(r[aggCol]))) {
        map[k].sum += Number(r[aggCol]);
        map[k].n += 1;
      }
    }
  }

  return Object.entries(map)
    .map(([key, v]) => ({
      key,
      count: v.count,
      value: agg === 'avg' && v.n ? v.sum / v.n : agg === 'sum' ? v.sum : v.count,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildHeatmap(rows: any[], timeCol?: string) {
  if (!timeCol) return [];
  const out: Record<string, number> = {};
  for (const r of rows) {
    const t = r[timeCol];
    if (!t) continue;
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) continue;
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    // Week index back from now
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    const week = `w${Math.floor(days / 7)}`;
    const k = `${week}|${dow}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.entries(out).map(([k, v]) => {
    const [y, x] = k.split('|');
    return { x, y, v };
  });
}

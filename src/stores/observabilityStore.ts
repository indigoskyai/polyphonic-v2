import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type AgentKey = 'luca' | 'vektor' | 'anima';
export type AgentStatusKind = 'running' | 'idle' | 'paused' | 'error';

export interface AgentStatus {
  agent: AgentKey;
  status: AgentStatusKind;
  tokensSinceMidnight: number;
  lastActivityAt: string | null;
}

export interface ActiveSubagent {
  id: string;
  family: 'v1' | 'v2' | 'v3';
  name: string;
  startedAt: string;
}

interface ObservabilityState {
  agents: AgentStatus[];
  sparkline: number[];
  activeSubagents: ActiveSubagent[];
  updatedAt: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  refresh: (userId: string) => Promise<void>;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  source: string | null;
  content: Record<string, unknown> | null;
  created_at: string;
  content_integrity_status?: 'valid' | 'suspect' | 'rejected';
  content_hidden_at?: string | null;
}

const AGENT_ORDER: AgentKey[] = ['luca', 'vektor', 'anima'];
const BIN_COUNT = 24;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function bucketByBin(rows: ActivityRow[]): number[] {
  const bins = new Array(BIN_COUNT).fill(0);
  const now = Date.now();
  rows.forEach((r) => {
    const age = now - new Date(r.created_at).getTime();
    if (age < 0 || age > WINDOW_MS) return;
    const binIdx = Math.min(BIN_COUNT - 1, Math.floor((age / WINDOW_MS) * BIN_COUNT));
    // reverse so index 0 = oldest, last = newest
    bins[BIN_COUNT - 1 - binIdx] += 1;
  });
  return bins;
}

function statusFromLast(ts: string | null): AgentStatusKind {
  if (!ts) return 'idle';
  const age = Date.now() - new Date(ts).getTime();
  if (age < 60_000) return 'running';
  return 'idle';
}

function familyFromContent(content: Record<string, unknown> | null): 'v1' | 'v2' | 'v3' | null {
  const f = content?.family as string | undefined;
  if (f === 'v1' || f === 'v2' || f === 'v3') return f;
  return null;
}

export const useObservabilityStore = create<ObservabilityState>((set) => ({
  agents: AGENT_ORDER.map((agent) => ({
    agent,
    status: 'idle',
    tokensSinceMidnight: 0,
    lastActivityAt: null,
  })),
  sparkline: new Array(BIN_COUNT).fill(0),
  activeSubagents: [],
  updatedAt: new Date().toISOString(),
  expanded: false,

  setExpanded: (v) => set({ expanded: v }),

  refresh: async (userId: string) => {
    const { data, error } = await supabase
      .from('entity_activity_log')
      .select('id, activity_type, source, content, created_at, content_integrity_status, content_hidden_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return;
    }
    const rows = ((data ?? []) as ActivityRow[]).filter(
      (row) => !row.content_hidden_at && row.content_integrity_status !== 'rejected',
    );

    const byAgent: Record<AgentKey, { last: string | null; count: number }> = {
      luca: { last: null, count: 0 },
      vektor: { last: null, count: 0 },
      anima: { last: null, count: 0 },
    };
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const midnightMs = midnight.getTime();

    const started = new Map<string, ActivityRow>();
    const completed = new Set<string>();

    rows.forEach((r) => {
      const src = (r.source || '').toLowerCase();
      if (src === 'luca' || src === 'vektor' || src === 'anima') {
        const bucket = byAgent[src as AgentKey];
        if (!bucket.last || new Date(r.created_at).getTime() > new Date(bucket.last).getTime()) {
          bucket.last = r.created_at;
        }
        if (new Date(r.created_at).getTime() >= midnightMs) {
          bucket.count += 1;
        }
      }
      const t = (r.activity_type || '').toLowerCase();
      const correlationId = (r.content?.correlation_id as string | undefined) ?? r.id;
      if (t === 'subagent_started' || t === 'sub_agent_started') {
        started.set(correlationId, r);
      }
      if (t === 'subagent_completed' || t === 'sub_agent_completed') {
        completed.add(correlationId);
      }
    });

    const agents: AgentStatus[] = AGENT_ORDER.map((agent) => ({
      agent,
      status: statusFromLast(byAgent[agent].last),
      tokensSinceMidnight: byAgent[agent].count,
      lastActivityAt: byAgent[agent].last,
    }));

    const activeSubagents: ActiveSubagent[] = [];
    started.forEach((row, correlationId) => {
      if (completed.has(correlationId)) return;
      const family = familyFromContent(row.content);
      if (!family) return;
      const name = (row.content?.name as string | undefined) ?? `${family} · ${row.activity_type}`;
      activeSubagents.push({
        id: row.id,
        family,
        name,
        startedAt: row.created_at,
      });
    });

    const sparkline = bucketByBin(rows);

    set({
      agents,
      sparkline,
      activeSubagents,
      updatedAt: new Date().toISOString(),
    });
  },
}));

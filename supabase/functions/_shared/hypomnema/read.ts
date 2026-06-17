/**
 * Hypomnema read path — pre-turn always-load query.
 *
 * Returns a formatted block ready to splice into the agent's system prompt,
 * or empty string if no entries (then the soul builder skips the slot).
 *
 * The block is framed as interior state ("## what i'm sitting with"), not as
 * a database lookup ("memories about this person") — the felt-continuity goal
 * collapses if it reads like retrieval. See PLAN.md §2 "Don't pretend / Carry,
 * don't lookup."
 *
 * Ordering: by recency × confidence × foundational. Cap ~600 tokens (~2400 chars).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeContinuityBoundaryText } from "../continuity/exclusions.ts";

const TOKEN_CAP = 600;
const CHARS_PER_TOKEN = 4; // rough rule of thumb for English mixed prose
const CHAR_CAP = TOKEN_CAP * CHARS_PER_TOKEN;
const FETCH_LIMIT = 40; // overfetch then trim — cheaper than RPC ranking

export interface HypomnemaRow {
  id: string;
  content: string;
  confidence: number;
  domain: string | null;
  foundational: boolean;
  active_attention: boolean;
  last_revised: string;
  created_at: string;
  density: string;
}

type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Score for ordering entries before the token cap. Higher is better.
 * Combines recency (exponential, ~14 day half-life), confidence, and
 * foundational/active_attention floors. Mirrors the salience formula
 * we'll use in decay.ts but kept local so read has no decay dependency.
 */
function scoreEntry(row: HypomnemaRow, nowMs: number): number {
  const lastTs = new Date(row.last_revised || row.created_at).getTime();
  const ageDays = Math.max(0, (nowMs - lastTs) / 86_400_000);
  // 14-day half-life: f(0)=1, f(14)=0.5, f(28)=0.25
  const recency = Math.pow(0.5, ageDays / 14);
  const foundationalBonus = row.foundational ? 0.25 : 0;
  const attentionBonus = row.active_attention ? 0.10 : 0;
  return recency * 0.55 + row.confidence * 0.30 + foundationalBonus + attentionBonus;
}

/**
 * Render a relative-time prefix for an entry: "(3 days ago)", "(this morning)", etc.
 * Kept short and natural — this is in-voice text, not a timestamp UI.
 */
function relativeWhen(iso: string, nowMs: number): string {
  const ts = new Date(iso).getTime();
  const minutes = Math.max(1, Math.round((nowMs - ts) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) {
    const w = Math.round(days / 7);
    return w === 1 ? "a week ago" : `${w} weeks ago`;
  }
  if (days < 365) {
    const m = Math.round(days / 30);
    return m === 1 ? "a month ago" : `${m} months ago`;
  }
  const y = Math.round(days / 365);
  return y === 1 ? "a year ago" : `${y} years ago`;
}

export interface LoadHypomnemaResult {
  block: string;
  count: number;
  rendered: number;
}

/**
 * Load active hypomnema entries for (agentId, userId), score+order them,
 * apply the token cap, and return a ready-to-splice prompt block.
 *
 * Failure mode: returns empty block + count=0. Never throws — chat-multi
 * already wraps this in Promise.allSettled and the empty case is safe.
 */
export async function loadHypomnema(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
): Promise<LoadHypomnemaResult> {
  const { data, error } = await supabase
    .from("hypomnema_entry")
    .select("id, content, confidence, domain, foundational, active_attention, last_revised, created_at, density")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("active", true)
    .order("last_revised", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    console.warn("[hypomnema.read] query failed:", error.message);
    return { block: "", count: 0, rendered: 0 };
  }

  const rows = (data || []) as HypomnemaRow[];
  if (rows.length === 0) {
    const importedRows = await loadImportedHypomnemaRows(supabase, userId, agentId, FETCH_LIMIT);
    if (importedRows.length === 0) return { block: "", count: 0, rendered: 0 };
    return renderHypomnemaRows(importedRows, {
      header: "## what i'm carrying forward from the imported account",
      linePrefix: "imported prior",
    });
  }

  return renderHypomnemaRows(rows, {
    header: "## what i'm sitting with",
  });
}

export async function loadImportedHypomnemaRows(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  limit = FETCH_LIMIT,
): Promise<HypomnemaRow[]> {
  const { data: mapRows, error: mapError } = await supabase
    .from("account_portability_row_map")
    .select("target_id")
    .eq("user_id", userId)
    .eq("table_name", "hypomnema_entry")
    .eq("target_agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (mapError) {
    console.warn("[hypomnema.read] imported row map query failed:", mapError.message);
    return [];
  }

  const ids = [...new Set((mapRows || [])
    .map((row: { target_id?: unknown }) => typeof row.target_id === "string" ? row.target_id : "")
    .filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("hypomnema_entry")
    .select("id, content, confidence, domain, foundational, active_attention, last_revised, created_at, density")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("id", ids)
    .order("last_revised", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[hypomnema.read] imported hypomnema query failed:", error.message);
    return [];
  }

  return (data || []) as HypomnemaRow[];
}

function renderHypomnemaRows(
  rows: HypomnemaRow[],
  options: { header: string; linePrefix?: string },
): LoadHypomnemaResult {
  const nowMs = Date.now();
  const scored = rows
    .map((r) => ({ row: r, score: scoreEntry(r, nowMs) }))
    .sort((a, b) => b.score - a.score);

  const lines: string[] = [];
  let chars = 0;
  let rendered = 0;
  for (const { row } of scored) {
    const when = relativeWhen(row.last_revised || row.created_at, nowMs);
    const sanitized = sanitizeContinuityBoundaryText(row.content.trim());
    const prefix = options.linePrefix ? `${options.linePrefix}, ${when}` : when;
    const line = `- (${prefix}) ${sanitized.text}`;
    if (chars + line.length + 1 > CHAR_CAP) break;
    lines.push(line);
    chars += line.length + 1;
    rendered += 1;
  }

  if (lines.length === 0) return { block: "", count: rows.length, rendered: 0 };

  const block = `\n${options.header}\n\n${lines.join("\n")}`;
  return { block, count: rows.length, rendered };
}

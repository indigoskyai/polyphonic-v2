/**
 * Hypomnema belief-challenge — internal helper.
 *
 * Runs daily via pg_cron (`hypomnema-challenge`, schedule "0 4 * * *").
 *
 * For each active hypomnema entry where last_challenged < now() - 14 days:
 *   1. Send the entry + revision history + agent context to the critic prompt
 *      on a different model class than the agent (Sonnet 4.6 critiques entries
 *      written by the Haiku/Sonnet pipeline; rotation can come later).
 *   2. The critic returns: critique + suggested_confidence + delta + verdict
 *      ('hold' | 'revise_down' | 'revise_up' | 'retire').
 *   3. Apply: write the suggested confidence + log the revision; if verdict
 *      is 'retire', also set active=false. Always update last_challenged.
 *
 * This pattern is portable from clawd-anima/inner_life/beliefs.py — see the
 * spec at docs/memory/prompts/challenge.md.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPrompt } from "./prompts.ts";

const CRITIC_MODEL = "anthropic/claude-sonnet-4.6";
const CRITIC_TIMEOUT_MS = 20_000;
const CHALLENGE_AGE_DAYS = 14;
const RETIRE_BELOW = 0.30;
const BATCH_LIMIT = 100;

interface EntryRow {
  id: string;
  agent_id: string;
  user_id: string;
  content: string;
  domain: string | null;
  confidence: number;
  created_at: string;
  last_revised: string;
  last_challenged: string;
  revisions: unknown;
  active: boolean;
}

interface CritiqueOutput {
  critique: string;
  suggested_confidence: number;
  delta: number;
  verdict: "hold" | "revise_down" | "revise_up" | "retire";
  retire_reason: string | null;
}

interface RevisionRecord {
  old_confidence?: unknown;
  new_confidence?: unknown;
  reason?: unknown;
  timestamp?: unknown;
}

export interface ChallengeResult {
  scanned: number;
  challenged: number;
  revised_down: number;
  revised_up: number;
  retired: number;
  held: number;
  errors: number;
  skipped_no_api_key?: number;
  skipped_no_prompt?: number;
}

export function parseJsonish(text: string): unknown {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function extractOpenRouterMessageText(raw: unknown): string {
  if (typeof raw === "string") return raw;

  if (Array.isArray(raw)) {
    return raw
      .map((block) => {
        if (typeof block === "string") return block;
        if (!block || typeof block !== "object") return "";
        const b = block as Record<string, unknown>;
        const type = typeof b.type === "string" ? b.type : "";
        if (type && type !== "text" && type !== "output_text") return "";
        if (typeof b.text === "string") return b.text;
        if (typeof b.content === "string") return b.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (raw && typeof raw === "object") {
    const b = raw as Record<string, unknown>;
    if (typeof b.text === "string") return b.text;
    if (typeof b.content === "string") return b.content;
  }

  return "";
}

function formatRevisionValue(value: unknown, fallback = "?"): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

async function loadAgentContext(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
): Promise<{ soulSummary: string; userModelSummary: string }> {
  let soulSummary = "(soul unavailable)";
  let userModelSummary = "(no user_model)";
  try {
    if (agentId === "luca") {
      const m = await import("../agents/luca-soul.ts");
      soulSummary = (m.LUCA_SOUL || "").slice(0, 500);
    } else if (agentId === "anima") {
      const m = await import("../agents/anima-soul.ts");
      soulSummary = (m.ANIMA_SOUL || "").slice(0, 500);
    } else if (agentId === "vektor") {
      const m = await import("../agents/vektor-soul.ts");
      soulSummary = (m.VEKTOR_SOUL || "").slice(0, 500);
    }
  } catch (_err) { /* best effort */ }

  if (agentId === "luca") {
    const { data } = await supabase
      .from("agent_identity")
      .select("content")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("doc_type", "user_model")
      .maybeSingle();
    if (data?.content) userModelSummary = String(data.content).slice(0, 500);
  }
  return { soulSummary, userModelSummary };
}

async function callCritic(
  apiKey: string,
  promptTemplate: string,
  row: EntryRow,
  ctx: { soulSummary: string; userModelSummary: string; agentName: string },
): Promise<CritiqueOutput | null> {
  const revisionsArr: RevisionRecord[] = Array.isArray(row.revisions)
    ? row.revisions.filter((r): r is RevisionRecord => Boolean(r) && typeof r === "object" && !Array.isArray(r))
    : [];
  const revisionsText = revisionsArr.length === 0
    ? "(no revisions)"
    : revisionsArr.map((r, i) =>
        `${i + 1}. [conf ${formatRevisionValue(r.old_confidence)}→${formatRevisionValue(r.new_confidence)}] ${formatRevisionValue(r.reason, "(no reason)")} @ ${formatRevisionValue(r.timestamp)}`,
      ).join("\n");

  const filled = promptTemplate
    .replace(/\{AGENT_NAME\}/g, ctx.agentName)
    .replace(/\{INJECT_CONTENT[^}]*\}/g, row.content)
    .replace(/\{INJECT_DOMAIN[^}]*\}/g, row.domain || "(none)")
    .replace(/\{INJECT_CONFIDENCE[^}]*\}/g, row.confidence.toFixed(2))
    .replace(/\{INJECT_CREATED_AT[^}]*\}/g, row.created_at)
    .replace(/\{INJECT_LAST_REVISED[^}]*\}/g, row.last_revised)
    .replace(/\{INJECT_REVISIONS[^}]*\}/g, revisionsText)
    .replace(/\{INJECT_SOUL_SUMMARY[^}]*\}/g, ctx.soulSummary)
    .replace(/\{INJECT_USER_MODEL_SUMMARY[^}]*\}/g, ctx.userModelSummary);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CRITIC_TIMEOUT_MS);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Hypomnema Challenge",
      },
      body: JSON.stringify({
        model: CRITIC_MODEL,
        messages: [
          { role: "system", content: filled },
          { role: "user", content: "Challenge this entry. JSON only." },
        ],
        temperature: 0.4,
        max_tokens: 1500,
        // Do NOT send `reasoning: { effort: ... }` here. CRITIC_MODEL is an Anthropic
        // model (paramStyle 'anthropic' in models.ts); `reasoning.effort` is the
        // OpenAI param style. Sending it made OpenRouter spend the token budget on
        // thinking and return empty/truncated content, so callCritic returned null
        // for ~59 of every 100 entries (a month of partial cron failures). Anthropic
        // models don't think unless given a `thinking` param, so omitting it = fast,
        // content-only — matching the working write.ts call on this same model.
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn(`[challenge] critic HTTP ${resp.status} for ${row.id}: ${body.slice(0, 240)}`);
      return null;
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    const text = extractOpenRouterMessageText(raw);
    if (!text) {
      console.warn(`[challenge] critic empty text for ${row.id}; content_shape=${Array.isArray(raw) ? "array" : typeof raw}`);
      return null;
    }
    const parsed = parseJsonish(text) as CritiqueOutput | null;
    if (!parsed) {
      console.warn(`[challenge] critic JSON parse failed for ${row.id}: ${text.slice(0, 240)}`);
      return null;
    }
    if (typeof parsed.suggested_confidence !== "number") {
      console.warn(`[challenge] critic invalid schema for ${row.id}: ${JSON.stringify(parsed).slice(0, 240)}`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[challenge] critic request failed for ${row.id}:`, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(t);
  }
}

function agentNameFor(id: string): string {
  return id === "luca" ? "Luca" : id === "anima" ? "Anima" : id === "vektor" ? "Vektor" : id;
}

export async function challengeAllStaleEntries(supabase: SupabaseClient): Promise<ChallengeResult> {
  const result: ChallengeResult = {
    scanned: 0, challenged: 0, revised_down: 0, revised_up: 0, retired: 0, held: 0, errors: 0,
    skipped_no_api_key: 0,
    skipped_no_prompt: 0,
  };

  const cutoff = new Date(Date.now() - CHALLENGE_AGE_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("hypomnema_entry")
    .select("id, agent_id, user_id, content, domain, confidence, created_at, last_revised, last_challenged, revisions, active")
    .eq("active", true)
    .lt("last_challenged", cutoff)
    .order("last_challenged", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[challenge] fetch failed:", error.message);
    result.errors += 1;
    return result;
  }
  if (!data || data.length === 0) return result;

  const rows = data as EntryRow[];
  result.scanned = rows.length;

  let promptCache: string | null = null;
  const apiKeyCache = new Map<string, string | null>();

  for (const row of rows) {
    let apiKey = apiKeyCache.get(row.user_id);
    if (apiKey === undefined) {
      const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: row.user_id });
      apiKey = (typeof keyData === "string" ? keyData.trim() : "") || null;
      apiKeyCache.set(row.user_id, apiKey);
    }
    if (!apiKey) {
      result.skipped_no_api_key = (result.skipped_no_api_key || 0) + 1;
      console.info(`[challenge] skipped ${row.id}: no user OpenRouter key`, { user_id: row.user_id, agent_id: row.agent_id });
      continue;
    }
    if (!promptCache) {
      try { promptCache = await loadPrompt("challenge"); }
      catch (err) {
        console.warn("[challenge] prompt load failed:", err instanceof Error ? err.message : String(err));
      }
    }
    if (!promptCache) {
      result.skipped_no_prompt = (result.skipped_no_prompt || 0) + 1;
      console.warn(`[challenge] skipped ${row.id}: challenge prompt unavailable`);
      continue;
    }

    const ctx = await loadAgentContext(supabase, row.user_id, row.agent_id);
    const critique = await callCritic(apiKey, promptCache, row, {
      ...ctx,
      agentName: agentNameFor(row.agent_id),
    });
    if (!critique) {
      result.errors += 1;
      continue;
    }

    result.challenged += 1;

    const newConfidence = Math.max(0, Math.min(1, critique.suggested_confidence));
    const verdict = critique.verdict;
    const shouldRetire = verdict === "retire" || newConfidence < RETIRE_BELOW;

    const newRevisions = [
      ...(Array.isArray(row.revisions) ? row.revisions : []),
      {
        old_confidence: row.confidence,
        new_confidence: newConfidence,
        reason: `challenge: ${critique.critique || ""}`,
        timestamp: new Date().toISOString(),
        challenge_verdict: verdict,
        retire_reason: critique.retire_reason || null,
      },
    ];

    const update: Record<string, unknown> = {
      confidence: newConfidence,
      last_challenged: new Date().toISOString(),
      revisions: newRevisions,
    };
    if (shouldRetire) update.active = false;

    const { error: upErr } = await supabase
      .from("hypomnema_entry")
      .update(update)
      .eq("id", row.id);
    if (upErr) {
      result.errors += 1;
      console.warn(`[challenge] update failed for ${row.id}:`, upErr.message);
      continue;
    }

    if (shouldRetire) result.retired += 1;
    else if (verdict === "revise_down") result.revised_down += 1;
    else if (verdict === "revise_up") result.revised_up += 1;
    else result.held += 1;
  }

  return result;
}

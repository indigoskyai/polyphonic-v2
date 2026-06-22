/**
 * Hypomnema graduation — internal helper.
 *
 * Runs daily via pg_cron (`mnemos-graduate`, schedule "15 4 * * *").
 *
 * For each active hypomnema entry per (agent_id, user_id):
 *   1. Compute graduation score (deterministic):
 *        score = revision_count * 0.30
 *              + multi_session_factor * 0.30   (touched in N distinct threads)
 *              + domain_weight * 0.20          (identity/relationship/philosophy = 1.0)
 *              + foundational_bonus * 0.20
 *              + age_factor                    (>7 days = unlocked, <7 days = 0)
 *   2. Score >= 0.85 AND age >= 7 days → graduate (deterministic).
 *   3. Score in [0.65, 0.85] AND age >= 7 days → consult the LLM judge.
 *   4. Score < 0.65 OR age < 7 days → keep in hypomnema.
 *
 * On graduate:
 *   - Call mnemos.encode() with kind='semantic', tags include agent_id.
 *   - Update hypomnema_entry.graduated_to_engram_id with the new engram id.
 *   - Add a graduation note to revisions[].
 *
 * The promoted engram lands in mnemos and is picked up by the next
 * 6-hourly mnemos-consolidate cycle.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPrompt } from "./prompts.ts";

// Lowered (Tier-2 graduation depth): with the age_factor term implemented and
// weights rebalanced, a sustained multi-session top-domain mature entry now
// reaches 0.85; 0.80/0.55 lets such entries graduate deterministically and pulls
// more genuine candidates into the judge band (graduation ran at ~0 before).
const GRAD_HARD_THRESHOLD = 0.80;
const GRAD_SOFT_THRESHOLD = 0.55;
const MIN_AGE_DAYS = 7;
const JUDGE_MODEL = "anthropic/claude-haiku-4.5"; // borderline judge — cheap, decisive
const JUDGE_TIMEOUT_MS = 15_000;

interface HypomnemaRow {
  id: string;
  agent_id: string;
  user_id: string;
  content: string;
  domain: string | null;
  tags: string[] | null;
  confidence: number;
  foundational: boolean;
  revision_count: number;
  revisions: unknown;
  created_at: string;
  last_revised: string;
  thread_id: string | null;
}

export interface GraduationResult {
  scanned: number;
  graduated: number;
  judged_borderline: number;
  errors: number;
  per_user: Record<string, { scanned: number; graduated: number }>;
}

interface JudgeOutput {
  graduate: boolean;
  reason: string;
  engram_content: string | null;
  engram_tags: string[];
}

function parseJsonish(text: string): unknown {
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

function ageDays(iso: string): number {
  const ts = new Date(iso).getTime();
  return Math.max(0, (Date.now() - ts) / 86_400_000);
}

function domainWeight(domain: string | null): number {
  const d = (domain || "").toLowerCase();
  if (d === "identity" || d === "relationship" || d === "philosophy") return 1.0;
  if (d === "work" || d === "mood") return 0.7;
  return 0.5;
}

/**
 * Compute graduation score for a single entry given its row + how many distinct
 * threads have touched it (proxied by revision history with thread metadata).
 *
 * Score is in [0, 1]. >=0.85 = deterministic graduate. [0.65, 0.85] = LLM judge.
 */
export function computeGraduationScore(row: HypomnemaRow, distinctThreads: number): number {
  const age = ageDays(row.created_at);
  if (age < MIN_AGE_DAYS) return 0;
  const revisionFactor = Math.min(1, (row.revision_count ?? 0) / 4);
  const multiSession = Math.min(1, distinctThreads / 3);
  const dWeight = domainWeight(row.domain);
  const foundationalBonus = row.foundational ? 1.0 : 0;
  // age_factor: tenure past the 7-day minimum, saturating at ~60 days. Documented
  // in the header but previously unimplemented — endurance is itself signal, so a
  // mature multi-session top-domain entry can clear the deterministic gate without
  // requiring the (rarely-set) foundational flag. Weights rebalanced to sum to 1.0.
  const ageFactor = Math.min(1, Math.max(0, (age - MIN_AGE_DAYS) / 53));
  return (
    revisionFactor * 0.25 +
    multiSession * 0.25 +
    dWeight * 0.20 +
    foundationalBonus * 0.15 +
    ageFactor * 0.15
  );
}

async function callJudge(
  apiKey: string,
  promptTemplate: string,
  row: HypomnemaRow,
  score: number,
  nearbyEngrams: Array<{ content: string; similarity: number }>,
): Promise<JudgeOutput | null> {
  const revisionsArr = Array.isArray(row.revisions) ? row.revisions : [];
  const revisionsText = revisionsArr.length === 0
    ? "(no revisions)"
    : revisionsArr
        .map((r: any, i: number) =>
          `${i + 1}. [conf ${r.old_confidence}→${r.new_confidence}] ${r.reason || "(no reason)"} (${r.timestamp || "?"})`,
        )
        .join("\n");
  const nearbyText = nearbyEngrams.length === 0
    ? "(no nearby engrams)"
    : nearbyEngrams
        .map((e, i) => `${i + 1}. [sim=${e.similarity.toFixed(2)}] ${e.content.slice(0, 200)}`)
        .join("\n");

  const filled = promptTemplate
    .replace(/\{INJECT_ENTRY[^}]*\}/g,
      `content: ${row.content}\ndomain: ${row.domain || "(none)"}\ntags: ${(row.tags || []).join(", ")}\nconfidence: ${row.confidence}\nrevision_count: ${row.revision_count}\nage_days: ${ageDays(row.created_at).toFixed(1)}`)
    .replace(/\{INJECT_REVISIONS[^}]*\}/g, revisionsText)
    .replace(/\{INJECT_NEARBY_ENGRAMS[^}]*\}/g, nearbyText)
    .replace(/\{INJECT_SCORE[^}]*\}/g, score.toFixed(2));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), JUDGE_TIMEOUT_MS);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Hypomnema Graduation",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [
          { role: "system", content: filled },
          { role: "user", content: "Decide whether this entry should graduate. JSON only." },
        ],
        temperature: 0.0,
        max_tokens: 400,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonish(text) as JudgeOutput | null;
    if (!parsed || typeof parsed.graduate !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Promote a hypomnema entry to a Mnemos engram. Inserts directly into engrams
 * table (skipping mnemos.encode's surprise check — graduation is a different
 * pathway with its own gating). Tags include `hypomnema-graduate` + agent_id.
 */
async function promoteToEngram(
  supabase: SupabaseClient,
  row: HypomnemaRow,
  engramContent: string,
  engramTags: string[],
): Promise<string | null> {
  const tags = [...new Set([...(engramTags || []), "hypomnema-graduate", row.agent_id])].slice(0, 16);
  const { data, error } = await supabase
    .from("engrams")
    .insert({
      user_id: row.user_id,
      agent_id: row.agent_id,
      content: engramContent,
      engram_type: "semantic",
      strength: 0.85,
      stability: 0.7,
      accessibility: 0.7,
      emotional_valence: 0,
      emotional_arousal: 0.2,
      surprise_score: 0.5,
      source_context: {
        type: "hypomnema_graduation",
        hypomnema_entry_id: row.id,
        agent_id: row.agent_id,
        original_content: row.content,
      },
      tags,
      state: "active",
      access_count: 0,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.warn(`[graduate] insert engram failed for ${row.id}:`, error?.message);
    return null;
  }
  return data.id as string;
}

/** Mark a hypomnema entry as graduated; append note to revisions[]. */
async function markGraduated(
  supabase: SupabaseClient,
  row: HypomnemaRow,
  engramId: string,
  reason: string,
): Promise<void> {
  const newRevisions = [
    ...(Array.isArray(row.revisions) ? row.revisions : []),
    {
      old_confidence: row.confidence,
      new_confidence: row.confidence,
      reason: `graduated to engram ${engramId.slice(0, 8)}: ${reason}`,
      timestamp: new Date().toISOString(),
    },
  ];
  const { error } = await supabase
    .from("hypomnema_entry")
    .update({
      graduated_to_engram_id: engramId,
      revisions: newRevisions,
      revision_count: (row.revision_count || 0) + 1,
    })
    .eq("id", row.id);
  if (error) console.warn(`[graduate] mark failed for ${row.id}:`, error.message);
}

/**
 * Run a single graduation pass across all eligible hypomnema entries.
 *
 * Per-user grouping so we resolve the user's API key once and reuse it for
 * the borderline judge. Service-role client provided by caller.
 */
export async function graduateAllEligible(supabase: SupabaseClient): Promise<GraduationResult> {
  const result: GraduationResult = {
    scanned: 0,
    graduated: 0,
    judged_borderline: 0,
    errors: 0,
    per_user: {},
  };

  // Pull eligible candidates: active=true, no graduated_to_engram_id, age >= 7 days.
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("hypomnema_entry")
    .select("id, agent_id, user_id, content, domain, tags, confidence, foundational, revision_count, revisions, created_at, last_revised, thread_id")
    .eq("active", true)
    .is("graduated_to_engram_id", null)
    .lte("created_at", cutoff)
    .order("user_id", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[graduate] fetch failed:", error.message);
    result.errors += 1;
    return result;
  }
  if (!data || data.length === 0) return result;

  const rows = data as HypomnemaRow[];
  result.scanned = rows.length;

  // Lazy-load the prompt only if we hit a borderline.
  let promptCache: string | null = null;
  const apiKeyCache = new Map<string, string | null>();

  for (const row of rows) {
    const userBucket = result.per_user[row.user_id] ||= { scanned: 0, graduated: 0 };
    userBucket.scanned += 1;

    // Distinct-threads count from revisions metadata + thread_id of the entry itself.
    const revisionsArr = Array.isArray(row.revisions) ? (row.revisions as Array<Record<string, unknown>>) : [];
    const threadIds = new Set<string>();
    if (row.thread_id) threadIds.add(row.thread_id);
    for (const r of revisionsArr) {
      // Revisions record thread provenance as `source_thread_id` / `previous_thread_id`
      // (see hypomnema/write.ts) — NOT a bare `thread_id`. Reading only `thread_id`
      // meant distinctThreads was permanently 1, pinning multiSession at 0.10 and
      // holding the total score below every graduation threshold (0 of 1763 ever
      // graduated). Count every thread key a revision actually carries.
      for (const key of ["source_thread_id", "previous_thread_id", "thread_id"]) {
        const v = r[key];
        if (typeof v === "string") threadIds.add(v);
      }
    }
    const distinctThreads = threadIds.size || 1;

    // NOTE: deliberately NO foundational-setter here. hypomnema_entry.foundational
    // is the DECAY-IMMUNITY flag (migration 20260504223339: "immune to deep decay,
    // salience floor 0.7"; decay.ts floors salience at 0.70) and a +0.25 prompt
    // boost (read.ts) — a permanent, one-way state change nothing ever clears.
    // Auto-setting it from graduation would grant irreversible decay immunity to
    // crisis-user memories. The age_factor + threshold changes already let mature
    // top-domain entries graduate; making an entry foundational is a separate,
    // deliberate decision, not a graduation side effect.
    const score = computeGraduationScore(row, distinctThreads);

    let shouldGraduate = false;
    let engramContent = "";
    let engramTags: string[] = row.tags ?? [];
    let reason = "";

    if (score >= GRAD_HARD_THRESHOLD) {
      shouldGraduate = true;
      engramContent = row.content;
      reason = `deterministic score ${score.toFixed(2)} >= ${GRAD_HARD_THRESHOLD}`;
    } else if (score >= GRAD_SOFT_THRESHOLD) {
      // Borderline — consult the judge.
      result.judged_borderline += 1;
      let apiKey = apiKeyCache.get(row.user_id);
      if (apiKey === undefined) {
        const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: row.user_id });
        apiKey = (typeof keyData === "string" ? keyData.trim() : "") || null;
        apiKeyCache.set(row.user_id, apiKey);
      }
      if (!apiKey) {
        // No key → can't judge. Skip; will retry next cron pass.
        continue;
      }
      if (!promptCache) {
        try { promptCache = await loadPrompt("graduation"); }
        catch (err) { console.warn("[graduate] prompt load failed:", (err as Error).message); }
      }
      if (!promptCache) continue;

      // Look up nearby engrams for duplication-check (best-effort; trigram only).
      let nearby: Array<{ content: string; similarity: number }> = [];
      try {
        const { data: matches } = await supabase.rpc("match_engrams", {
          query_text: row.content,
          match_count: 3,
          p_user_id: row.user_id,
          p_agent_id: row.agent_id,
        });
        if (Array.isArray(matches)) {
          nearby = matches.slice(0, 3).map((m: { content: string; similarity?: number }) => ({
            content: m.content || "",
            similarity: m.similarity ?? 0,
          }));
        }
      } catch (_err) { /* best effort */ }

      const verdict = await callJudge(apiKey, promptCache, row, score, nearby);
      if (verdict?.graduate && verdict.engram_content) {
        shouldGraduate = true;
        engramContent = verdict.engram_content;
        engramTags = verdict.engram_tags && verdict.engram_tags.length > 0 ? verdict.engram_tags : engramTags;
        reason = `judge: ${verdict.reason || "approved"}`;
      } else {
        // judge declined; entry stays in hypomnema
      }
    }
    // else: score < soft threshold → keep in hypomnema

    if (shouldGraduate) {
      try {
        const engramId = await promoteToEngram(supabase, row, engramContent, engramTags);
        if (engramId) {
          await markGraduated(supabase, row, engramId, reason);
          result.graduated += 1;
          userBucket.graduated += 1;
        } else {
          result.errors += 1;
        }
      } catch (err) {
        console.warn(`[graduate] promote failed for ${row.id}:`, (err as Error).message);
        result.errors += 1;
      }
    }
  }

  return result;
}

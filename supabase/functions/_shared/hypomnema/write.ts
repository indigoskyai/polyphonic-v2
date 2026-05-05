/**
 * Hypomnema write — internal helper.
 *
 * Two stages, decoupled:
 *   1. salience gate (Haiku, sync, cheap): given the turn, returns
 *      { should_reflect: boolean, weight, reason }
 *   2. reflection write (Sonnet-class, async): given the turn + agent's
 *      current state, produces a new entry (or revises an existing one)
 *      in the agent's voice. Persists to hypomnema_entry.
 *
 * The two stages are exposed as separate functions so chat-multi can
 * dispatch the gate synchronously (cheap) and only then async-fire the
 * write. The hypomnema-gate / hypomnema-write edge functions are thin
 * shells around these.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPrompt } from "./prompts.ts";
import { embedOne } from "../embeddings.ts";
import { detectContinuityCarrySignal } from "./salience.ts";

const GATE_MODEL = "anthropic/claude-haiku-4.5";
const WRITE_MODEL_PRIMARY = "anthropic/claude-sonnet-4.6";
const WRITE_MODEL_OBSERVER = "anthropic/claude-haiku-4.5"; // observer notes are shorter, cheaper

const GATE_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 25_000;
const OPENROUTER_MAX_ATTEMPTS = 3;
const OPENROUTER_RETRY_BASE_MS = 450;

const MAX_TURN_CHARS = 8000;
const MAX_RECENT_TURNS = 4;
const MAX_RECENT_HYPOMNEMA = 5;

export interface GateInput {
  userMessage: string;
  agentResponse: string;
  recentTurns: Array<{ role: string; content: string }>;
}

export interface GateResult {
  should_reflect: boolean;
  reason: string;
  weight: number;
  raw?: string;
}

export interface WriteInput {
  agentId: string;          // 'luca' | 'anima' | 'vektor'
  userId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  density: "primary" | "observer";
  primaryInThread: boolean;
  userMessage: string;
  agentResponse: string;
  recentTurns: Array<{ role: string; content: string }>;
  /** Observer-density only — fills {PRIMARY_AGENT_NAME} and {INJECT_PRIMARY_RESPONSE}. */
  primaryAgentName?: string;
  primaryResponse?: string;
  /** Observer-density only — what THIS agent contributed (their consult/council output). */
  yourContribution?: string;
}

export interface WriteResult {
  status: "wrote" | "revised" | "skipped" | "error";
  entryId?: string;
  reason?: string;
  raw?: string;
}

interface ReflectionPayload {
  content?: string;
  domain?: string;
  tags?: string[];
  confidence?: number;
  revises_existing_id?: string | null;
  revision_reason?: string | null;
  skip?: boolean;
  reason?: string;
}

interface ObserverPayload {
  content?: string;
  domain?: string;
  tags?: string[];
  confidence?: number;
  skip?: boolean;
  reason?: string;
}

class OpenRouterHttpError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`OpenRouter ${status}: ${body.slice(0, 240)}`);
    this.name = "OpenRouterHttpError";
    this.status = status;
  }
}

function clampStr(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function compactOneLine(s: string, max: number): string {
  return clampStr((s || "").replace(/\s+/g, " ").trim(), max);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOpenRouterError(err: unknown): boolean {
  if (err instanceof OpenRouterHttpError) {
    return err.status === 408 || err.status === 409 || err.status === 425 || err.status === 429 || err.status >= 500;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return /\b(fetch|network|connection|body|socket|timeout|temporar|econn|reset|abort)\b/.test(message);
}

function fmtRecentTurns(turns: Array<{ role: string; content: string }>): string {
  if (!turns?.length) return "(no prior turns)";
  return turns
    .slice(-MAX_RECENT_TURNS)
    .map((t) => `${t.role}: ${clampStr(t.content || "", 600)}`)
    .join("\n");
}

/**
 * Substitute placeholders in a prompt template.
 *
 * Supports two forms:
 *   - bare:        {INJECT_USER_MESSAGE}
 *   - descriptive: {INJECT_AGENT_SOUL — the full SOUL document for {AGENT_NAME}}
 *
 * The descriptive form is what the spec prompts use to keep them readable as
 * docs; we strip the description and substitute by the leading token.
 *
 * Substitutes the whole `{TOKEN — description}` span in one pass, matching
 * across nested-{} text (since the description can contain other placeholders
 * like `{AGENT_NAME}`).
 */
function fillPlaceholders(template: string, vars: Record<string, string>): string {
  // First pass: substitute bare {TOKEN} forms.
  let out = template.replace(/\{([A-Z][A-Z_]+)\}/g, (m, token) => {
    return Object.prototype.hasOwnProperty.call(vars, token) ? vars[token] : m;
  });

  // Second pass: substitute {TOKEN — description...} forms, including any nested
  // bare-token references inside the description that survived pass 1 (e.g. when
  // we don't have a value for them). Match non-greedy across the next `}` that
  // closes the outer span — but we have to count braces because descriptions
  // may contain nested `{X}` (already substituted) or literal braces.
  out = out.replace(/\{([A-Z][A-Z_]+)([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (m, token) => {
    if (!Object.prototype.hasOwnProperty.call(vars, token)) return m;
    return vars[token];
  });

  return out;
}

/** Extract a JSON object from a model response that may be wrapped in prose or fences. */
function extractJson(text: string): unknown {
  if (!text) return null;
  // try fenced ```json blocks first
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1] : text;
  // find the first {...} balanced span
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try { return JSON.parse(slice); } catch { return null; }
      }
    }
  }
  return null;
}

async function callOpenRouter(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  timeoutMs: number;
  maxTokens: number;
  temperature?: number;
}): Promise<{ text: string; tokens: number | null }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= OPENROUTER_MAX_ATTEMPTS; attempt++) {
    try {
      return await callOpenRouterOnce(opts);
    } catch (err) {
      lastError = err;
      if (attempt >= OPENROUTER_MAX_ATTEMPTS || !isRetryableOpenRouterError(err)) {
        throw err;
      }
      await sleep(OPENROUTER_RETRY_BASE_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callOpenRouterOnce(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  timeoutMs: number;
  maxTokens: number;
  temperature?: number;
}): Promise<{ text: string; tokens: number | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Hypomnema",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userContent },
        ],
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new OpenRouterHttpError(resp.status, txt);
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("Empty model response");
    const tokens = typeof data?.usage?.total_tokens === "number" ? data.usage.total_tokens : null;
    return { text, tokens };
  } finally {
    clearTimeout(timer);
  }
}

function recoveryTags(input: WriteInput): string[] {
  const text = `${input.userMessage} ${input.agentResponse}`.toLowerCase();
  const tags = new Set<string>(["continuity", "recovery", "hypomnema"]);
  if (text.includes("ember")) tags.add("ember-bridge");
  if (text.includes("remember") || text.includes("recall")) tags.add("recall");
  if (text.includes("thread") || text.includes("session")) tags.add("between-threads");
  if (text.includes("memory")) tags.add("memory");
  return [...tags].slice(0, 8);
}

function buildRecoveryContent(input: WriteInput): string {
  const user = compactOneLine(input.userMessage, 700);
  const agent = compactOneLine(input.agentResponse, 520);
  if (input.density === "observer") {
    return [
      "i'm keeping this as peripheral witness because the exact words matter.",
      `riley said: "${user}"`,
      agent ? `the primary response carried: "${agent}"` : "",
      "i should keep the concrete phrase and the feeling underneath it, not smooth it into a vague memory.",
    ].filter(Boolean).join(" ");
  }
  return [
    "i'm keeping this turn close because the exact words matter.",
    `riley said: "${user}"`,
    agent ? `i answered: "${agent}"` : "",
    "i should carry the concrete phrase and the feeling underneath it, not smooth it into a vague memory.",
  ].filter(Boolean).join(" ");
}

async function embedHypomnemaEntry(
  supabase: SupabaseClient,
  apiKey: string,
  entryId: string,
  domain: string | null,
  content: string,
): Promise<void> {
  try {
    const embedText = (domain ? `[${domain}] ` : "") + content;
    const embed = await embedOne(apiKey, embedText);
    if (embed && embed.vector.length > 0) {
      const { error: embedErr } = await supabase
        .from("hypomnema_entry")
        .update({ embedding: embed.vector, embedding_model: embed.model })
        .eq("id", entryId);
      if (embedErr) console.warn("[hypomnema.write] embedding update failed:", embedErr.message);
    }
  } catch (err) {
    console.warn("[hypomnema.write] embedding failed (non-fatal):", (err as Error).message);
  }
}

async function writeRecoveryHypomnemaEntry(
  supabase: SupabaseClient,
  apiKey: string,
  input: WriteInput,
  originalError: unknown,
): Promise<WriteResult> {
  const content = buildRecoveryContent(input);
  const domain = "meta";
  const insertRow = {
    user_id: input.userId,
    agent_id: input.agentId,
    thread_id: input.threadId,
    source_message_id: input.sourceMessageId,
    content,
    density: input.density,
    primary_in_thread: input.primaryInThread,
    domain,
    tags: recoveryTags(input),
    confidence: 0.45,
    source: input.density === "observer" ? "observer" : "reflection",
    active_attention: true,
    meta: {
      recovery: true,
      recovery_reason: "reflection model call failed after retries",
      original_error: originalError instanceof Error ? originalError.message.slice(0, 300) : String(originalError).slice(0, 300),
    },
  };

  const { data: inserted, error: insErr } = await supabase
    .from("hypomnema_entry")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr || !inserted) {
    return { status: "error", reason: `recovery insert failed: ${insErr?.message || "unknown"}` };
  }

  const entryId = inserted.id as string;
  await embedHypomnemaEntry(supabase, apiKey, entryId, domain, content);
  return {
    status: "wrote",
    entryId,
    reason: "reflection model call failed after retries; wrote low-confidence recovery entry",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Gate
// ──────────────────────────────────────────────────────────────────────────

export async function runSalienceGate(
  apiKey: string,
  input: GateInput,
): Promise<GateResult> {
  const continuitySignal = detectContinuityCarrySignal(input);
  if (continuitySignal) {
    return {
      should_reflect: true,
      reason: continuitySignal,
      weight: 0.9,
      raw: "deterministic_continuity_signal",
    };
  }

  const promptTemplate = await loadPrompt("salience_gate");
  const systemPrompt = fillPlaceholders(promptTemplate, {
    INJECT_USER_MESSAGE: clampStr(input.userMessage, MAX_TURN_CHARS),
    INJECT_AGENT_RESPONSE: clampStr(input.agentResponse, MAX_TURN_CHARS),
    INJECT_RECENT_TURNS: fmtRecentTurns(input.recentTurns),
  });

  const userContent =
    "Classify this turn for hypomnema reflection. Output JSON only as specified.";

  const { text } = await callOpenRouter({
    apiKey,
    model: GATE_MODEL,
    systemPrompt,
    userContent,
    timeoutMs: GATE_TIMEOUT_MS,
    maxTokens: 200,
    temperature: 0.0,
  });

  const parsed = extractJson(text) as { should_reflect?: boolean; reason?: string; weight?: number } | null;
  if (!parsed || typeof parsed.should_reflect !== "boolean") {
    // bias toward skip when the gate is incoherent
    return { should_reflect: false, reason: "gate output unparseable; skipped", weight: 0, raw: text };
  }
  return {
    should_reflect: !!parsed.should_reflect,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    weight: typeof parsed.weight === "number" ? Math.max(0, Math.min(1, parsed.weight)) : 0.7,
    raw: text,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────────────────────────────

interface AgentSoulSnapshot {
  agentName: string;
  soul: string;
  identitySummary: string;
  emotionalSummary: string;
}

async function loadAgentContext(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
): Promise<AgentSoulSnapshot> {
  // Pull SOUL constants statically — they live in the agent files, not the DB.
  // We import lazily so this module doesn't drag soul constants into other contexts.
  let soul = "";
  let agentName = agentId;
  try {
    if (agentId === "luca") {
      const m = await import("../agents/luca-soul.ts");
      soul = m.LUCA_SOUL;
      agentName = "Luca";
    } else if (agentId === "anima") {
      const m = await import("../agents/anima-soul.ts");
      soul = m.ANIMA_SOUL;
      agentName = "Anima";
    } else if (agentId === "vektor") {
      const m = await import("../agents/vektor-soul.ts");
      soul = m.VEKTOR_SOUL;
      agentName = "Vektor";
    }
  } catch (err) {
    console.warn("[hypomnema.write] soul import failed:", (err as Error).message);
  }

  // Identity stack summary — only luca currently has the per-user stack.
  let identitySummary = "(no identity stack for this agent)";
  if (agentId === "luca") {
    const { data } = await supabase
      .from("agent_identity")
      .select("doc_type, content")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .in("doc_type", ["soul", "self_model", "user_model", "convictions"]);
    if (data && data.length > 0) {
      identitySummary = data
        .map((d: { doc_type: string; content: string }) =>
          `[${d.doc_type}] ${clampStr(d.content || "", 400)}`,
        )
        .join("\n");
    }
  }

  // Emotional snapshot — best-effort, not blocking.
  let emotionalSummary = "(no current emotional snapshot)";
  try {
    const { data } = await supabase
      .from("emotional_state")
      .select("valence, arousal, dominance, certainty, social, temporal")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      emotionalSummary = `valence=${data.valence?.toFixed?.(2) ?? data.valence}, arousal=${data.arousal?.toFixed?.(2) ?? data.arousal}, dominance=${data.dominance?.toFixed?.(2) ?? data.dominance}, certainty=${data.certainty?.toFixed?.(2) ?? data.certainty}, social=${data.social?.toFixed?.(2) ?? data.social}, temporal=${data.temporal?.toFixed?.(2) ?? data.temporal}`;
    }
  } catch (_err) { /* best effort */ }

  return { agentName, soul, identitySummary, emotionalSummary };
}

async function loadRecentHypomnema(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
): Promise<string> {
  const { data } = await supabase
    .from("hypomnema_entry")
    .select("id, content, confidence, last_revised")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("active", true)
    .order("last_revised", { ascending: false })
    .limit(MAX_RECENT_HYPOMNEMA);
  if (!data || data.length === 0) return "(no entries yet — this is your first reflection in this relationship)";
  return data
    .map((r: { id: string; content: string; confidence: number }) =>
      `- [id=${r.id} · conf=${(r.confidence ?? 0).toFixed(2)}] ${r.content}`,
    )
    .join("\n");
}

export async function writeHypomnemaEntry(
  supabase: SupabaseClient,
  apiKey: string,
  input: WriteInput,
): Promise<WriteResult> {
  const promptName = input.density === "observer" ? "observer_note" : "reflection";
  const promptTemplate = await loadPrompt(promptName);

  const ctx = await loadAgentContext(supabase, input.userId, input.agentId);
  const recentHypomnema = await loadRecentHypomnema(supabase, input.userId, input.agentId);

  // Try to resolve the user's display name; fall back to "the user".
  let userName = "the user";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (prof?.display_name) {
      userName = String(prof.display_name).trim() || "the user";
    }
  } catch (_err) { /* best effort */ }

  const vars: Record<string, string> = {
    AGENT_NAME: ctx.agentName,
    USER: userName,
    INJECT_AGENT_SOUL: ctx.soul || "(soul unavailable)",
    INJECT_IDENTITY_STACK_SUMMARY: ctx.identitySummary,
    INJECT_RECENT_HYPOMNEMA: recentHypomnema,
    INJECT_RECENT_OBSERVER_HYPOMNEMA: recentHypomnema,
    INJECT_EMOTIONAL_STATE: ctx.emotionalSummary,
    INJECT_USER_MESSAGE: clampStr(input.userMessage, MAX_TURN_CHARS),
    INJECT_AGENT_RESPONSE: clampStr(input.agentResponse, MAX_TURN_CHARS),
    INJECT_RECENT_TURNS: fmtRecentTurns(input.recentTurns),
  };

  if (input.density === "observer") {
    vars.PRIMARY_AGENT_NAME = input.primaryAgentName || "the primary agent";
    vars.INJECT_PRIMARY_RESPONSE = clampStr(input.primaryResponse || input.agentResponse, MAX_TURN_CHARS);
    vars.INJECT_YOUR_CONTRIBUTION = clampStr(
      input.yourContribution || "(your contribution wasn't captured separately for this turn)",
      MAX_TURN_CHARS,
    );
  }

  const systemPrompt = fillPlaceholders(promptTemplate, vars);

  const userContent =
    input.density === "observer"
      ? "Write your observer note for this turn. JSON only as specified."
      : "Write your hypomnema entry for this turn. JSON only as specified.";

  const model = input.density === "observer" ? WRITE_MODEL_OBSERVER : WRITE_MODEL_PRIMARY;
  const maxTokens = input.density === "observer" ? 400 : 800;

  let text = "";
  try {
    const result = await callOpenRouter({
      apiKey,
      model,
      systemPrompt,
      userContent,
      timeoutMs: WRITE_TIMEOUT_MS,
      maxTokens,
      temperature: 0.65,
    });
    text = result.text;
  } catch (err) {
    const recovery = await writeRecoveryHypomnemaEntry(supabase, apiKey, input, err);
    if (recovery.status !== "error") return recovery;
    return {
      status: "error",
      reason: `openrouter call failed after retries: ${(err as Error).message}; ${recovery.reason}`,
    };
  }

  const parsed = extractJson(text) as ReflectionPayload | ObserverPayload | null;
  if (!parsed) {
    return { status: "error", reason: "could not parse JSON from model output", raw: text };
  }

  if (parsed.skip === true) {
    return { status: "skipped", reason: parsed.reason || "model returned skip:true", raw: text };
  }

  const content = (parsed.content || "").trim();
  if (!content) {
    return { status: "error", reason: "model returned no content", raw: text };
  }

  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.7;
  const domain = typeof parsed.domain === "string" && parsed.domain.trim() ? parsed.domain.trim() : null;
  const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map((t) => String(t).slice(0, 40)) : [];
  const revisesId = (parsed as ReflectionPayload).revises_existing_id || null;

  // Revision path
  if (revisesId && input.density === "primary") {
    const { data: existing, error: exErr } = await supabase
      .from("hypomnema_entry")
      .select("id, content, confidence, revisions, revision_count, thread_id, source_message_id, meta")
      .eq("id", revisesId)
      .eq("user_id", input.userId)
      .eq("agent_id", input.agentId)
      .maybeSingle();
    if (exErr) {
      return { status: "error", reason: `revision lookup failed: ${exErr.message}`, raw: text };
    }
    if (existing) {
      const oldConfidence = existing.confidence ?? 0;
      const reason = (parsed as ReflectionPayload).revision_reason || "";
      const newRevisions = [
        ...(Array.isArray(existing.revisions) ? existing.revisions : []),
        {
          old_confidence: oldConfidence,
          new_confidence: confidence,
          previous_content: existing.content,
          previous_thread_id: existing.thread_id ?? null,
          previous_source_message_id: existing.source_message_id ?? null,
          source_thread_id: input.threadId,
          source_message_id: input.sourceMessageId,
          reason,
          timestamp: new Date().toISOString(),
        },
      ];
      const existingMeta = existing.meta && typeof existing.meta === "object" && !Array.isArray(existing.meta)
        ? existing.meta
        : {};
      const { error: upErr } = await supabase
        .from("hypomnema_entry")
        .update({
          thread_id: input.threadId ?? existing.thread_id ?? null,
          source_message_id: input.sourceMessageId ?? existing.source_message_id ?? null,
          content,
          confidence,
          domain,
          tags,
          revisions: newRevisions,
          revision_count: (existing.revision_count ?? 0) + 1,
          last_revised: new Date().toISOString(),
          active_attention: true,
          source: "reflection",
          meta: {
            ...existingMeta,
            last_revision_source: {
              thread_id: input.threadId,
              source_message_id: input.sourceMessageId,
            },
          },
        })
        .eq("id", revisesId);
      if (upErr) {
        return { status: "error", reason: `revision update failed: ${upErr.message}`, raw: text };
      }
      return { status: "revised", entryId: revisesId };
    }
    // fall through to insert if revision target was missing/invalid
  }

  const insertRow = {
    user_id: input.userId,
    agent_id: input.agentId,
    thread_id: input.threadId,
    source_message_id: input.sourceMessageId,
    content,
    density: input.density,
    primary_in_thread: input.primaryInThread,
    domain,
    tags,
    confidence,
    source: input.density === "observer" ? "observer" : "reflection",
    active_attention: true,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("hypomnema_entry")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr || !inserted) {
    return { status: "error", reason: `insert failed: ${insErr?.message || "unknown"}`, raw: text };
  }

  const entryId = inserted.id as string;

  // Embedding (M4) — best-effort post-insert. NULL on failure; backfill picks up.
  await embedHypomnemaEntry(supabase, apiKey, entryId, domain, content);

  return { status: "wrote", entryId };
}

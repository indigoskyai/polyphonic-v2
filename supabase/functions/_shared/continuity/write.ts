import {
  finalizePendingRevisions,
  type PendingRevision,
} from "../agents/pending-revisions.ts";
import { isDialecticEnabled } from "../config.ts";
import { detectContinuityCarrySignal } from "../hypomnema/salience.ts";
import { MnemosEngine } from "../mnemos/engine.ts";
import {
  appendContinuityTraceOperation,
  type ContinuityTraceStatus,
} from "./trace.ts";

type SupabaseLike = {
  from: (table: string) => any;
  rpc?: (fn: string, params?: Record<string, unknown>) => any;
};

export type ContinuityWriteStatus = "queued" | "skipped" | "error";

export type MnemosEncodeDecision = "queued" | "encoded" | "skipped" | "failed";

export interface MnemosEncodeOperationDetail {
  decision: MnemosEncodeDecision;
  agent_id: string;
  salience?: number;
  skip_reason?: string;
  force_reason?: string;
  engram_id?: string | null;
  source_message_id?: string | null;
  error?: string;
}

export interface ContinuityWriteOperation {
  name:
    | "pending_revisions"
    | "mnemos_encode"
    | "observer_watch"
    | "mnemos_dialectic"
    | "skills_distill"
    | "hypomnema_gate"
    | "thread_agent_metadata";
  status: ContinuityWriteStatus;
  reason?: string;
  detail?: Record<string, unknown>;
}

export interface ContinuityObserverContribution {
  agentId: string;
  contribution: string;
}

export interface ContinuityWriteOptions {
  supabase: SupabaseLike;
  userId: string;
  threadId: string;
  agentId?: string;
  userMessage: string;
  agentResponse: string;
    sourceMessageId?: string | null;
    apiKey?: string | null;
    authHeader?: string;
    runtimeProfile?: "classic" | "agent";
    memoryAgentIds?: string[];
    pendingRevisions?: PendingRevision[];
  recentTurns?: Array<{ role: string; content: string }>;
  observers?: ContinuityObserverContribution[];
  traceId?: string | null;
}

export interface ContinuityWriteReport {
  userId: string;
  threadId: string;
  agentId: string;
  operations: ContinuityWriteOperation[];
}

export interface MnemosExchangeEncodingContext {
  tags: string[];
  source_context: Record<string, unknown>;
}

export interface ContinuityWriteDeps {
  fetch?: typeof fetch;
  env?: (name: string) => string | undefined;
  log?: (message: string, detail?: unknown) => void;
  warn?: (message: string, detail?: unknown) => void;
  finalizePendingRevisions?: typeof finalizePendingRevisions;
  encodeMnemosExchange?: (
    supabase: SupabaseLike,
    userId: string,
    agentId: string,
    userMessage: string,
    assistantResponse: string,
    apiKey?: string,
    recentTurns?: Array<{ role: string; content: string }>,
    sourceMessageId?: string | null,
    threadId?: string | null,
  ) => Promise<unknown> | unknown;
  updateThreadAgentMetadata?: typeof updateThreadAgentMetadata;
}

export function queueContinuityTurnWrites(
  opts: ContinuityWriteOptions,
  deps: ContinuityWriteDeps = {},
): ContinuityWriteReport {
    const agentId = normalizeRequiredAgentId(opts.agentId);
    const runtimeProfile = opts.runtimeProfile === "classic" ? "classic" : "agent";
    const quietClassic = runtimeProfile === "classic";
    const memoryAgentIds = agentId ? normalizeMemoryAgentIds(agentId, opts.memoryAgentIds) : [];
    const operations: ContinuityWriteOperation[] = [];
  const log = deps.log || ((message: string, detail?: unknown) => console.log(message, detail ?? ""));
  const warn = deps.warn || ((message: string, detail?: unknown) => console.warn(message, detail ?? ""));

  const record = (operation: ContinuityWriteOperation) => {
    operations.push(operation);
  };

  const appendTrace = (
    name: ContinuityWriteOperation["name"],
    status: ContinuityTraceStatus,
    reason?: string,
    detail?: Record<string, unknown>,
  ) => {
    if (!opts.traceId) return;
    appendContinuityTraceOperation(opts.supabase, opts.traceId, {
      name,
      status,
      reason: reason ?? null,
      detail: {
        ...(detail || {}),
        thread_id: opts.threadId,
        agent_id: agentId ?? null,
        source_message_id: opts.sourceMessageId ?? null,
      },
    }).catch((err) => warn(`[continuity.write] trace append failed for ${name}`, err));
  };

  const queue = (
    name: ContinuityWriteOperation["name"],
    enabled: boolean,
    reason: string,
    work: () => Promise<unknown> | unknown,
    detail?: Record<string, unknown>,
  ) => {
    if (!enabled) {
      record({ name, status: "skipped", reason });
      appendTrace(name, "skipped", reason, detail);
      return;
    }
    try {
      record({ name, status: "queued", detail });
      appendTrace(name, "queued", undefined, detail);
      Promise.resolve(work()).then((result) => {
        const resolved = summarizeResolvedTraceOperation(name, result);
        appendTrace(name, resolved.status, resolved.reason, resolved.detail);
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        appendTrace(name, "failed", message, detail);
        warn(`[continuity.write] ${name} failed`, err);
      });
    } catch (err) {
      record({ name, status: "error", reason: err instanceof Error ? err.message : String(err) });
      appendTrace(name, "failed", err instanceof Error ? err.message : String(err), detail);
      warn(`[continuity.write] ${name} failed`, err);
    }
  };

  const hasTurn = Boolean(opts.userMessage?.trim() && opts.agentResponse?.trim());
  const pendingRevisions = opts.pendingRevisions || [];
  const apiKey = opts.apiKey || "";
  const dialecticEnabled = isDialecticEnabled(opts.userId, (name) => readEnv(name, deps));

    queue(
      "pending_revisions",
      !quietClassic && dialecticEnabled && hasTurn && pendingRevisions.length > 0 && Boolean(apiKey),
      quietClassic ? "classic quiet runtime" : !dialecticEnabled ? "dialectic disabled" : pendingRevisions.length === 0 ? "no pending revisions" : apiKey ? "empty turn" : "no api key",
    () => (deps.finalizePendingRevisions || finalizePendingRevisions)(
      opts.supabase,
      apiKey,
      pendingRevisions,
      opts.agentResponse,
    ),
  );

    queue(
      "mnemos_encode",
      hasTurn && memoryAgentIds.length > 0,
      !hasTurn ? "empty turn" : "no agent id",
      () => Promise.all(memoryAgentIds.map((memoryAgentId) =>
        (deps.encodeMnemosExchange || encodeMnemosExchange)(
          opts.supabase,
          opts.userId,
          memoryAgentId,
          opts.userMessage,
          opts.agentResponse,
          apiKey || undefined,
          stripCurrentTurnFromRecentTurns(opts.recentTurns || [], opts.userMessage, opts.agentResponse),
          opts.sourceMessageId ?? null,
          opts.threadId,
        )
      )),
      {
        decision: "queued",
        agent_ids: memoryAgentIds,
        source_message_id: opts.sourceMessageId ?? null,
      },
    );

    queue(
      "observer_watch",
      !quietClassic && hasTurn && Boolean(agentId) && agentId !== "observer" && Boolean(opts.authHeader),
      quietClassic ? "classic quiet runtime" : !agentId ? "no agent id" : agentId === "observer" ? "observer self-thread" : opts.authHeader ? "empty turn" : "no auth header",
    () => dispatchFunction("observer-watch", {
      thread_id: opts.threadId,
      agent_id: agentId,
      source_message_id: opts.sourceMessageId ?? null,
    }, opts.authHeader || "", deps),
  );

    queue(
      "mnemos_dialectic",
      !quietClassic && dialecticEnabled && hasTurn && Boolean(agentId) && agentId !== "observer" && Boolean(opts.authHeader),
      quietClassic ? "classic quiet runtime" : !dialecticEnabled ? "dialectic disabled" : !agentId ? "no agent id" : agentId === "observer" ? "observer self-thread" : opts.authHeader ? "empty turn" : "no auth header",
    () => dispatchFunction("mnemos-dialectic", {
      thread_id: opts.threadId,
      agent_id: agentId,
      source_message_id: opts.sourceMessageId ?? null,
    }, opts.authHeader || "", deps),
  );

  // Self-model distillation runs for ALL agents now (was Luca-only). Each
  // agent builds its own self-model from conversations with the user. The
  // distiller's system prompt is tuned per-agent inside the function.
    queue(
      "skills_distill",
      !quietClassic && hasTurn && Boolean(agentId) && Boolean(opts.authHeader),
      quietClassic ? "classic quiet runtime" : !agentId ? "no agent id" : opts.authHeader ? "empty turn" : "no auth header",
    () => dispatchFunction("skills-distill", {
      thread_id: opts.threadId,
      agent_id: agentId,
      source_message_id: opts.sourceMessageId ?? null,
    }, opts.authHeader || "", deps),
  );

    queue(
      "hypomnema_gate",
      !quietClassic && hasTurn && Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY", deps)),
      quietClassic ? "classic quiet runtime" : readEnv("SUPABASE_SERVICE_ROLE_KEY", deps) ? "empty turn" : "no service role",
    () => dispatchHypomnemaGate(opts, deps),
  );

    const participating = [agentId, ...(opts.observers || []).map((o) => o.agentId)]
      .filter((id): id is string => Boolean(id));
    const metadataAgentId = agentId;
    queue(
      "thread_agent_metadata",
      !quietClassic && Boolean(opts.threadId) && Boolean(metadataAgentId),
      quietClassic ? "classic quiet runtime" : !metadataAgentId ? "no agent id" : "no thread id",
    () => {
      if (!metadataAgentId) return Promise.resolve();
      return (deps.updateThreadAgentMetadata || updateThreadAgentMetadata)(
        opts.supabase,
        opts.threadId,
        metadataAgentId,
        participating,
      );
    },
  );

  const report = { userId: opts.userId, threadId: opts.threadId, agentId: agentId ?? "", operations };
  log("[continuity.write] queued turn finalization", summarizeWriteReport(report));
  return report;
}

function summarizeResolvedTraceOperation(
  name: ContinuityWriteOperation["name"],
  result: unknown,
): { status: ContinuityTraceStatus; reason?: string; detail?: Record<string, unknown> } {
  if (name !== "mnemos_encode") {
    return { status: "written_after_turn", detail: summarizeUnknownTraceResult(result) };
  }

  const details = Array.isArray(result) ? result : [result];
  const mnemosDetails = details
    .filter((detail): detail is MnemosEncodeOperationDetail => Boolean(detail && typeof detail === "object"))
    .map((detail) => detail as MnemosEncodeOperationDetail);
  const decisions = mnemosDetails.map((detail) => detail.decision);
  const hasEncoded = decisions.includes("encoded");
  const hasFailed = decisions.includes("failed");
  const allSkipped = decisions.length > 0 && decisions.every((decision) => decision === "skipped");
  const status: ContinuityTraceStatus = hasEncoded
    ? "written_after_turn"
    : hasFailed
      ? "failed"
      : allSkipped
        ? "skipped"
        : "written_after_turn";
  return {
    status,
    reason: allSkipped ? firstString(mnemosDetails.map((detail) => detail.skip_reason)) ?? "low salience" : undefined,
    detail: {
      decisions,
      engram_ids: mnemosDetails.map((detail) => detail.engram_id).filter(Boolean),
      agent_ids: mnemosDetails.map((detail) => detail.agent_id).filter(Boolean),
      salience: firstNumber(mnemosDetails.map((detail) => detail.salience)),
      skip_reason: firstString(mnemosDetails.map((detail) => detail.skip_reason)),
      force_reason: firstString(mnemosDetails.map((detail) => detail.force_reason)),
      error: firstString(mnemosDetails.map((detail) => detail.error)),
    },
  };
}

function summarizeUnknownTraceResult(result: unknown): Record<string, unknown> {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        output[key] = value;
      }
    }
    return output;
  }
  return {};
}

function firstString(values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function firstNumber(values: Array<number | null | undefined>): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export async function encodeMnemosExchange(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  userMessage: string,
  assistantResponse: string,
  apiKey?: string,
  recentTurns: Array<{ role: string; content: string }> = [],
  sourceMessageId?: string | null,
  threadId?: string | null,
): Promise<MnemosEncodeOperationDetail> {
  const resolvedAgentId = normalizeRequiredAgentId(agentId);
  if (!resolvedAgentId) {
    return {
      decision: "failed",
      agent_id: "",
      source_message_id: sourceMessageId ?? null,
      error: "missing agent id",
    };
  }

  const mnemos = new MnemosEngine(supabase as any, userId, resolvedAgentId);
  const encoding = deriveMnemosExchangeEncodingContext(userMessage, assistantResponse, recentTurns);
  try {
    const result = await mnemos.encode(
      `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
      {
        engram_type: "episodic",
        tags: encoding.tags,
        source_context: {
          ...encoding.source_context,
          agent_id: resolvedAgentId,
          source_message_id: sourceMessageId ?? null,
          thread_id: threadId ?? null,
        },
        api_key: apiKey,
      },
    );
    const detail: MnemosEncodeOperationDetail = {
      decision: result.skipped ? "skipped" : "encoded",
      agent_id: resolvedAgentId,
      salience: result.salience,
      skip_reason: result.skip_reason,
      force_reason: result.skip_reason?.startsWith("forcing_tag:") ? result.skip_reason : undefined,
      engram_id: result.engram?.id ?? null,
      source_message_id: sourceMessageId ?? null,
    };
    await recordContinuityEncodeEvent(supabase, userId, resolvedAgentId, threadId ?? null, detail);
    return detail;
  } catch (err) {
    const detail: MnemosEncodeOperationDetail = {
      decision: "failed",
      agent_id: resolvedAgentId,
      source_message_id: sourceMessageId ?? null,
      error: err instanceof Error ? err.message : String(err),
    };
    await recordContinuityEncodeEvent(supabase, userId, resolvedAgentId, threadId ?? null, detail).catch(() => {});
    return detail;
  }
}

async function recordContinuityEncodeEvent(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  threadId: string | null,
  detail: MnemosEncodeOperationDetail,
): Promise<void> {
  const eventType = detail.decision === "encoded"
    ? "encode_encoded"
    : detail.decision === "skipped"
      ? "encode_skipped"
      : detail.decision === "failed"
        ? "encode_failed"
        : "encode_queued";
  await supabase.from("continuity_events").insert({
    user_id: userId,
    agent_id: agentId,
    thread_id: threadId,
    event_type: eventType,
    subject_type: "engram",
    subject_id: detail.engram_id ?? null,
    metadata: {
      salience: detail.salience ?? null,
      skip_reason: detail.skip_reason ?? null,
      force_reason: detail.force_reason ?? null,
      source_message_id: detail.source_message_id ?? null,
      error: detail.error ?? null,
    },
  });
}

export function deriveMnemosExchangeEncodingContext(
  userMessage: string,
  assistantResponse: string,
  recentTurns: Array<{ role: string; content: string }> = [],
): MnemosExchangeEncodingContext {
  const continuityCarryReason = detectContinuityCarrySignal({
    userMessage,
    agentResponse: assistantResponse,
    recentTurns,
  });

  if (!continuityCarryReason) {
    return {
      tags: ["conversation"],
      source_context: { type: "chat_exchange" },
    };
  }

  return {
    tags: ["conversation", "continuity", "felt-continuity", "continuity-carry"],
    source_context: {
      type: "chat_exchange",
      continuity_carry_reason: continuityCarryReason,
    },
  };
}

function normalizeTurnContent(content: string | undefined | null): string {
  return (content || "").trim().replace(/\s+/g, " ");
}

export function stripCurrentTurnFromRecentTurns(
  turns: Array<{ role: string; content: string }> = [],
  userMessage: string,
  agentResponse: string,
): Array<{ role: string; content: string }> {
  const filtered = turns.filter((t) => t && (t.role === "user" || t.role === "assistant"));
  const next = filtered.slice();
  const userNorm = normalizeTurnContent(userMessage);
  const responseNorm = normalizeTurnContent(agentResponse);

  const trimTrailing = (role: "user" | "assistant", contentNorm: string) => {
    if (!contentNorm || next.length === 0) return;
    const tail = next[next.length - 1];
    if (tail.role === role && normalizeTurnContent(tail.content) === contentNorm) {
      next.pop();
    }
  };

  // Some callers pass history that already includes the live turn. Remove only
  // trailing exact matches so a legitimate earlier "yes" or repeated answer
  // remains available as context.
  trimTrailing("assistant", responseNorm);
  trimTrailing("user", userNorm);
  trimTrailing("assistant", responseNorm);

  return next.slice(-6);
}

function normalizeMemoryAgentIds(agentId: string, memoryAgentIds?: string[]): string[] {
  const ids = (memoryAgentIds && memoryAgentIds.length > 0 ? memoryAgentIds : [agentId])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return [...new Set(ids.length > 0 ? ids : [agentId])];
}

function normalizeRequiredAgentId(agentId: string | null | undefined): string | null {
  const normalized = String(agentId ?? "").trim();
  return normalized || null;
}

export function buildHypomnemaGatePayload(opts: ContinuityWriteOptions): Record<string, unknown> {
  const agentId = normalizeRequiredAgentId(opts.agentId);
  if (!agentId) {
    throw new Error("missing agent id");
  }
  const chainTargets: Array<Record<string, unknown>> = [
    {
      agent_id: agentId,
      thread_id: opts.threadId,
      source_message_id: opts.sourceMessageId ?? null,
      density: "primary",
      primary_in_thread: true,
    },
  ];

  for (const obs of opts.observers || []) {
    if (obs.agentId === agentId) continue;
    chainTargets.push({
      agent_id: obs.agentId,
      thread_id: opts.threadId,
      source_message_id: opts.sourceMessageId ?? null,
      density: "observer",
      primary_in_thread: false,
      primary_agent_name: agentId,
      primary_response: opts.agentResponse,
      your_contribution: obs.contribution,
    });
  }

  return {
    user_id: opts.userId,
    user_message: opts.userMessage,
    agent_response: opts.agentResponse,
    recent_turns: stripCurrentTurnFromRecentTurns(
      opts.recentTurns || [],
      opts.userMessage,
      opts.agentResponse,
    ),
    chain_write: chainTargets,
  };
}

async function dispatchHypomnemaGate(
  opts: ContinuityWriteOptions,
  deps: ContinuityWriteDeps,
): Promise<void> {
  const url = `${readEnv("SUPABASE_URL", deps)}/functions/v1/hypomnema-gate`;
  const serviceRole = readEnv("SUPABASE_SERVICE_ROLE_KEY", deps);
  if (!serviceRole || !url.startsWith("http")) throw new Error("missing Supabase service env");
  await dispatchJson(url, `Bearer ${serviceRole}`, buildHypomnemaGatePayload(opts), deps);
}

async function dispatchFunction(
  target: string,
  body: Record<string, unknown>,
  authHeader: string,
  deps: ContinuityWriteDeps,
): Promise<void> {
  const baseUrl = readEnv("SUPABASE_URL", deps);
  if (!baseUrl) throw new Error("missing SUPABASE_URL");
  await dispatchJson(`${baseUrl}/functions/v1/${target}`, authHeader, body, deps);
}

async function dispatchJson(
  url: string,
  authorization: string,
  body: Record<string, unknown>,
  deps: ContinuityWriteDeps,
): Promise<void> {
  const fetchImpl = deps.fetch || fetch;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`dispatch ${url} failed ${response.status}: ${text.slice(0, 240)}`);
  }
}

async function updateThreadAgentMetadata(
  supabase: SupabaseLike,
  threadId: string,
  primaryAgentId: string,
  participatingAgentIds: string[],
): Promise<void> {
  const unique = [...new Set([primaryAgentId, ...participatingAgentIds])];
  const { data: current } = await supabase
    .from("threads")
    .select("participating_agent_ids, primary_agent_id")
    .eq("id", threadId)
    .maybeSingle();
  const existing = Array.isArray(current?.participating_agent_ids) ? current.participating_agent_ids : [];
  const merged = [...new Set([...existing, ...unique])];
  const update: Record<string, unknown> = { participating_agent_ids: merged };
  if (!current?.primary_agent_id || current.primary_agent_id === "luca" && primaryAgentId !== "luca") {
    update.primary_agent_id = primaryAgentId;
  }
  await supabase.from("threads").update(update).eq("id", threadId);
}

function readEnv(name: string, deps: ContinuityWriteDeps): string | undefined {
  if (deps.env) return deps.env(name);
  const maybeDeno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return maybeDeno?.env?.get?.(name);
}

function summarizeWriteReport(report: ContinuityWriteReport): string {
  return report.operations
    .map((op) => `${op.name}=${op.status}${op.reason ? `(${op.reason})` : ""}`)
    .join(" ");
}

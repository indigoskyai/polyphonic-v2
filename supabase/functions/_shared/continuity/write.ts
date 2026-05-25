import {
  finalizePendingRevisions,
  type PendingRevision,
} from "../agents/pending-revisions.ts";
import { isDialecticEnabled } from "../config.ts";
import { MnemosEngine } from "../mnemos/engine.ts";

type SupabaseLike = {
  from: (table: string) => any;
};

export type ContinuityWriteStatus = "queued" | "skipped" | "error";

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
  pendingRevisions?: PendingRevision[];
  recentTurns?: Array<{ role: string; content: string }>;
  observers?: ContinuityObserverContribution[];
}

export interface ContinuityWriteReport {
  userId: string;
  threadId: string;
  agentId: string;
  operations: ContinuityWriteOperation[];
}

export interface ContinuityWriteDeps {
  fetch?: typeof fetch;
  env?: (name: string) => string | undefined;
  log?: (message: string, detail?: unknown) => void;
  warn?: (message: string, detail?: unknown) => void;
  finalizePendingRevisions?: typeof finalizePendingRevisions;
  encodeMnemosExchange?: typeof encodeMnemosExchange;
  updateThreadAgentMetadata?: typeof updateThreadAgentMetadata;
}

export function queueContinuityTurnWrites(
  opts: ContinuityWriteOptions,
  deps: ContinuityWriteDeps = {},
): ContinuityWriteReport {
  const agentId = opts.agentId || "luca";
  const operations: ContinuityWriteOperation[] = [];
  const log = deps.log || ((message: string, detail?: unknown) => console.log(message, detail ?? ""));
  const warn = deps.warn || ((message: string, detail?: unknown) => console.warn(message, detail ?? ""));

  const record = (operation: ContinuityWriteOperation) => {
    operations.push(operation);
  };

  const queue = (
    name: ContinuityWriteOperation["name"],
    enabled: boolean,
    reason: string,
    work: () => Promise<unknown> | unknown,
  ) => {
    if (!enabled) {
      record({ name, status: "skipped", reason });
      return;
    }
    try {
      Promise.resolve(work()).catch((err) => {
        warn(`[continuity.write] ${name} failed`, err);
      });
      record({ name, status: "queued" });
    } catch (err) {
      record({ name, status: "error", reason: err instanceof Error ? err.message : String(err) });
      warn(`[continuity.write] ${name} failed`, err);
    }
  };

  const hasTurn = Boolean(opts.userMessage?.trim() && opts.agentResponse?.trim());
  const pendingRevisions = opts.pendingRevisions || [];
  const apiKey = opts.apiKey || "";
  const dialecticEnabled = isDialecticEnabled(opts.userId, (name) => readEnv(name, deps));

  queue(
    "pending_revisions",
    dialecticEnabled && hasTurn && pendingRevisions.length > 0 && Boolean(apiKey),
    !dialecticEnabled ? "dialectic disabled" : pendingRevisions.length === 0 ? "no pending revisions" : apiKey ? "empty turn" : "no api key",
    () => (deps.finalizePendingRevisions || finalizePendingRevisions)(
      opts.supabase,
      apiKey,
      pendingRevisions,
      opts.agentResponse,
    ),
  );

  queue(
    "mnemos_encode",
    hasTurn,
    "empty turn",
    () => (deps.encodeMnemosExchange || encodeMnemosExchange)(
      opts.supabase,
      opts.userId,
      agentId,
      opts.userMessage,
      opts.agentResponse,
      apiKey || undefined,
    ),
  );

  queue(
    "observer_watch",
    hasTurn && agentId !== "observer" && Boolean(opts.authHeader),
    agentId === "observer" ? "observer self-thread" : opts.authHeader ? "empty turn" : "no auth header",
    () => dispatchFunction("observer-watch", {
      thread_id: opts.threadId,
      agent_id: agentId,
    }, opts.authHeader || "", deps),
  );

  queue(
    "mnemos_dialectic",
    dialecticEnabled && hasTurn && agentId === "luca" && Boolean(opts.authHeader),
    !dialecticEnabled ? "dialectic disabled" : agentId !== "luca" ? "non-luca agent" : opts.authHeader ? "empty turn" : "no auth header",
    () => dispatchFunction("mnemos-dialectic", {
      thread_id: opts.threadId,
      agent_id: agentId,
    }, opts.authHeader || "", deps),
  );

  // Self-model distillation runs for ALL agents now (was Luca-only). Each
  // agent builds its own self-model from conversations with the user. The
  // distiller's system prompt is tuned per-agent inside the function.
  queue(
    "skills_distill",
    hasTurn && Boolean(agentId) && Boolean(opts.authHeader),
    !agentId ? "no agent id" : opts.authHeader ? "empty turn" : "no auth header",
    () => dispatchFunction("skills-distill", {
      thread_id: opts.threadId,
      agent_id: agentId,
    }, opts.authHeader || "", deps),
  );

  queue(
    "hypomnema_gate",
    hasTurn && Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY", deps)),
    readEnv("SUPABASE_SERVICE_ROLE_KEY", deps) ? "empty turn" : "no service role",
    () => dispatchHypomnemaGate(opts, deps),
  );

  const participating = [agentId, ...(opts.observers || []).map((o) => o.agentId)];
  queue(
    "thread_agent_metadata",
    Boolean(opts.threadId),
    "no thread id",
    () => (deps.updateThreadAgentMetadata || updateThreadAgentMetadata)(
      opts.supabase,
      opts.threadId,
      agentId,
      participating,
    ),
  );

  const report = { userId: opts.userId, threadId: opts.threadId, agentId, operations };
  log("[continuity.write] queued turn finalization", summarizeWriteReport(report));
  return report;
}

export async function encodeMnemosExchange(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  userMessage: string,
  assistantResponse: string,
  apiKey?: string,
): Promise<void> {
  const mnemos = new MnemosEngine(supabase as any, userId, agentId || "luca");
  await mnemos.encode(
    `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
    {
      engram_type: "episodic",
      tags: ["conversation"],
      source_context: { type: "chat_exchange" },
      api_key: apiKey,
    },
  );
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

export function buildHypomnemaGatePayload(opts: ContinuityWriteOptions): Record<string, unknown> {
  const agentId = opts.agentId || "luca";
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

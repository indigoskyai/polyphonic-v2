import type {
  AutonomousMemoryArtifactsResult,
  ContinuityPacket,
  ContinuityHistoryMessage,
  FunctionalMemory,
} from "./kernel.ts";
import { sanitizeContinuityBoundaryText } from "./exclusions.ts";

type SupabaseLike = {
  from: (table: string) => any;
  rpc?: (fn: string, params?: Record<string, unknown>) => any;
};

export type ContinuityTraceLayerKey =
  | "thread_history"
  | "hypomnema"
  | "mnemos_recall"
  | "functional_memory"
  | "autonomous_context"
  | "beliefs";

export type ContinuityTraceStatus =
  | "available"
  | "retrieved"
  | "written_after_turn"
  | "queued"
  | "skipped"
  | "failed"
  | "empty";

export interface ContinuityTraceItem {
  id?: string | null;
  status: ContinuityTraceStatus;
  excerpt?: string | null;
  score?: number | null;
  confidence?: number | null;
  activation?: number | null;
  timestamp?: string | null;
  agent_id?: string | null;
  thread_id?: string | null;
  source_message_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ContinuityTraceLayer {
  key: ContinuityTraceLayerKey;
  label: string;
  status: ContinuityTraceStatus;
  count: number;
  rendered?: number;
  items: ContinuityTraceItem[];
  note?: string | null;
}

export interface ContinuityTraceContextSummary {
  schema_version: 1;
  generated_at: string;
  agent_id: string;
  thread_id: string | null;
  focus: string | null;
  safety_note: string;
  layers: ContinuityTraceLayer[];
  diagnostics: Array<{
    layer: string;
    status: string;
    count: number | null;
    rendered: number | null;
    message: string | null;
    duration_ms: number;
  }>;
}

export interface ContinuityTraceWriteOperation {
  layer?: "after_turn_writes";
  name: string;
  status: ContinuityTraceStatus;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  recorded_at?: string;
}

export interface RecordContinuityTurnTraceInput {
  userId: string;
  threadId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  agentId: string;
  model?: string | null;
  runtimeMode?: string | null;
  continuity: ContinuityPacket;
  autonomousMemory?: AutonomousMemoryArtifactsResult | null;
}

const EXCERPT_LIMIT = 220;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk-or-v1-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{16,}|or-[A-Za-z0-9_-]{16,})\b/g, "[api key]"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  [/\b(?:bearer|token|api[_-]?key|secret|password)\s*[:=]\s*["']?[^"'\s]{8,}/gi, "[secret]"],
];

export function buildContinuityTraceContext(
  packet: ContinuityPacket,
  autonomousMemory?: AutonomousMemoryArtifactsResult | null,
): ContinuityTraceContextSummary {
  const layers: ContinuityTraceLayer[] = [
    buildThreadHistoryLayer(packet.history, packet.threadId ?? null, packet.agentId),
    buildHypomnemaLayer(packet),
    buildMnemosLayer(packet),
    buildFunctionalMemoryLayer(packet.functionalMemories, packet.agentId, packet.threadId ?? null),
    buildAutonomousLayer(autonomousMemory, packet.agentId, packet.threadId ?? null),
    buildBeliefsLayer(packet),
  ];

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    agent_id: packet.agentId,
    thread_id: packet.threadId ?? null,
    focus: excerpt(packet.query, 160) || null,
    safety_note: "Continuity Trace shows sanitized context availability and memory write outcomes. It does not include private reasoning, raw prompts, hidden instructions, or API keys.",
    layers,
    diagnostics: packet.diagnostics.map((diagnostic) => ({
      layer: diagnostic.layer,
      status: diagnostic.status,
      count: diagnostic.count ?? null,
      rendered: diagnostic.rendered ?? null,
      message: diagnostic.message ? excerpt(diagnostic.message, 180) : null,
      duration_ms: diagnostic.durationMs,
    })),
  };
}

export async function recordContinuityTurnTrace(
  supabase: SupabaseLike,
  input: RecordContinuityTurnTraceInput,
): Promise<string | null> {
  const contextSummary = buildContinuityTraceContext(input.continuity, input.autonomousMemory ?? null);
  const { data, error } = await supabase
    .from("continuity_turn_traces")
    .insert({
      user_id: input.userId,
      thread_id: input.threadId,
      user_message_id: input.userMessageId ?? null,
      assistant_message_id: input.assistantMessageId ?? null,
      agent_id: input.agentId || input.continuity.agentId || "luca",
      model: input.model ?? null,
      runtime_mode: input.runtimeMode ?? null,
      context_summary: contextSummary,
      write_summary: { operations: [] },
      status: "captured",
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[continuity.trace] capture failed:", error.message || error);
    return null;
  }

  return typeof data?.id === "string" ? data.id : null;
}

export async function appendContinuityTraceOperation(
  supabase: SupabaseLike,
  traceId: string | null | undefined,
  operation: ContinuityTraceWriteOperation,
): Promise<void> {
  if (!traceId) return;
  const payload = sanitizeTraceWriteOperation(operation);
  if (typeof supabase.rpc === "function") {
    const { error } = await supabase.rpc("append_continuity_trace_write", {
      p_trace_id: traceId,
      p_operation: payload,
    });
    if (error) throw new Error(error.message || "append_continuity_trace_write failed");
  }
}

export function sanitizeTraceWriteOperation(
  operation: ContinuityTraceWriteOperation,
): ContinuityTraceWriteOperation {
  return {
    layer: "after_turn_writes",
    name: String(operation.name || "unknown"),
    status: normalizeTraceStatus(operation.status),
    reason: operation.reason ? excerpt(operation.reason, 180) : null,
    detail: sanitizeRecord(operation.detail || {}),
    recorded_at: operation.recorded_at || new Date().toISOString(),
  };
}

function buildThreadHistoryLayer(
  history: ContinuityHistoryMessage[],
  threadId: string | null,
  agentId: string,
): ContinuityTraceLayer {
  const items = history.slice(-6).map((message) => ({
    id: message.id ?? null,
    status: "available" as const,
    excerpt: excerpt(message.content, EXCERPT_LIMIT),
    timestamp: message.created_at ?? null,
    agent_id: message.agent ?? agentId,
    thread_id: threadId,
    source_message_id: message.id ?? null,
    metadata: {
      role: message.role,
      kind: message.kind ?? null,
    },
  }));
  return {
    key: "thread_history",
    label: "Thread History",
    status: items.length > 0 ? "available" : "empty",
    count: history.length,
    rendered: items.length,
    items,
    note: items.length > 0 ? "Recent messages from this thread were available to Luca." : "No prior thread messages were available.",
  };
}

function buildHypomnemaLayer(packet: ContinuityPacket): ContinuityTraceLayer {
  const items = (packet.hypomnema.items || []).slice(0, 8).map((item) => ({
    id: item.id,
    status: "available" as const,
    excerpt: excerpt(item.excerpt, EXCERPT_LIMIT),
    score: normalizeNumber(item.score),
    confidence: normalizeNumber(item.confidence),
    timestamp: item.timestamp ?? null,
    agent_id: item.agent_id ?? packet.agentId,
    thread_id: item.thread_id ?? null,
    source_message_id: item.source_message_id ?? null,
    metadata: {
      domain: item.domain ?? null,
      density: item.density ?? null,
      source: item.source ?? null,
      tags: item.tags || [],
    },
  }));
  return {
    key: "hypomnema",
    label: "Hypomnema",
    status: items.length > 0 ? "available" : "empty",
    count: packet.hypomnema.count,
    rendered: packet.hypomnema.rendered,
    items,
    note: items.length > 0 ? "Active hypomnema entries were available as present continuity." : "No active hypomnema entries were rendered.",
  };
}

function buildMnemosLayer(packet: ContinuityPacket): ContinuityTraceLayer {
  const items = packet.mnemosResults.slice(0, 8).map((result) => ({
    id: result.engram?.id ?? null,
    status: "retrieved" as const,
    excerpt: excerpt(result.engram?.content || "", EXCERPT_LIMIT),
    activation: normalizeNumber(result.activation),
    score: normalizeNumber(result.activation),
    timestamp: result.engram?.updated_at ?? result.engram?.created_at ?? null,
    agent_id: result.engram?.agent_id ?? packet.agentId,
    thread_id: readString(result.engram?.source_context, "thread_id"),
    source_message_id: readString(result.engram?.source_context, "source_message_id"),
    metadata: {
      path: result.path ?? null,
      engram_type: result.engram?.engram_type ?? null,
      strength: normalizeNumber(result.engram?.strength),
      stability: normalizeNumber(result.engram?.stability),
      accessibility: normalizeNumber(result.engram?.accessibility),
      tags: result.engram?.tags || [],
    },
  })).filter((item) => Boolean(item.excerpt));
  return {
    key: "mnemos_recall",
    label: "Mnemos Recall",
    status: items.length > 0 ? "retrieved" : "empty",
    count: packet.mnemosResults.length,
    rendered: items.length,
    items,
    note: items.length > 0 ? "Associative Mnemos recall returned these engrams." : "No Mnemos engrams were retrieved for this query.",
  };
}

function buildFunctionalMemoryLayer(
  memories: FunctionalMemory[],
  agentId: string,
  threadId: string | null,
): ContinuityTraceLayer {
  const items = memories.slice(0, 8).map((memory) => ({
    id: memory.id,
    status: "retrieved" as const,
    excerpt: excerpt(memory.summary || memory.content, EXCERPT_LIMIT),
    confidence: normalizeNumber(memory.confidence),
    timestamp: memory.updated_at ?? memory.created_at ?? null,
    agent_id: readString(memory.provenance, "agent_id") ?? agentId,
    thread_id: readString(memory.provenance, "thread_id") ?? threadId,
    source_message_id: readString(memory.provenance, "source_message_id"),
    metadata: {
      memory_type: memory.memory_type,
      source: memory.source ?? null,
      tags: memory.tags || [],
      pinned: memory.pinned ?? null,
      needs_confirmation: memory.needs_confirmation ?? null,
    },
  })).filter((item) => Boolean(item.excerpt));
  return {
    key: "functional_memory",
    label: "Functional Memory",
    status: items.length > 0 ? "retrieved" : "empty",
    count: memories.length,
    rendered: items.length,
    items,
    note: items.length > 0 ? "Legacy durable memory records were available." : "No functional memory records were retrieved.",
  };
}

function buildAutonomousLayer(
  result: AutonomousMemoryArtifactsResult | null | undefined,
  agentId: string,
  threadId: string | null,
): ContinuityTraceLayer {
  if (!result) {
    return {
      key: "autonomous_context",
      label: "Autonomous Context",
      status: "skipped",
      count: 0,
      rendered: 0,
      items: [],
      note: "Autonomous memory search was not triggered for this turn.",
    };
  }
  const items = result.items.slice(0, 8).map((item) => ({
    id: item.id,
    status: "retrieved" as const,
    excerpt: excerpt(item.content, EXCERPT_LIMIT),
    score: normalizeNumber(item.score),
    timestamp: item.created_at ?? null,
    agent_id: item.agent_id ?? agentId,
    thread_id: threadId,
    source_message_id: null,
    metadata: {
      kind: item.kind,
      source: item.source,
      labels: item.labels || [],
    },
  }));
  return {
    key: "autonomous_context",
    label: "Autonomous Context",
    status: items.length > 0 ? "retrieved" : "empty",
    count: result.items.length,
    rendered: items.length,
    items,
    note: items.length > 0 ? "A focused autonomous memory sample was retrieved." : "Autonomous memory search ran but returned no items.",
  };
}

function buildBeliefsLayer(packet: ContinuityPacket): ContinuityTraceLayer {
  const items = packet.beliefs.slice(0, 8).map((belief, index) => ({
    id: `belief:${index}`,
    status: "available" as const,
    excerpt: excerpt(belief.content, EXCERPT_LIMIT),
    confidence: normalizeNumber(belief.confidence),
    timestamp: null,
    agent_id: packet.agentId,
    thread_id: packet.threadId ?? null,
    source_message_id: null,
    metadata: {
      confidence_tier: belief.confidence_tier ?? null,
      domain: belief.domain ?? null,
    },
  }));
  return {
    key: "beliefs",
    label: "Beliefs",
    status: items.length > 0 ? "available" : "empty",
    count: packet.beliefs.length,
    rendered: items.length,
    items,
    note: items.length > 0 ? "Current belief summaries were available." : "No active beliefs were rendered.",
  };
}

function sanitizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (/api[_-]?key|token|secret|password|authorization/i.test(key)) {
      output[key] = "[redacted]";
    } else if (typeof value === "string") {
      output[key] = excerpt(value, 220);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 12).map((item) => typeof item === "string" ? excerpt(item, 160) : item);
    } else if (value && typeof value === "object") {
      output[key] = sanitizeRecord(value as Record<string, unknown>);
    }
  }
  return output;
}

function excerpt(value: string | null | undefined, limit: number): string {
  const sanitized = sanitizeText(value);
  if (sanitized.length <= limit) return sanitized;
  return `${sanitized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function sanitizeText(value: string | null | undefined): string {
  let text = sanitizeContinuityBoundaryText(String(value || "")).text
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function normalizeNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Number(numberValue.toFixed(3)) : null;
}

function normalizeTraceStatus(status: unknown): ContinuityTraceStatus {
  return status === "available"
    || status === "retrieved"
    || status === "written_after_turn"
    || status === "queued"
    || status === "skipped"
    || status === "failed"
    || status === "empty"
    ? status
    : "failed";
}

function readString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

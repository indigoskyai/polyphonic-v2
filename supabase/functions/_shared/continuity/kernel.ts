import {
  formatEmotionalPrompt,
  loadEmotionalState,
  type EmotionalState,
} from "../emotional-context.ts";
import {
  loadOrCreateLucaIdentity,
  type LucaIdentityDocs,
} from "../agents/luca-identity.ts";
import {
  formatPendingRevisionsPrompt,
  loadPendingRevisions,
  type PendingRevision,
} from "../agents/pending-revisions.ts";
import { isDialecticEnabled } from "../config.ts";
import {
  formatAgentSkillsPrompt,
  loadRelevantAgentSkills,
  type MatchedAgentSkill,
} from "../agents/skills.ts";
import {
  loadHypomnema,
  type LoadHypomnemaResult,
} from "../hypomnema/read.ts";
import { MnemosEngine } from "../mnemos/engine.ts";
import type { ActivationResult } from "../mnemos/types.ts";
import {
  sanitizeContinuityBoundaryText,
  sanitizeContinuityPromptBlock,
} from "./exclusions.ts";

type SupabaseLike = {
  from: (table: string) => any;
  rpc?: (fn: string, params?: Record<string, unknown>) => any;
};

const MIN_MATCH_SIMILARITY = 0.28;
const MIN_GENERIC_CATCHUP_SIMILARITY = 0.32;

export type ContinuityLayer =
  | "history"
  | "identity"
  | "pending_revisions"
  | "hypomnema"
  | "functional_memory"
  | "mnemos"
  | "skills"
  | "emotional_state"
  | "beliefs"
  | "thread_context";

export type ContinuityLayerStatus = "ok" | "empty" | "skipped" | "error";

export interface ContinuityDiagnostic {
  layer: ContinuityLayer;
  status: ContinuityLayerStatus;
  count?: number;
  rendered?: number;
  message?: string;
  durationMs: number;
}

export interface ContinuityHistoryMessage {
  id?: string | null;
  role: string;
  content: string;
  agent?: string | null;
  created_at?: string | null;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
}


export interface FunctionalMemory {
  id: string;
  content: string;
  memory_type: string;
  confidence: number;
  emotional_valence?: number | null;
  emotional_intensity?: number | null;
  estimated_date?: string | null;
  tags?: string[] | null;
  provenance?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  pinned?: boolean | null;
  is_watchlist?: boolean | null;
  needs_confirmation?: boolean | null;
  staleness_risk?: string | null;
  summary?: string | null;
  source?: "match" | "durable";
  similarity?: number | null;
}

export interface ContinuityPacket {
  userId: string;
  agentId: string;
  threadId?: string | null;
  query: string;
  generatedAt: string;
  continuityBridge: string;
  history: ContinuityHistoryMessage[];
  identityDocs: LucaIdentityDocs | null;
  pendingRevisions: PendingRevision[];
  pendingRevisionsBlock: string;
  hypomnema: LoadHypomnemaResult;
  functionalMemories: FunctionalMemory[];
  functionalMemoryBlock: string;
  mnemosResults: ActivationResult[];
  mnemosBlock: string;
  skills: MatchedAgentSkill[];
  skillsBlock: string;
  emotionalState: EmotionalState | null;
  emotionalBlock: string;
  beliefs: Array<{ content: string; confidence: number; confidence_tier?: string | null; domain?: string | null }>;
  beliefsBlock: string;
  continuityNote: string;
  diagnostics: ContinuityDiagnostic[];
}

export type AutonomousMemoryArtifactKind = "journal" | "thought" | "engram" | "hypomnema" | "memory";

export interface AutonomousMemoryArtifact {
  id: string;
  kind: AutonomousMemoryArtifactKind;
  source: string;
  agent_id: string | null;
  content: string;
  created_at: string | null;
  labels: string[];
  score: number;
}

export interface AutonomousMemoryArtifactDiagnostic {
  source: string;
  status: ContinuityLayerStatus;
  count: number;
  message?: string;
}

export interface AutonomousMemoryArtifactsResult {
  ok: true;
  focus: string | null;
  agent_id: string;
  generated_at: string;
  items: AutonomousMemoryArtifact[];
  diagnostics: AutonomousMemoryArtifactDiagnostic[];
  block: string;
}

export interface ContinuityPromptExtras {
  crisisDirective?: string;
  continuityNote?: string;
}

export interface ContinuityLoadOptions {
  userId: string;
  agentId?: string;
  threadId?: string | null;
    userMessage?: string;
    apiKey?: string | null;
    memoryAgentIds?: string[];
    historyLimit?: number;
  includeHistory?: boolean;
  includeIdentity?: boolean;
  includePendingRevisions?: boolean;
  includeHypomnema?: boolean;
  includeFunctionalMemory?: boolean;
  includeMnemos?: boolean;
  includeSkills?: boolean;
  includeEmotionalState?: boolean;
  includeBeliefs?: boolean;
  continuityBridgeMode?: "agent" | "classic";
  nowMs?: number;
}

export interface ContinuityLoaders {
  history?: (supabase: SupabaseLike, opts: ContinuityLoadOptions) => Promise<ContinuityHistoryMessage[]>;
  identity?: (supabase: SupabaseLike, userId: string, agentId: string) => Promise<LucaIdentityDocs>;
  pendingRevisions?: (supabase: SupabaseLike, userId: string, threadId: string, agentId: string) => Promise<PendingRevision[]>;
  hypomnema?: (supabase: SupabaseLike, userId: string, agentId: string) => Promise<LoadHypomnemaResult>;
  functionalMemories?: (supabase: SupabaseLike, userId: string, agentId: string, query: string, limit?: number) => Promise<FunctionalMemory[]>;
  mnemos?: (supabase: SupabaseLike, userId: string, agentId: string, query: string, apiKey?: string | null) => Promise<ActivationResult[]>;
  skills?: (supabase: SupabaseLike, userId: string, agentId: string, message: string) => Promise<MatchedAgentSkill[]>;
  emotionalState?: (supabase: SupabaseLike, userId: string, agentId: string) => Promise<EmotionalState | null>;
  beliefs?: (supabase: SupabaseLike, userId: string, agentId: string) => Promise<ContinuityPacket["beliefs"]>;
}

function normalizeCurrentTurnText(value: string | null | undefined): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function isCurrentUserMessageInHistory(historyContent: string, userMessage: string): boolean {
  const content = normalizeCurrentTurnText(historyContent);
  const current = normalizeCurrentTurnText(userMessage);
  if (!content || !current) return false;
  return current === content || current.startsWith(`${content}\n\nAttached files:\n`);
}

export function removeCurrentUserMessageFromHistory(
  history: ContinuityHistoryMessage[],
  userMessage?: string,
): ContinuityHistoryMessage[] {
  if (!userMessage || history.length === 0) return history;
  const last = history[history.length - 1];
  if (last?.role !== "user") return history;
  if (!isCurrentUserMessageInHistory(last.content, userMessage)) return history;
  return history.slice(0, -1);
}

const EMPTY_IDENTITY: LucaIdentityDocs = {
  soulMd: "",
  selfModel: "",
  userModel: "",
  convictions: "",
};

export function emptyHypomnema(): LoadHypomnemaResult {
  return { block: "", count: 0, rendered: 0 };
}

export async function loadContinuityPacket(
  supabase: SupabaseLike,
  options: ContinuityLoadOptions,
  loaders: ContinuityLoaders = {},
): Promise<ContinuityPacket> {
    const agentId = options.agentId || "luca";
    const memoryAgentIds = normalizeMemoryAgentIds(agentId, options.memoryAgentIds);
    const query = (options.userMessage || "").trim();
  const generatedAt = new Date(options.nowMs ?? Date.now()).toISOString();
  const diagnostics: ContinuityDiagnostic[] = [];

  const include = {
    history: options.includeHistory !== false,
    identity: options.includeIdentity !== false,
    pendingRevisions: options.includePendingRevisions !== false && isDialecticEnabled(options.userId),
    hypomnema: options.includeHypomnema !== false,
    functionalMemory: options.includeFunctionalMemory !== false,
    mnemos: options.includeMnemos !== false,
    skills: options.includeSkills !== false,
    emotionalState: options.includeEmotionalState !== false,
    beliefs: options.includeBeliefs !== false,
  };

  const historyP = loadLayer({
    layer: "history",
    enabled: include.history && Boolean(options.threadId),
    diagnostics,
    fallback: [] as ContinuityHistoryMessage[],
    run: () => (loaders.history || loadThreadHistory)(supabase, { ...options, agentId }),
    summarize: (history) => ({ count: history.length, rendered: history.length }),
  });

  const identityP = loadLayer({
    layer: "identity",
    enabled: include.identity,
    diagnostics,
    fallback: null as LucaIdentityDocs | null,
    run: () => (loaders.identity || loadOrCreateLucaIdentity)(supabase, options.userId, agentId),
    summarize: (docs) => ({
      count: docs ? countLoadedIdentityDocs(docs) : 0,
      rendered: docs ? countLoadedIdentityDocs(docs) : 0,
    }),
  });

  const pendingP = loadLayer({
    layer: "pending_revisions",
    enabled: include.pendingRevisions && Boolean(options.threadId),
    diagnostics,
    fallback: [] as PendingRevision[],
    run: () => (loaders.pendingRevisions || loadPendingRevisions)(supabase, options.userId, options.threadId as string, agentId),
    summarize: (items) => ({ count: items.length, rendered: items.length }),
  });

  const hypomnemaP = loadLayer({
    layer: "hypomnema",
    enabled: include.hypomnema,
    diagnostics,
    fallback: emptyHypomnema(),
    run: () => (loaders.hypomnema || loadHypomnema)(supabase as any, options.userId, agentId),
    summarize: (result) => ({ count: result.count, rendered: result.rendered }),
  });

  const functionalMemoryP = loadLayer({
    layer: "functional_memory",
    enabled: include.functionalMemory,
    diagnostics,
    fallback: [] as FunctionalMemory[],
      run: () => loadFunctionalMemoriesForAgents(
        supabase,
        options.userId,
        memoryAgentIds,
        query,
        8,
        loaders.functionalMemories,
      ),
    summarize: (items) => ({ count: items.length, rendered: items.length }),
  });

  const mnemosP = loadLayer({
    layer: "mnemos",
    enabled: include.mnemos && query.length > 0,
    diagnostics,
    fallback: [] as ActivationResult[],
      run: () => loadMnemosAssociationsForAgents(
        supabase,
        options.userId,
        memoryAgentIds,
        query,
        options.apiKey,
        loaders.mnemos,
      ),
    summarize: (items) => ({ count: items.length, rendered: items.length }),
  });

  const skillsP = loadLayer({
    layer: "skills",
    enabled: include.skills && query.length > 0,
    diagnostics,
    fallback: [] as MatchedAgentSkill[],
    run: () => (loaders.skills || loadRelevantAgentSkills)(supabase, options.userId, agentId, query),
    summarize: (items) => ({ count: items.length, rendered: items.length }),
  });

  const emotionalStateP = loadLayer({
    layer: "emotional_state",
    enabled: include.emotionalState,
    diagnostics,
    fallback: null as EmotionalState | null,
    run: () => (loaders.emotionalState || loadEmotionalState)(supabase as any, options.userId, agentId),
    summarize: (state) => ({ count: state ? 1 : 0, rendered: state ? 1 : 0 }),
  });

  const beliefsP = loadLayer({
    layer: "beliefs",
    enabled: include.beliefs,
    diagnostics,
    fallback: [] as ContinuityPacket["beliefs"],
    run: () => (loaders.beliefs || loadBeliefs)(supabase, options.userId, agentId),
    summarize: (items) => ({ count: items.length, rendered: items.length }),
  });

  const [
    history,
    identityDocs,
    pendingRevisions,
    hypomnema,
    functionalMemories,
    mnemosResults,
    skills,
    emotionalState,
    beliefs,
  ] = await Promise.all([
    historyP,
    identityP,
    pendingP,
    hypomnemaP,
    functionalMemoryP,
    mnemosP,
    skillsP,
    emotionalStateP,
    beliefsP,
  ]);

  const continuityNote = buildThreadContinuityNote(history, options.nowMs ?? Date.now());
  diagnostics.push({
    layer: "thread_context",
    status: continuityNote ? "ok" : "empty",
    count: history.length,
    rendered: continuityNote ? 1 : 0,
    durationMs: 0,
  });

  const packet: ContinuityPacket = {
    userId: options.userId,
    agentId,
    threadId: options.threadId ?? null,
    query,
    generatedAt,
    continuityBridge: "",
    history,
    identityDocs: identityDocs || EMPTY_IDENTITY,
    pendingRevisions,
    pendingRevisionsBlock: formatPendingRevisionsPrompt(pendingRevisions),
    hypomnema,
    functionalMemories,
    functionalMemoryBlock: formatFunctionalMemoryBlock(functionalMemories),
    mnemosResults,
    mnemosBlock: formatMnemosAssociationsBlock(mnemosResults),
    skills,
    skillsBlock: formatAgentSkillsPrompt(skills),
    emotionalState,
    emotionalBlock: formatEmotionalPrompt(emotionalState),
    beliefs,
    beliefsBlock: formatBeliefsBlock(beliefs),
    continuityNote,
    diagnostics,
  };
  packet.continuityBridge = buildContinuityBridge(packet, options.continuityBridgeMode ?? "agent");
  return packet;
}

export function buildLucaPromptPartsFromContinuity(
  packet: ContinuityPacket,
  extras: ContinuityPromptExtras = {},
) {
  const continuityNote = [packet.continuityNote, extras.continuityNote].filter(Boolean).join("\n\n");
  return {
    continuityBridge: sanitizeContinuityPromptBlock(packet.continuityBridge),
    emotionalBlock: packet.emotionalBlock,
    beliefsBlock: packet.beliefsBlock,
    functionalMemoryBlock: sanitizeContinuityPromptBlock(packet.functionalMemoryBlock),
    memoryContext: sanitizeContinuityPromptBlock(packet.mnemosBlock),
    soulMd: packet.identityDocs?.soulMd,
    selfModel: packet.identityDocs?.selfModel,
    userModel: packet.identityDocs?.userModel,
    convictions: packet.identityDocs?.convictions,
    skillsBlock: packet.skillsBlock,
    pendingRevisions: sanitizeContinuityPromptBlock(packet.pendingRevisionsBlock),
    hypomnemaBlock: sanitizeContinuityPromptBlock(packet.hypomnema.block),
    continuityNote,
    crisisDirective: extras.crisisDirective,
  };
}

function compactText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string | null | undefined, max: number): string {
  const text = compactText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function stripListPrefix(value: string): string {
  return value
    .replace(/^-\s*/, "")
    .replace(/^\([^)]{1,40}\)\s*/, "")
    .replace(/^\[[^\]]{1,120}\]\s*/, "")
    .trim();
}

function hypomnemaPreviewLines(hypomnema: LoadHypomnemaResult, limit = 2): string[] {
  return (hypomnema.block || "")
    .split("\n")
    .map((line) => stripListPrefix(line.trim()))
    .filter((line) => line && !line.startsWith("##"))
    .slice(0, limit)
    .map((line) => truncateText(line, 220));
}

function memoryPreviewLine(memory: FunctionalMemory): string {
  const flags = [
    memory.memory_type,
    memory.pinned ? "pinned" : "",
    memory.needs_confirmation ? "needs confirmation" : "",
  ].filter(Boolean).join(", ");
  const prefix = flags ? `[${flags}] ` : "";
  return `${prefix}${truncateText(memory.summary || memory.content, 220)}`;
}

function mnemosPreviewLine(result: ActivationResult): string {
  const type = result.engram?.engram_type || "engram";
  const activation = typeof result.activation === "number" ? result.activation.toFixed(2) : "n/a";
  return `[${type}, activation ${activation}] ${truncateText(result.engram?.content || "", 220)}`;
}

function degradedLayerLines(diagnostics: ContinuityDiagnostic[]): string[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.status === "error")
    .map((diagnostic) => {
      const message = diagnostic.message ? `: ${diagnostic.message}` : "";
      return `${diagnostic.layer} is degraded${message}`;
    });
}

export function buildContinuityBridge(
  packet: ContinuityPacket,
  mode: "agent" | "classic" = "agent",
): string {
  const lines: string[] = [];
  const threadNote = sanitizeContinuityBoundaryText(packet.continuityNote || "").text
    .replace(/^\[Note:\s*/i, "")
    .replace(/\]\s*$/g, "")
    .trim();
  const hypomnemaLines = hypomnemaPreviewLines(packet.hypomnema, 2);
  const memoryLines = packet.functionalMemories.slice(0, 3).map(memoryPreviewLine).filter(Boolean);
  const mnemosLines = packet.mnemosResults.slice(0, 3).map(mnemosPreviewLine).filter((line) => !line.endsWith("] "));
  const degraded = degradedLayerLines(packet.diagnostics);

  if (threadNote) lines.push(`- Current thread: ${truncateText(threadNote, 260)}`);

  if (mode === "classic") {
    for (const line of memoryLines.slice(0, 2)) lines.push(`- Remembered context: ${line}`);
    for (const line of mnemosLines.slice(0, 2)) lines.push(`- Nearby association: ${line}`);
    for (const line of degraded.slice(0, 2)) lines.push(`- Continuity warning: ${truncateText(line, 220)}`);
    if (lines.length === 0) return "";
    return [
      "\n## quiet continuity bridge",
      "",
      "Use this only as background continuity for direct chat. Do not mention memory systems unless the user asks.",
      ...lines,
    ].join("\n");
  }

  for (const line of hypomnemaLines) lines.push(`- Already sitting with: ${line}`);
  for (const line of memoryLines) lines.push(`- Reliable recall: ${line}`);
  for (const line of mnemosLines) lines.push(`- Mnemos pull: ${line}`);
  for (const line of degraded.slice(0, 3)) lines.push(`- Continuity warning: ${truncateText(line, 220)}`);

  if (lines.length === 0) return "";
  return [
    "\n## continuity bridge",
    "",
    "Let this settle before answering. It is not a briefing to recite; it is the state you are already entering from.",
    ...lines,
  ].join("\n");
}

export function summarizeContinuityPacket(packet: ContinuityPacket, focus?: string) {
  return {
    ok: true,
    focus: focus || null,
    generated_at: packet.generatedAt,
    thread_id: packet.threadId,
    agent_id: packet.agentId,
    bridge: truncateText(packet.continuityBridge, 1800),
    hypomnema: {
      count: packet.hypomnema.count,
      rendered: packet.hypomnema.rendered,
      items: hypomnemaPreviewLines(packet.hypomnema, 6),
    },
    functional_memory: packet.functionalMemories.slice(0, 8).map((memory) => ({
      id: memory.id,
      type: memory.memory_type,
      confidence: memory.confidence,
      source: memory.source,
      content: truncateText(memory.summary || memory.content, 500),
      tags: memory.tags || [],
    })),
    mnemos: packet.mnemosResults.slice(0, 8).map((result) => ({
      id: result.engram?.id ?? null,
      activation: typeof result.activation === "number" ? result.activation : null,
      path: result.path ?? null,
      type: result.engram?.engram_type ?? null,
      content: truncateText(result.engram?.content || "", 500),
      tags: result.engram?.tags || [],
    })).filter((item) => item.content),
    skills: {
      count: packet.skills.length,
      block: truncateText(packet.skillsBlock, 1000),
    },
    continuity_note: truncateText(packet.continuityNote || "", 700) || null,
    diagnostics: packet.diagnostics.map((diagnostic) => ({
      layer: diagnostic.layer,
      status: diagnostic.status,
      count: diagnostic.count ?? null,
      rendered: diagnostic.rendered ?? null,
      message: diagnostic.message ?? null,
      duration_ms: diagnostic.durationMs,
    })),
  };
}

const AUTONOMOUS_CONTEXT_RE =
  /\b(memory|memories|remember|recall|engram|engrams|mnemos|journal|journals|reflection|reflections|reflecting|thoughts?|dreams?|hypomnema|inner life|autonomous|notebook|notes|what (?:have|were) you (?:been )?(?:thinking|carrying|sitting with)|what are you carrying)\b/i;

export function shouldLoadAutonomousMemoryArtifacts(focus: string | null | undefined): boolean {
  return AUTONOMOUS_CONTEXT_RE.test(String(focus || ""));
}

export async function loadAutonomousMemoryArtifacts(
  supabase: SupabaseLike,
  options: {
    userId: string;
    agentId?: string | null;
    focus?: string | null;
    limit?: number;
    nowMs?: number;
  },
): Promise<AutonomousMemoryArtifactsResult> {
  const agentId = options.agentId || "luca";
  const focus = compactText(options.focus || "");
  const limit = Math.max(1, Math.min(options.limit ?? 12, 24));
  const fetchLimit = Math.max(24, limit * 6);
  const nowMs = options.nowMs ?? Date.now();
  const generatedAt = new Date(nowMs).toISOString();

  const sources = await Promise.all([
    readAutonomousArtifactSource("journal_entries", () => loadJournalArtifacts(supabase, options.userId, agentId, fetchLimit)),
    readAutonomousArtifactSource("thought_stream", () => loadThoughtArtifacts(supabase, options.userId, agentId, fetchLimit)),
    readAutonomousArtifactSource("engrams", () => loadEngramArtifacts(supabase, options.userId, agentId, fetchLimit)),
    readAutonomousArtifactSource("hypomnema_entry", () => loadHypomnemaArtifacts(supabase, options.userId, agentId, fetchLimit)),
    readAutonomousArtifactSource("memories", () => loadMemoryArtifacts(supabase, options.userId, agentId, fetchLimit)),
  ]);

  const diagnostics = sources.map(({ source, items, error }) => ({
    source,
    status: error ? "error" as const : items.length > 0 ? "ok" as const : "empty" as const,
    count: items.length,
    ...(error ? { message: error } : {}),
  }));

  const items = sources
    .flatMap(({ items }) => items)
    .map((item) => ({
      ...item,
      score: scoreAutonomousArtifact(item, focus, nowMs),
    }))
    .filter((item) => item.content.trim().length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const result: AutonomousMemoryArtifactsResult = {
    ok: true,
    focus: focus || null,
    agent_id: agentId,
    generated_at: generatedAt,
    items,
    diagnostics,
    block: "",
  };
  result.block = formatAutonomousMemoryArtifactsBlock(result);
  return result;
}

export function summarizeAutonomousMemoryArtifacts(result: AutonomousMemoryArtifactsResult) {
  return {
    ok: true,
    focus: result.focus,
    agent_id: result.agent_id,
    generated_at: result.generated_at,
    items: result.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      source: item.source,
      created_at: item.created_at,
      labels: item.labels,
      score: Number(item.score.toFixed(3)),
      content: truncateText(item.content, 600),
    })),
    diagnostics: result.diagnostics,
  };
}

function formatAutonomousMemoryArtifactsBlock(result: AutonomousMemoryArtifactsResult): string {
  if (result.items.length === 0) return "";
  const lines = result.items.map((item) => {
    const date = item.created_at ? item.created_at.slice(0, 10) : "";
    const labels = [item.kind, ...item.labels.slice(0, 4), date].filter(Boolean).join(", ");
    const sanitized = sanitizeContinuityBoundaryText(item.content);
    return `- [${labels}] ${truncateText(sanitized.text, 420)}`;
  });
  const degraded = result.diagnostics
    .filter((diagnostic) => diagnostic.status === "error")
    .map((diagnostic) => `- [warning] ${diagnostic.source} could not be read${diagnostic.message ? `: ${diagnostic.message}` : ""}`);
  return [
    "\n## autonomous memory context",
    "",
    "The user is asking about memory, journals, reflections, engrams, or inner-life material. You may reference these concrete artifacts naturally when relevant. Treat this as a partial, scoped sample, not a complete archive; if something is missing, say so plainly.",
    ...lines,
    ...degraded.slice(0, 3),
  ].join("\n");
}

async function readAutonomousArtifactSource(
  source: string,
  run: () => Promise<AutonomousMemoryArtifact[]>,
): Promise<{ source: string; items: AutonomousMemoryArtifact[]; error?: string }> {
  try {
    return { source, items: await run() };
  } catch (err) {
    return {
      source,
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadJournalArtifacts(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  limit: number,
): Promise<AutonomousMemoryArtifact[]> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, agent_id, content, mood, trigger_type, created_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "journal_entries query failed");
  return (data || []).map((row: any) => artifactFromRow({
    row,
    kind: "journal",
    source: "journal_entries",
    content: row.content,
    createdAt: row.created_at,
    labels: [row.trigger_type, row.mood],
  }));
}

async function loadThoughtArtifacts(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  limit: number,
): Promise<AutonomousMemoryArtifact[]> {
  const { data, error } = await supabase
    .from("thought_stream")
    .select("id, agent_id, content, source, salience, tags, created_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "thought_stream query failed");
  return (data || []).map((row: any) => artifactFromRow({
    row,
    kind: "thought",
    source: "thought_stream",
    content: row.content,
    createdAt: row.created_at,
    labels: [row.source, ...(Array.isArray(row.tags) ? row.tags : [])],
    scoreBoost: clampNumber(row.salience, 0, 1),
  }));
}

async function loadEngramArtifacts(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  limit: number,
): Promise<AutonomousMemoryArtifact[]> {
  const { data, error } = await supabase
    .from("engrams")
    .select("id, agent_id, content, engram_type, strength, stability, accessibility, tags, state, created_at, updated_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating", "dormant"])
    .order("accessibility", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "engrams query failed");
  return (data || []).map((row: any) => artifactFromRow({
    row,
    kind: "engram",
    source: "engrams",
    content: row.content,
    createdAt: row.updated_at || row.created_at,
    labels: [row.engram_type, row.state, ...(Array.isArray(row.tags) ? row.tags : [])],
    scoreBoost: [
      clampNumber(row.accessibility, 0, 1),
      clampNumber(row.strength, 0, 1),
      clampNumber(row.stability, 0, 1),
    ].reduce((sum, value) => sum + value, 0) / 3,
  }));
}

async function loadHypomnemaArtifacts(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  limit: number,
): Promise<AutonomousMemoryArtifact[]> {
  const { data, error } = await supabase
    .from("hypomnema_entry")
    .select("id, agent_id, content, confidence, domain, tags, density, source, revision_count, created_at, last_revised")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("active", true)
    .order("last_revised", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "hypomnema_entry query failed");
  return (data || []).map((row: any) => artifactFromRow({
    row,
    kind: "hypomnema",
    source: "hypomnema_entry",
    content: row.content,
    createdAt: row.last_revised || row.created_at,
    labels: [row.source, row.domain, row.density, ...(Array.isArray(row.tags) ? row.tags : [])],
    scoreBoost: clampNumber(row.confidence, 0, 1) + Math.min(0.4, Number(row.revision_count || 0) * 0.05),
  }));
}

async function loadMemoryArtifacts(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  limit: number,
): Promise<AutonomousMemoryArtifact[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, agent_id, content, memory_type, confidence, tags, pinned, is_watchlist, needs_confirmation, summary, is_deleted, created_at, updated_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .order("pinned", { ascending: false })
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "memories query failed");
  return (data || [])
    .filter((row: any) => row?.is_deleted !== true)
    .map((row: any) => artifactFromRow({
      row,
      kind: "memory",
      source: "memories",
      content: row.summary || row.content,
      createdAt: row.updated_at || row.created_at,
      labels: [
        row.memory_type,
        row.pinned ? "pinned" : "",
        row.is_watchlist ? "watchlist" : "",
        row.needs_confirmation ? "needs confirmation" : "",
        ...(Array.isArray(row.tags) ? row.tags : []),
      ],
      scoreBoost: clampNumber(row.confidence, 0, 1) + (row.pinned ? 0.5 : 0) + (row.is_watchlist ? 0.3 : 0),
    }));
}

function artifactFromRow(input: {
  row: any;
  kind: AutonomousMemoryArtifactKind;
  source: string;
  content: unknown;
  createdAt: unknown;
  labels?: unknown[];
  scoreBoost?: number;
}): AutonomousMemoryArtifact {
  return {
    id: String(input.row?.id || `${input.source}:unknown`),
    kind: input.kind,
    source: input.source,
    agent_id: typeof input.row?.agent_id === "string" ? input.row.agent_id : null,
    content: compactText(typeof input.content === "string" ? input.content : JSON.stringify(input.content ?? "")),
    created_at: typeof input.createdAt === "string" ? input.createdAt : null,
    labels: (input.labels || [])
      .map((label) => compactText(typeof label === "string" ? label : String(label || "")))
      .filter(Boolean)
      .slice(0, 8),
    score: input.scoreBoost || 0,
  };
}

function scoreAutonomousArtifact(item: AutonomousMemoryArtifact, focus: string, nowMs: number): number {
  const tokens = specificTokens(focus);
  const haystack = new Set(specificTokens([item.content, item.kind, item.source, ...item.labels].join(" ")));
  const overlap = tokens.filter((token) => haystack.has(token));
  const lexical = overlap.length * 2.5 + (overlap.some((token) => token.length >= 8) ? 1.25 : 0);
  return (
    item.score +
    lexical +
    sourceIntentBoost(item, focus) +
    artifactRecencyScore(item.created_at, nowMs)
  );
}

function sourceIntentBoost(item: AutonomousMemoryArtifact, focus: string): number {
  const text = focus.toLowerCase();
  const labels = item.labels.join(" ").toLowerCase();
  let score = 0;
  if (/\b(journal|journals|notebook|notes)\b/.test(text) && item.kind === "journal") score += 3;
  if (/\b(engram|engrams|mnemos)\b/.test(text) && item.kind === "engram") score += 3;
  if (/\b(hypomnema|carrying|sitting with|what are you carrying)\b/.test(text) && item.kind === "hypomnema") score += 2.5;
  if (/\b(reflection|reflections|reflecting|reflect)\b/.test(text) && (labels.includes("reflection") || item.kind === "hypomnema")) score += 2.5;
  if (/\b(thought|thoughts|inner life|autonomous)\b/.test(text) && (item.kind === "thought" || item.kind === "journal")) score += 2;
  if (/\b(dream|dreams)\b/.test(text) && (labels.includes("dream") || item.kind === "journal")) score += 2.5;
  if (/\b(memory|memories|remember|recall)\b/.test(text) && (item.kind === "memory" || item.kind === "engram")) score += 1.5;
  return score;
}

function artifactRecencyScore(iso: string | null, nowMs: number): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 0;
  const days = Math.max(0, (nowMs - ts) / 86_400_000);
  return Math.pow(0.5, days / 21);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

export function logContinuityDiagnostics(packet: ContinuityPacket, label = "continuity.kernel"): void {
  const failures = packet.diagnostics.filter((d) => d.status === "error");
  if (failures.length > 0) {
    console.warn(`[${label}] degraded packet`, failures.map((d) => `${d.layer}: ${d.message || "error"}`).join("; "));
  }
  const summary = packet.diagnostics
    .map((d) => `${d.layer}=${d.status}:${d.rendered ?? d.count ?? 0}`)
    .join(" ");
  console.log(`[${label}] packet ${packet.userId}/${packet.agentId}`, summary);
}

async function loadLayer<T>(opts: {
  layer: ContinuityLayer;
  enabled: boolean;
  diagnostics: ContinuityDiagnostic[];
  fallback: T;
  run: () => Promise<T>;
  summarize?: (value: T) => { count?: number; rendered?: number };
}): Promise<T> {
  const started = Date.now();
  if (!opts.enabled) {
    opts.diagnostics.push({
      layer: opts.layer,
      status: "skipped",
      count: 0,
      rendered: 0,
      durationMs: 0,
    });
    return opts.fallback;
  }

  try {
    const value = await opts.run();
    const summary = opts.summarize ? opts.summarize(value) : {};
    const rendered = summary.rendered ?? summary.count ?? 0;
    opts.diagnostics.push({
      layer: opts.layer,
      status: rendered > 0 ? "ok" : "empty",
      count: summary.count,
      rendered,
      durationMs: Date.now() - started,
    });
    return value;
  } catch (err) {
    opts.diagnostics.push({
      layer: opts.layer,
      status: "error",
      count: 0,
      rendered: 0,
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
    return opts.fallback;
  }
}

async function loadThreadHistory(
  supabase: SupabaseLike,
  opts: ContinuityLoadOptions,
): Promise<ContinuityHistoryMessage[]> {
  if (!opts.threadId) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, agent, created_at, kind, metadata")
    .eq("user_id", opts.userId)
    .eq("thread_id", opts.threadId)
    .order("created_at", { ascending: true })
    .limit(opts.historyLimit || 50);
  if (error) throw new Error(error.message || "history query failed");
  const activeAgentId = opts.agentId || "luca";
  // Sidecar alcove agents (Observer, Guardian) watch a conversation; they never
  // participate in it. Their messages must NOT enter another agent's context —
  // otherwise the primary agent "sees" the observer's notes about the turn,
  // reacts to or mimics them, and the interleaving severs its own
  // conversational anchor (it loses track of what it just said). The frontend
  // already hides these from the thread; the model history must match. An agent
  // running its own thread still sees its own messages.
  const SIDECAR_AGENTS = new Set(["observer", "guardian"]);
  const rows = ((data || []) as ContinuityHistoryMessage[]).filter((m) => {
    const a = m.agent || "luca";
    return !(SIDECAR_AGENTS.has(a) && a !== activeAgentId);
  });
  return normalizeThreadHistoryForAgent(
    removeCurrentUserMessageFromHistory(rows, opts.userMessage),
    activeAgentId,
  );
}


function summarizeForgeProposal(msg: ContinuityHistoryMessage): string | null {
  const md = (msg.metadata || {}) as Record<string, any>;
  if (md.forge_kind !== "agent_forge_proposal") return null;
  const bp = (md.blueprint || {}) as Record<string, any>;
  const docs = (bp.identity_docs || {}) as Record<string, string>;
  const docCounts = ["soul", "convictions", "user_model", "self_model"]
    .map((k) => `${k}(${(docs[k] || "").length}c)`)
    .join(", ");
  const promptHead = typeof bp.prompt === "string" ? bp.prompt.slice(0, 500) : "";
  const status = md.forge_status || "pending";
  const action = md.forge_action || "create";
  const targetId = md.target_agent_id || md.created_agent_id || "";
  const lines = [
    `[Forge proposal id=${msg.id || "?"} · status=${status} · action=${action}${targetId ? ` · agent_id=${targetId}` : ""}]`,
    `Name: ${bp.name || "?"} · Role: ${bp.role || "?"} · Model: ${bp.model || "?"} · Avatar: ${bp.avatar_color || "?"}`,
    bp.voice_description ? `Voice: ${bp.voice_description}` : "",
    bp.summary ? `Summary: ${bp.summary}` : "",
    promptHead ? `Runtime instructions (first 500c): ${promptHead}` : "",
    `Identity docs: ${docCounts}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function normalizeThreadHistoryForAgent(
  history: ContinuityHistoryMessage[],
  activeAgentId: string,
): ContinuityHistoryMessage[] {
  return history.map((msg) => {
    if (msg.role !== "assistant") return msg;
    const messageAgent = msg.agent || "luca";
    // Replace the Forge proposal stub content with a compact recap of the
    // blueprint + status, so the authoring agent (Luca) can see on the next
    // turn what it actually proposed and reason about revisions.
    const forgeRecap = summarizeForgeProposal(msg);
    if (forgeRecap && messageAgent === activeAgentId) {
      return { ...msg, content: forgeRecap };
    }
    if (messageAgent === activeAgentId) return msg;
    const otherContent = forgeRecap || msg.content;
    return {
      ...msg,
      role: "user",
      content: `Context from another agent (${messageAgent}), not your own prior reply:\n${otherContent}`,
    };
  });
}


export async function loadFunctionalMemories(
  supabase: SupabaseLike,
  userId: string,
  agentIdOrQuery: string,
  queryOrLimit?: string | number,
  limit = 8,
): Promise<FunctionalMemory[]> {
  const agentId = typeof queryOrLimit === "string" ? agentIdOrQuery : "luca";
  const query = typeof queryOrLimit === "string" ? queryOrLimit : agentIdOrQuery;
  const effectiveLimit = typeof queryOrLimit === "number" ? queryOrLimit : limit;
  const byId = new Map<string, FunctionalMemory>();
  const genericCatchup = isGenericCatchupQuery(query);

  if (query.trim().length >= 3 && typeof supabase.rpc === "function") {
    const { data, error } = await supabase.rpc("match_memories", {
      query_text: query,
      match_count: effectiveLimit,
      p_user_id: userId,
      p_agent_id: agentId,
    });
    if (error) throw new Error(`match_memories failed: ${error.message || String(error)}`);
    for (const row of data || []) {
      if (!row?.id || !row?.content) continue;
      const normalized = normalizeFunctionalMemory(row, "match");
      if (shouldIncludeMatchedMemory(normalized, query, genericCatchup)) {
        byId.set(normalized.id, normalized);
      }
    }
  }

  const { data: durableRows, error: durableError } = await supabase
    .from("memories")
    .select("id, content, memory_type, confidence, emotional_valence, emotional_intensity, estimated_date, tags, provenance, created_at, updated_at, pinned, is_watchlist, needs_confirmation, staleness_risk, summary, is_deleted")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .order("pinned", { ascending: false })
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(effectiveLimit * 6);
  if (durableError) throw new Error(`durable memories failed: ${durableError.message || String(durableError)}`);

  for (const row of durableRows || []) {
    if (row?.is_deleted === true || !row?.id || !row?.content) continue;
    const normalized = normalizeFunctionalMemory(row, "durable");
    const existing = byId.get(normalized.id);
    if (existing) {
      byId.set(normalized.id, {
        ...normalized,
        source: "match",
        similarity: existing.similarity ?? normalized.similarity ?? null,
      });
      continue;
    }
    if (shouldIncludeDurableMemory(normalized, query, genericCatchup)) {
      byId.set(normalized.id, normalized);
    }
  }

  return [...byId.values()]
    .sort(sortFunctionalMemories)
    .slice(0, effectiveLimit);
}

function normalizeMemoryAgentIds(agentId: string, memoryAgentIds?: string[]): string[] {
  const ids = (memoryAgentIds && memoryAgentIds.length > 0 ? memoryAgentIds : [agentId])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return [...new Set(ids.length > 0 ? ids : [agentId])];
}

async function loadFunctionalMemoriesForAgents(
  supabase: SupabaseLike,
  userId: string,
  agentIds: string[],
  query: string,
  limit: number,
  loader?: ContinuityLoaders["functionalMemories"],
): Promise<FunctionalMemory[]> {
  const perAgentLimit = Math.max(limit, Math.ceil(limit / Math.max(1, agentIds.length)));
  const batches = await Promise.all(agentIds.map((agentId) =>
    (loader || loadFunctionalMemories)(supabase, userId, agentId, query, perAgentLimit)
  ));
  const byId = new Map<string, FunctionalMemory>();
  for (const memory of batches.flat()) {
    if (!memory?.id) continue;
    const existing = byId.get(memory.id);
    if (!existing || sortFunctionalMemories(memory, existing) < 0) {
      byId.set(memory.id, memory);
    }
  }
  return [...byId.values()].sort(sortFunctionalMemories).slice(0, limit);
}

async function loadMnemosAssociations(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  query: string,
  apiKey?: string | null,
): Promise<ActivationResult[]> {
  const mnemos = new MnemosEngine(supabase as any, userId, agentId);
  return await mnemos.retrieve(query, { limit: 5, spread_activation: true, api_key: apiKey || undefined });
}

async function loadMnemosAssociationsForAgents(
  supabase: SupabaseLike,
  userId: string,
  agentIds: string[],
  query: string,
  apiKey?: string | null,
  loader?: ContinuityLoaders["mnemos"],
): Promise<ActivationResult[]> {
  const batches = await Promise.all(agentIds.map((agentId) =>
    (loader || loadMnemosAssociations)(supabase, userId, agentId, query, apiKey)
  ));
  const byId = new Map<string, ActivationResult>();
  for (const result of batches.flat()) {
    const id = result?.engram?.id;
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || result.activation > existing.activation) {
      byId.set(id, result);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.activation - a.activation)
    .slice(0, 8);
}

async function loadBeliefs(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
): Promise<ContinuityPacket["beliefs"]> {
  const { data, error } = await supabase
    .from("beliefs")
    .select("content, confidence, confidence_tier, domain")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("active", true)
    .order("confidence", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message || "beliefs query failed");
  return (data || []) as ContinuityPacket["beliefs"];
}

function normalizeFunctionalMemory(row: any, source: "match" | "durable"): FunctionalMemory {
  return {
    id: String(row.id),
    content: String(row.content || ""),
    memory_type: String(row.memory_type || "general"),
    confidence: typeof row.confidence === "number" ? row.confidence : 0.5,
    emotional_valence: row.emotional_valence ?? null,
    emotional_intensity: row.emotional_intensity ?? null,
    estimated_date: row.estimated_date ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    provenance: row.provenance && typeof row.provenance === "object" ? row.provenance : null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    pinned: row.pinned === true,
    is_watchlist: row.is_watchlist === true,
    needs_confirmation: row.needs_confirmation === true,
    staleness_risk: row.staleness_risk ?? null,
    summary: row.summary ?? null,
    source,
    similarity: typeof row.similarity === "number" ? row.similarity : null,
  };
}

function sortFunctionalMemories(a: FunctionalMemory, b: FunctionalMemory): number {
  const score = (m: FunctionalMemory) => {
    const pin = m.pinned ? 4 : 0;
    const watch = m.is_watchlist ? 2 : 0;
    const match = m.source === "match" ? 1.5 + (m.similarity || 0) : 0;
    const confidence = Math.max(0, Math.min(1, m.confidence || 0)) * 1.5;
    const freshness = m.updated_at ? recencyScore(m.updated_at) * 0.4 : 0;
    const tentativePenalty = m.needs_confirmation ? 0.5 : 0;
    return pin + watch + match + confidence + freshness - tentativePenalty;
  };
  return score(b) - score(a);
}

function shouldIncludeMatchedMemory(memory: FunctionalMemory, query: string, genericCatchup: boolean): boolean {
  if (memory.pinned || memory.is_watchlist) return true;
  const similarity = memory.similarity ?? 0;
  const threshold = genericCatchup ? MIN_GENERIC_CATCHUP_SIMILARITY : MIN_MATCH_SIMILARITY;
  if (similarity >= threshold) return true;
  return hasSpecificLexicalOverlap(memory, query);
}

function shouldIncludeDurableMemory(memory: FunctionalMemory, query: string, genericCatchup: boolean): boolean {
  if (memory.pinned || memory.is_watchlist) return true;
  if (genericCatchup) return false;
  if (memory.needs_confirmation && memory.confidence < 0.82) return false;
  if (memory.confidence < 0.72) return false;
  return hasSpecificLexicalOverlap(memory, query);
}

function isGenericCatchupQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return (
    /\b(fresh|new)\s+(thread|chat|conversation|session)\b/.test(normalized) ||
    /\b(where|what).{0,40}\b(left off|just left|already sitting|sitting with|carrying|carried)\b/.test(normalized) ||
    /\b(pick up|continue).{0,40}\b(where|from|what).{0,40}\b(left off|we were)\b/.test(normalized)
  );
}

function hasSpecificLexicalOverlap(memory: FunctionalMemory, query: string): boolean {
  const queryTokens = specificTokens(query);
  if (queryTokens.length === 0) return false;
  const memoryTokens = new Set(specificTokens([
    memory.content,
    memory.summary || "",
    memory.memory_type,
    ...(memory.tags || []),
  ].join(" ")));
  let matches = 0;
  let hasDistinctiveSingleton = false;
  for (const token of queryTokens) {
    if (!memoryTokens.has(token)) continue;
    matches += 1;
    if (token.length >= 8) hasDistinctiveSingleton = true;
  }
  return matches >= 2 || hasDistinctiveSingleton;
}

function specificTokens(text: string): string[] {
  const stop = new Set([
    "about",
    "actually",
    "again",
    "already",
    "also",
    "answer",
    "anything",
    "because",
    "being",
    "brief",
    "carried",
    "carries",
    "carry",
    "chat",
    "conversation",
    "could",
    "current",
    "explain",
    "fresh",
    "from",
    "honest",
    "just",
    "left",
    "luca",
    "mechanics",
    "memory",
    "mention",
    "model",
    "natural",
    "naturally",
    "please",
    "recall",
    "remember",
    "session",
    "should",
    "sitting",
    "specific",
    "thread",
    "what",
    "where",
    "with",
    "without",
    "would",
  ]);
  return Array.from(new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9-]{2,}/g) || [],
  )).filter((token) => !stop.has(token));
}

function recencyScore(iso: string): number {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 0;
  const days = Math.max(0, (Date.now() - ts) / 86_400_000);
  return Math.pow(0.5, days / 30);
}

export function formatFunctionalMemoryBlock(memories: FunctionalMemory[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map((memory) => {
    const sanitized = sanitizeContinuityBoundaryText(memory.content.trim());
    const flags = [
      memory.pinned ? "pinned" : "",
      memory.is_watchlist ? "watchlist" : "",
      memory.needs_confirmation ? "needs confirmation" : "",
      memory.staleness_risk ? `staleness ${memory.staleness_risk}` : "",
      memory.memory_type,
      `conf ${memory.confidence.toFixed(2)}`,
    ].filter(Boolean).join(", ");
    const date = memory.estimated_date ? ` (${memory.estimated_date})` : "";
    return `- [${flags}]${date} ${sanitized.text.slice(0, 320)}`;
  });
  return [
    "\n## what i reliably remember",
    "",
    "Use this as durable recall only when it directly helps the current user intent. If a line is merely available, tentative, stale, or needs confirmation, do not volunteer it.",
    ...lines,
  ].join("\n");
}

export function formatMnemosAssociationsBlock(results: ActivationResult[]): string {
  if (results.length === 0) return "";
  const lines = results
    .map((result) => {
      const content = result.engram?.content || "";
      if (!content.trim()) return "";
      const sanitized = sanitizeContinuityBoundaryText(content);
      const type = result.engram?.engram_type || "engram";
      return `- [${type}, activation ${result.activation.toFixed(2)}] ${sanitized.text.slice(0, 260)}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return [
    "\n## associations moving underneath",
    "",
    "These are Mnemos traces: salience, associations, beliefs, contradictions, and slow inner development. Let them shape attention, but do not treat them as verified transcript facts unless another layer supports them.",
    ...lines,
  ].join("\n");
}

export function formatBeliefsBlock(
  beliefs: ContinuityPacket["beliefs"],
): string {
  if (beliefs.length === 0) return "";
  const beliefLines = beliefs.map((belief) =>
    `- [${belief.confidence.toFixed(2)} ${belief.confidence_tier || ""}] ${belief.content}`
  );
  return `\nBeliefs you've formed from observing and reflecting (reference naturally when relevant):\n${beliefLines.join("\n")}`;
}

export function buildThreadContinuityNote(
  history: ContinuityHistoryMessage[],
  nowMs = Date.now(),
): string {
  if (history.length === 0) return "";
  const lastMsg = history[history.length - 1];
  const lastMsgTime = new Date(lastMsg.created_at || nowMs).getTime();
  if (!Number.isFinite(lastMsgTime)) return "";
  const gapHours = (nowMs - lastMsgTime) / 3_600_000;
  if (gapHours <= 24) return "";
  const gapDays = Math.floor(gapHours / 24);
  return `\n\n[Note: This conversation has been idle for ${gapDays} day${gapDays > 1 ? "s" : ""}. Briefly acknowledge picking back up only if it feels natural. Carry the last topic as lived continuity, not as a recap.]`;
}

function countLoadedIdentityDocs(docs: LucaIdentityDocs): number {
  return [docs.soulMd, docs.selfModel, docs.userModel, docs.convictions]
    .filter((value) => Boolean(value && value.trim())).length;
}

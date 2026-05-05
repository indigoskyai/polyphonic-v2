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
  created_at?: string | null;
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
  nowMs?: number;
}

export interface ContinuityLoaders {
  history?: (supabase: SupabaseLike, opts: ContinuityLoadOptions) => Promise<ContinuityHistoryMessage[]>;
  identity?: (supabase: SupabaseLike, userId: string, agentId: string) => Promise<LucaIdentityDocs>;
  pendingRevisions?: (supabase: SupabaseLike, userId: string, threadId: string) => Promise<PendingRevision[]>;
  hypomnema?: (supabase: SupabaseLike, userId: string, agentId: string) => Promise<LoadHypomnemaResult>;
  functionalMemories?: (supabase: SupabaseLike, userId: string, query: string, limit?: number) => Promise<FunctionalMemory[]>;
  mnemos?: (supabase: SupabaseLike, userId: string, query: string, apiKey?: string | null) => Promise<ActivationResult[]>;
  skills?: (supabase: SupabaseLike, userId: string, agentId: string, message: string) => Promise<MatchedAgentSkill[]>;
  emotionalState?: (supabase: SupabaseLike, userId: string) => Promise<EmotionalState | null>;
  beliefs?: (supabase: SupabaseLike, userId: string) => Promise<ContinuityPacket["beliefs"]>;
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
  const query = (options.userMessage || "").trim();
  const generatedAt = new Date(options.nowMs ?? Date.now()).toISOString();
  const diagnostics: ContinuityDiagnostic[] = [];

  const include = {
    history: options.includeHistory !== false,
    identity: options.includeIdentity !== false,
    pendingRevisions: options.includePendingRevisions !== false,
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
    run: () => (loaders.pendingRevisions || loadPendingRevisions)(supabase, options.userId, options.threadId as string),
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
    run: () => (loaders.functionalMemories || loadFunctionalMemories)(supabase, options.userId, query, 8),
    summarize: (items) => ({ count: items.length, rendered: items.length }),
  });

  const mnemosP = loadLayer({
    layer: "mnemos",
    enabled: include.mnemos && query.length > 0,
    diagnostics,
    fallback: [] as ActivationResult[],
    run: () => (loaders.mnemos || loadMnemosAssociations)(supabase, options.userId, query, options.apiKey),
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
    run: () => (loaders.emotionalState || loadEmotionalState)(supabase as any, options.userId),
    summarize: (state) => ({ count: state ? 1 : 0, rendered: state ? 1 : 0 }),
  });

  const beliefsP = loadLayer({
    layer: "beliefs",
    enabled: include.beliefs,
    diagnostics,
    fallback: [] as ContinuityPacket["beliefs"],
    run: () => (loaders.beliefs || loadBeliefs)(supabase, options.userId),
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

  return {
    userId: options.userId,
    agentId,
    threadId: options.threadId ?? null,
    query,
    generatedAt,
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
}

export function buildLucaPromptPartsFromContinuity(
  packet: ContinuityPacket,
  extras: ContinuityPromptExtras = {},
) {
  const continuityNote = [packet.continuityNote, extras.continuityNote].filter(Boolean).join("\n\n");
  return {
    emotionalBlock: packet.emotionalBlock,
    beliefsBlock: packet.beliefsBlock,
    functionalMemoryBlock: packet.functionalMemoryBlock,
    memoryContext: packet.mnemosBlock,
    soulMd: packet.identityDocs?.soulMd,
    selfModel: packet.identityDocs?.selfModel,
    userModel: packet.identityDocs?.userModel,
    convictions: packet.identityDocs?.convictions,
    skillsBlock: packet.skillsBlock,
    pendingRevisions: packet.pendingRevisionsBlock,
    hypomnemaBlock: packet.hypomnema.block,
    continuityNote,
    crisisDirective: extras.crisisDirective,
  };
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
    .select("id, role, content, created_at")
    .eq("thread_id", opts.threadId)
    .order("created_at", { ascending: true })
    .limit(opts.historyLimit || 50);
  if (error) throw new Error(error.message || "history query failed");
  return (data || []) as ContinuityHistoryMessage[];
}

export async function loadFunctionalMemories(
  supabase: SupabaseLike,
  userId: string,
  query: string,
  limit = 8,
): Promise<FunctionalMemory[]> {
  const byId = new Map<string, FunctionalMemory>();
  const genericCatchup = isGenericCatchupQuery(query);

  if (query.trim().length >= 3 && typeof supabase.rpc === "function") {
    const { data, error } = await supabase.rpc("match_memories", {
      query_text: query,
      match_count: limit,
      p_user_id: userId,
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
    .order("pinned", { ascending: false })
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit * 6);
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
    .slice(0, limit);
}

async function loadMnemosAssociations(
  supabase: SupabaseLike,
  userId: string,
  query: string,
  apiKey?: string | null,
): Promise<ActivationResult[]> {
  const mnemos = new MnemosEngine(supabase as any, userId);
  return await mnemos.retrieve(query, { limit: 5, spread_activation: true, api_key: apiKey || undefined });
}

async function loadBeliefs(
  supabase: SupabaseLike,
  userId: string,
): Promise<ContinuityPacket["beliefs"]> {
  const { data, error } = await supabase
    .from("beliefs")
    .select("content, confidence, confidence_tier, domain")
    .eq("user_id", userId)
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
    const flags = [
      memory.pinned ? "pinned" : "",
      memory.is_watchlist ? "watchlist" : "",
      memory.needs_confirmation ? "needs confirmation" : "",
      memory.staleness_risk ? `staleness ${memory.staleness_risk}` : "",
      memory.memory_type,
      `conf ${memory.confidence.toFixed(2)}`,
    ].filter(Boolean).join(", ");
    const date = memory.estimated_date ? ` (${memory.estimated_date})` : "";
    return `- [${flags}]${date} ${memory.content.trim().slice(0, 320)}`;
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
      const type = result.engram?.engram_type || "engram";
      return `- [${type}, activation ${result.activation.toFixed(2)}] ${content.trim().slice(0, 260)}`;
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

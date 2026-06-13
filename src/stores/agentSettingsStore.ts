import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type Env = 'dev' | 'staging' | 'prod';
export type AvatarColor = 'cream' | 'ochre' | 'blue' | 'magenta' | 'sage' | 'violet';
export type CreatedBy = 'system' | 'user' | 'luca';

export interface ToolDef { id: string; name: string; on: boolean; gated?: boolean }
export interface McpServer { id: string; name: string; url: string; status: 'on' | 'off'; meta?: string | null }
export interface SubAgent { id: string; name: string; description: string; model: string; on: boolean }
export interface Voice { id: string; provider: 'elevenlabs' | 'openai' | 'play'; voiceId: string; rate: number; pitch: number }
export interface Secret { id: string; name: string; lastFour: string; status: 'connected' | 'expired' }

export interface Personality {
  inner_life: boolean;
  thought_verbosity: number;
  voice_description: string;
  proactive_autonomy?: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  avatar_color: AvatarColor;
  is_system: boolean;
  locked: boolean;
  created_by: CreatedBy;
  pending: boolean;
  model: string;
  status: 'on' | 'off' | 'errored';
  uptimeMs: number;
  env: Env;
  prompt: string;
  personality: Personality;
  tools: ToolDef[];
  mcp: McpServer[];
  subagents: SubAgent[];
  voices: Voice[];
  secrets: Secret[];
}

export interface CreateAgentInput {
  name: string;
  role: string;
  avatar_color: AvatarColor;
  model: string;
  prompt: string;
  personality?: Partial<Personality>;
}

const SEED_TOOLS: ToolDef[] = [
  { id: 'browse', name: 'browse', on: false, gated: true },
  { id: 'workspace_file', name: 'workspace.file', on: true },
  { id: 'web_search', name: 'web.search', on: true },
  { id: 'read_url', name: 'read.url', on: true },
  { id: 'memory_read', name: 'memory.read', on: true },
  { id: 'memory_write', name: 'memory.write', on: true },
  { id: 'update_soul', name: 'soul.update', on: false, gated: true },
  { id: 'update_self_model', name: 'self-model.update', on: false, gated: true },
];

const DEFAULT_PERSONALITY: Personality = {
  inner_life: true,
  thought_verbosity: 1,
  voice_description: '',
  proactive_autonomy: false,
};

interface AgentSettingsState {
  agents: AgentConfig[];
  loading: boolean;
  draftById: Record<string, Partial<AgentConfig>>;
  load: (userId: string) => Promise<void>;
  getResolved: (id: string) => AgentConfig | null;
  setDraft: (id: string, patch: Partial<AgentConfig>) => void;
  isDirty: (id: string) => boolean;
  discard: (id: string) => void;
  save: (id: string, userId: string) => Promise<{ ok: boolean; error?: string }>;
  createAgent: (userId: string, input: CreateAgentInput) => Promise<{ ok: boolean; id?: string; error?: string }>;
  deleteAgent: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

function mergeConfig(base: AgentConfig, draft: Partial<AgentConfig>): AgentConfig {
  return {
    ...base,
    ...draft,
    personality: draft.personality ?? base.personality,
    tools: draft.tools ?? base.tools,
    mcp: draft.mcp ?? base.mcp,
    subagents: draft.subagents ?? base.subagents,
    voices: draft.voices ?? base.voices,
    secrets: draft.secrets ?? base.secrets,
  };
}

const resolvedConfigCache = new Map<string, {
  base: AgentConfig;
  draft: Partial<AgentConfig> | undefined;
  value: AgentConfig;
}>();

function getCachedResolvedConfig(
  id: string,
  base: AgentConfig,
  draft: Partial<AgentConfig> | undefined,
): AgentConfig {
  if (!draft || Object.keys(draft).length === 0) return base;
  const cached = resolvedConfigCache.get(id);
  if (cached?.base === base && cached.draft === draft) return cached.value;
  const value = mergeConfig(base, draft);
  resolvedConfigCache.set(id, { base, draft, value });
  return value;
}

function normalizeTools(tools: unknown): ToolDef[] {
  const rawTools = Array.isArray(tools) ? tools as ToolDef[] : [];
  const byId = new Map(rawTools.map((tool) => [tool.id, tool]));
  const merged = SEED_TOOLS.map((seed) => {
    const existing = byId.get(seed.id);
    const next = existing ? { ...seed, ...existing } : seed;
    if (seed.id === 'memory_read' || seed.id === 'memory_write') {
      return { ...next, on: true };
    }
    return next;
  });

  const seedIds = new Set(SEED_TOOLS.map((tool) => tool.id));
  const custom = rawTools.filter((tool) => tool?.id && !seedIds.has(tool.id));
  return [...merged, ...custom];
}

function rowToConfig(
  row: Record<string, unknown>,
  mcp: Array<Record<string, unknown>>,
  secrets: Array<Record<string, unknown>>,
): AgentConfig {
  const id = row.id as string;
  const personalityRaw = (row.personality as Partial<Personality> | null) ?? {};
  return {
    id,
    name: (row.name as string) || id,
    role: (row.role as string) || 'custom',
    avatar_color: ((row.avatar_color as AvatarColor) || 'cream'),
    is_system: !!row.is_system,
    locked: !!row.locked,
    created_by: ((row.created_by as CreatedBy) || 'user'),
    pending: !!row.pending,
    model: normalizeAgentModel((row.model as string | null) ?? 'anthropic/claude-opus-4-7'),
    status: 'on',
    uptimeMs: 0,
    env: ((row.env as Env | null) ?? 'prod'),
    prompt: (row.prompt as string | null) ?? '',
    personality: {
      inner_life: personalityRaw.inner_life !== false,
      thought_verbosity:
        typeof personalityRaw.thought_verbosity === 'number' ? personalityRaw.thought_verbosity : 1,
      voice_description:
        typeof personalityRaw.voice_description === 'string' ? personalityRaw.voice_description : '',
      proactive_autonomy: personalityRaw.proactive_autonomy === true,
    },
    tools: normalizeTools(row.tools),
    mcp: mcp
      .filter((m) => m.agent_id === id)
      .map((m): McpServer => ({
        id: m.id as string,
        name: m.name as string,
        url: m.url as string,
        status: ((m.status as string | null) === 'on' ? 'on' : 'off'),
        meta: (m.meta as string | null) ?? null,
      })),
    subagents: (row.subagents as SubAgent[] | null) ?? [],
    voices: (row.voices as Voice[] | null) ?? [],
    secrets: secrets
      .filter((s) => s.agent_id === id)
      .map((s): Secret => ({
        id: s.id as string,
        name: s.name as string,
        lastFour: (s.last_four as string | null) ?? '',
        status: ((s.status as string | null) === 'expired' ? 'expired' : 'connected'),
      })),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

function normalizeAgentModel(model: string | null | undefined): string {
  switch (model) {
    case 'anthropic/claude-sonnet-4-20250514':
      return 'anthropic/claude-sonnet-4';
    case 'anthropic/claude-opus-4-20250514':
      return 'anthropic/claude-opus-4';
    case 'anthropic/claude-opus-4.7':
      return 'anthropic/claude-opus-4-7';
    case 'anthropic/claude-haiku-4-5':
      return 'anthropic/claude-haiku-4.5';
    default:
      return model ?? 'anthropic/claude-opus-4-7';
  }
}

function readFunctionError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

// Sort: Luca first, then user-created agents alphabetically.
function sortAgents(a: AgentConfig, b: AgentConfig): number {
  const rank = (id: string) => (id === 'luca' ? 0 : 1);
  const ra = rank(a.id);
  const rb = rank(b.id);
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
}

export const useAgentSettingsStore = create<AgentSettingsState>((set, get) => ({
  agents: [],
  loading: false,
  draftById: {},

  load: async (userId) => {
    set({ loading: true });
    const [configsRes, mcpRes, secretsRes] = await Promise.allSettled([
      supabase.from('agent_configs').select('*').eq('user_id', userId).eq('pending', false),
      supabase.from('mcp_servers').select('*').eq('user_id', userId),
      supabase.from('agent_secrets').select('*').eq('user_id', userId),
    ]);

    const configs = configsRes.status === 'fulfilled' ? (configsRes.value.data ?? []) : [];
    const mcp = mcpRes.status === 'fulfilled' ? (mcpRes.value.data ?? []) : [];
    const secrets = secretsRes.status === 'fulfilled' ? (secretsRes.value.data ?? []) : [];

    const agents = (configs as Array<Record<string, unknown>>)
      .filter((row) => row.id !== 'observer' && row.id !== 'guardian')
      .map((row) =>
        rowToConfig(row, mcp as Array<Record<string, unknown>>, secrets as Array<Record<string, unknown>>),
      );

    // Sort: Luca → user-created agents (alphabetical). Observer is an alcove sidecar, not an agent setting.
    agents.sort(sortAgents);

    set({ agents, loading: false });
  },

  getResolved: (id) => {
    const base = get().agents.find((a) => a.id === id);
    if (!base) return null;
    const draft = get().draftById[id];
    return getCachedResolvedConfig(id, base, draft);
  },

  setDraft: (id, patch) =>
    set((s) => ({
      draftById: { ...s.draftById, [id]: { ...(s.draftById[id] ?? {}), ...patch } },
    })),

  isDirty: (id) => {
    const draft = get().draftById[id];
    return !!draft && Object.keys(draft).length > 0;
  },

  discard: (id) =>
    set((s) => {
      const next = { ...s.draftById };
      delete next[id];
      return { draftById: next };
    }),

  save: async (id, userId) => {
    void userId;
    const resolved = get().getResolved(id);
    if (!resolved) return { ok: false, error: 'Agent not found' };
    if (resolved.locked) return { ok: false, error: 'This agent is platform-controlled and cannot be edited.' };

    const { data, error } = await supabase.functions.invoke('agent-config-save', {
      body: {
        id,
        name: resolved.name,
        role: resolved.role,
        avatar_color: resolved.avatar_color,
        env: resolved.env,
        model: resolved.model,
        prompt: resolved.prompt,
        personality: resolved.personality,
        tools: resolved.tools,
        subagents: resolved.subagents,
        voices: resolved.voices,
      },
    });

    if (error || (data && typeof data === 'object' && 'error' in data)) {
      console.error('[agentSettingsStore] save failed', error);
      return { ok: false, error: error?.message ?? readFunctionError(data, 'Save failed') };
    }

    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? resolved : a)),
      draftById: Object.fromEntries(Object.entries(s.draftById).filter(([k]) => k !== id)),
    }));
    return { ok: true };
  },

  createAgent: async (userId, input) => {
    void userId;
    const baseId = slugify(input.name) || 'agent';
    // Reject placeholder slugs so we never permanently brand an agent as
    // "draft-agent" / "new-agent" / etc. when the user later renames it.
    const RESERVED_OR_PLACEHOLDER = new Set([
      'agent', 'new-agent', 'draft', 'draft-agent', 'untitled',
      'mnemos-companion', 'companion', 'luca', 'observer', 'anima', 'vektor',
    ]);
    if (RESERVED_OR_PLACEHOLDER.has(baseId)) {
      return { ok: false, error: `"${input.name}" isn't a usable agent name — pick something more specific.` };
    }
    // Try base id, then base-2, base-3 if collisions exist locally
    const existing = new Set(get().agents.map((a) => a.id));
    let id = baseId;
    let n = 2;
    while (existing.has(id)) {
      id = `${baseId}-${n++}`;
    }

    const personality = {
      ...DEFAULT_PERSONALITY,
      ...(input.personality ?? {}),
      proactive_autonomy: false,
    } as Personality;

    const { data, error } = await supabase.functions.invoke('agent-config-save', {
      body: {
        id,
        name: input.name,
        role: input.role,
        avatar_color: input.avatar_color,
        env: 'prod',
        model: input.model,
        prompt: input.prompt,
        personality,
        tools: SEED_TOOLS,
        subagents: [],
        voices: [],
      },
    });

    const config = data && typeof data === 'object' && 'config' in data
      ? (data as { config?: Record<string, unknown> }).config
      : null;
    if (error || !config) {
      console.error('[agentSettingsStore] createAgent failed', error);
      return { ok: false, error: error?.message ?? readFunctionError(data, 'Insert failed') };
    }

    const newAgent = rowToConfig(config, [], []);
    set((s) => ({
      agents: [...s.agents, newAgent].sort(sortAgents),
    }));
    return { ok: true, id };
  },

  deleteAgent: async (id) => {
    const target = get().agents.find((a) => a.id === id);
    if (!target) return { ok: false, error: 'Agent not found' };
    if (target.locked) return { ok: false, error: 'Resident agents cannot be deleted.' };
    if (target.is_system) return { ok: false, error: 'System agents cannot be deleted' };

    const { error } = await supabase.from('agent_configs').delete().eq('id', id);
    if (error) {
      console.error('[agentSettingsStore] deleteAgent failed', error);
      return { ok: false, error: error.message };
    }

    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      draftById: Object.fromEntries(Object.entries(s.draftById).filter(([k]) => k !== id)),
    }));
    return { ok: true };
  },
}));

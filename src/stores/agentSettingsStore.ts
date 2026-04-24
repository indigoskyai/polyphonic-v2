import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type Env = 'dev' | 'staging' | 'prod';

export interface ToolDef { id: string; name: string; on: boolean; gated?: boolean }
export interface McpServer { id: string; name: string; url: string; status: 'on' | 'off'; meta?: string | null }
export interface SubAgent { id: string; name: string; description: string; model: string; on: boolean }
export interface Voice { id: string; provider: 'elevenlabs' | 'openai' | 'play'; voiceId: string; rate: number; pitch: number }
export interface Secret { id: string; name: string; lastFour: string; status: 'connected' | 'expired' }

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
  status: 'on' | 'off' | 'errored';
  uptimeMs: number;
  env: Env;
  prompt: string;
  tools: ToolDef[];
  mcp: McpServer[];
  subagents: SubAgent[];
  voices: Voice[];
  secrets: Secret[];
}

const AGENT_DISPLAY: Record<string, { name: string; role: string; defaultModel: string }> = {
  luca: { name: 'Luca', role: 'orchestrator', defaultModel: 'opus-4-6' },
  vektor: { name: 'Vektor', role: 'analyst', defaultModel: 'sonnet-4-6' },
  anima: { name: 'Anima', role: 'empath', defaultModel: 'sonnet-4-6' },
  observer: { name: 'Observer', role: 'guardian', defaultModel: 'haiku-4-5' },
};

const SEED_TOOLS: ToolDef[] = [
  { id: 'fs_read', name: 'fs.read', on: true },
  { id: 'fs_write', name: 'fs.write', on: false, gated: true },
  { id: 'bash', name: 'bash', on: false, gated: true },
  { id: 'web_search', name: 'web.search', on: true },
  { id: 'memory_read', name: 'memory.read', on: true },
  { id: 'memory_write', name: 'memory.write', on: false },
];

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
}

function mergeConfig(base: AgentConfig, draft: Partial<AgentConfig>): AgentConfig {
  return { ...base, ...draft, tools: draft.tools ?? base.tools, mcp: draft.mcp ?? base.mcp, subagents: draft.subagents ?? base.subagents, voices: draft.voices ?? base.voices, secrets: draft.secrets ?? base.secrets };
}

export const useAgentSettingsStore = create<AgentSettingsState>((set, get) => ({
  agents: [],
  loading: false,
  draftById: {},

  load: async (userId) => {
    set({ loading: true });
    const [configsRes, mcpRes, secretsRes] = await Promise.allSettled([
      supabase.from('agent_configs').select('*').eq('user_id', userId),
      supabase.from('mcp_servers').select('*').eq('user_id', userId),
      supabase.from('agent_secrets').select('*').eq('user_id', userId),
    ]);

    const configs = configsRes.status === 'fulfilled' ? (configsRes.value.data ?? []) : [];
    const mcp = mcpRes.status === 'fulfilled' ? (mcpRes.value.data ?? []) : [];
    const secrets = secretsRes.status === 'fulfilled' ? (secretsRes.value.data ?? []) : [];

    const configById: Record<string, AgentConfig> = {};

    for (const key of Object.keys(AGENT_DISPLAY)) {
      const display = AGENT_DISPLAY[key];
      const row = configs.find((c) => c.id === key) as Record<string, unknown> | undefined;
      const tools = (row?.tools as ToolDef[] | undefined) ?? SEED_TOOLS;
      const subagents = (row?.subagents as SubAgent[] | undefined) ?? [];
      const voices = (row?.voices as Voice[] | undefined) ?? [];
      configById[key] = {
        id: key,
        name: display.name,
        role: display.role,
        model: (row?.model as string | null | undefined) ?? display.defaultModel,
        status: 'on',
        uptimeMs: 0,
        env: ((row?.env as Env | null | undefined) ?? 'prod') as Env,
        prompt: (row?.prompt as string | null | undefined) ?? '',
        tools,
        mcp: mcp.filter((m) => m.agent_id === key).map((m): McpServer => ({
          id: m.id as string,
          name: m.name as string,
          url: m.url as string,
          status: ((m.status as string | null) === 'on' ? 'on' : 'off'),
          meta: (m.meta as string | null) ?? null,
        })),
        subagents,
        voices,
        secrets: secrets.filter((s) => s.agent_id === key).map((s): Secret => ({
          id: s.id as string,
          name: s.name as string,
          lastFour: (s.last_four as string | null) ?? '',
          status: ((s.status as string | null) === 'expired' ? 'expired' : 'connected'),
        })),
      };
    }

    set({ agents: Object.values(configById), loading: false });
  },

  getResolved: (id) => {
    const base = get().agents.find((a) => a.id === id);
    if (!base) return null;
    const draft = get().draftById[id];
    if (!draft) return base;
    return mergeConfig(base, draft);
  },

  setDraft: (id, patch) => set((s) => ({
    draftById: { ...s.draftById, [id]: { ...(s.draftById[id] ?? {}), ...patch } },
  })),

  isDirty: (id) => {
    const draft = get().draftById[id];
    return !!draft && Object.keys(draft).length > 0;
  },

  discard: (id) => set((s) => {
    const next = { ...s.draftById };
    delete next[id];
    return { draftById: next };
  }),

  save: async (id, userId) => {
    const resolved = get().getResolved(id);
    if (!resolved) return { ok: false, error: 'Agent not found' };

    const { error } = await supabase.functions.invoke('agent-config-save', {
      body: {
        id,
        env: resolved.env,
        model: resolved.model,
        prompt: resolved.prompt,
        tools: resolved.tools,
        subagents: resolved.subagents,
        voices: resolved.voices,
      },
    });
    if (error) {
      console.error('[agentSettingsStore] save failed', error);
      return { ok: false, error: error.message };
    }

    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? resolved : a)),
      draftById: Object.fromEntries(Object.entries(s.draftById).filter(([k]) => k !== id)),
    }));
    return { ok: true };
  },
}));

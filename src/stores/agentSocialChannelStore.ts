import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type XApprovalMode = 'approval_required' | 'autopilot';
export type XBillingMode = 'subscription_credits' | 'mnemos_credits';

export interface AgentXPolicy {
  approval_mode: XApprovalMode;
  cadence_per_day: number;
  topics: string[];
  prohibited_topics: string[];
  human_account_handle: string;
  bot_disclosure_confirmed: boolean;
  automated_label_confirmed: boolean;
  no_spam_confirmed: boolean;
  x_rules_acknowledged_at: string | null;
}

export interface AgentXBilling {
  mode: XBillingMode;
  post_cost_credits: number;
  daily_spend_limit_credits: number;
}

export interface AgentXChannel {
  id: string;
  user_id: string;
  agent_id: string;
  platform: 'x';
  status: 'draft' | 'connecting' | 'connected' | 'needs_attention' | 'disconnected';
  x_user_id: string | null;
  x_username: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  posting_enabled: boolean;
  policy: AgentXPolicy;
  billing: AgentXBilling;
  connected_at: string | null;
  last_posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentXPost {
  id: string;
  status: 'draft' | 'queued' | 'approved' | 'posting' | 'posted' | 'failed' | 'cancelled';
  text: string;
  scheduled_for: string | null;
  posted_at: string | null;
  external_post_id: string | null;
  failure_reason: string | null;
  cost_credits: number;
  created_at: string;
}

export interface AgentXSummary {
  channel: AgentXChannel | null;
  balance_credits: number;
  posts: AgentXPost[];
  defaults: {
    policy: AgentXPolicy;
    billing: AgentXBilling;
  };
}

interface AgentSocialChannelState {
  byAgentId: Record<string, AgentXSummary>;
  loadingByAgentId: Record<string, boolean>;
  errorByAgentId: Record<string, string | null>;
  loadX: (agentId: string) => Promise<AgentXSummary | null>;
  startXConnect: (agentId: string, redirectPath?: string) => Promise<{ ok: boolean; authUrl?: string; error?: string }>;
  configureX: (
    agentId: string,
    patch: { policy?: Partial<AgentXPolicy>; billing?: Partial<AgentXBilling>; posting_enabled?: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;
  disconnectX: (agentId: string) => Promise<{ ok: boolean; error?: string }>;
  runXAutopilot: (
    agentId: string,
    input?: { force?: boolean },
  ) => Promise<{ ok: boolean; error?: string; result?: unknown }>;
  draftXPost: (agentId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  approveXPost: (agentId: string, postId: string) => Promise<{ ok: boolean; error?: string }>;
  postXNow: (agentId: string, input: { postId?: string; text?: string; explicitApproval?: boolean }) => Promise<{ ok: boolean; error?: string }>;
}

const EMPTY_POLICY: AgentXPolicy = {
  approval_mode: 'approval_required',
  cadence_per_day: 2,
  topics: [],
  prohibited_topics: [],
  human_account_handle: '',
  bot_disclosure_confirmed: false,
  automated_label_confirmed: false,
  no_spam_confirmed: false,
  x_rules_acknowledged_at: null,
};

const EMPTY_BILLING: AgentXBilling = {
  mode: 'subscription_credits',
  post_cost_credits: 1,
  daily_spend_limit_credits: 6,
};

function fallbackSummary(): AgentXSummary {
  return {
    channel: null,
    balance_credits: 0,
    posts: [],
    defaults: {
      policy: EMPTY_POLICY,
      billing: EMPTY_BILLING,
    },
  };
}

function normalizeSummary(value: unknown): AgentXSummary {
  if (!value || typeof value !== 'object') return fallbackSummary();
  const raw = value as Partial<AgentXSummary>;
  return {
    channel: raw.channel ?? null,
    balance_credits: Number(raw.balance_credits ?? 0),
    posts: Array.isArray(raw.posts) ? raw.posts : [],
    defaults: {
      policy: raw.defaults?.policy ?? EMPTY_POLICY,
      billing: raw.defaults?.billing ?? EMPTY_BILLING,
    },
  };
}

function readInvokeError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}

async function invokeChannel(agentId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('agent-social-x-channel', {
    body: { agent_id: agentId, ...body },
  });
  if (error || (data && typeof data === 'object' && 'error' in data)) {
    return {
      ok: false as const,
      error: error?.message ?? readInvokeError(data, 'X channel request failed'),
      data,
    };
  }
  return { ok: true as const, data };
}

export const useAgentSocialChannelStore = create<AgentSocialChannelState>((set, get) => ({
  byAgentId: {},
  loadingByAgentId: {},
  errorByAgentId: {},

  loadX: async (agentId) => {
    set((state) => ({
      loadingByAgentId: { ...state.loadingByAgentId, [agentId]: true },
      errorByAgentId: { ...state.errorByAgentId, [agentId]: null },
    }));
    const result = await invokeChannel(agentId, { action: 'status' });
    if (!result.ok) {
      set((state) => ({
        loadingByAgentId: { ...state.loadingByAgentId, [agentId]: false },
        errorByAgentId: { ...state.errorByAgentId, [agentId]: result.error },
      }));
      return null;
    }
    const summary = normalizeSummary(result.data);
    set((state) => ({
      byAgentId: { ...state.byAgentId, [agentId]: summary },
      loadingByAgentId: { ...state.loadingByAgentId, [agentId]: false },
      errorByAgentId: { ...state.errorByAgentId, [agentId]: null },
    }));
    return summary;
  },

  startXConnect: async (agentId, redirectPath) => {
    const { data, error } = await supabase.functions.invoke('agent-social-x-oauth-start', {
      body: {
        agent_id: agentId,
        redirect_path: redirectPath ?? `/settings/agents/${agentId}`,
      },
    });
    if (error || (data && typeof data === 'object' && 'error' in data)) {
      return { ok: false, error: error?.message ?? readInvokeError(data, 'Could not start X connection') };
    }
    const authUrl = data && typeof data === 'object' && 'auth_url' in data
      ? String((data as { auth_url?: unknown }).auth_url ?? '')
      : '';
    if (!authUrl) return { ok: false, error: 'X did not return a connection URL' };
    return { ok: true, authUrl };
  },

  configureX: async (agentId, patch) => {
    const result = await invokeChannel(agentId, { action: 'configure', ...patch });
    if (!result.ok) return { ok: false, error: result.error };
    const summary = normalizeSummary(result.data);
    set((state) => ({ byAgentId: { ...state.byAgentId, [agentId]: summary } }));
    return { ok: true };
  },

  disconnectX: async (agentId) => {
    const result = await invokeChannel(agentId, { action: 'disconnect' });
    if (!result.ok) return { ok: false, error: result.error };
    const summary = normalizeSummary(result.data);
    set((state) => ({ byAgentId: { ...state.byAgentId, [agentId]: summary } }));
    return { ok: true };
  },

  runXAutopilot: async (agentId, input) => {
    const { data, error } = await supabase.functions.invoke('agent-social-x-autopilot', {
      body: {
        action: 'run_once',
        agent_id: agentId,
        force: input?.force === true,
      },
    });
    if (error || (data && typeof data === 'object' && 'error' in data)) {
      return { ok: false, error: error?.message ?? readInvokeError(data, 'Autonomous posting request failed') };
    }
    await get().loadX(agentId);
    const result = data && typeof data === 'object' && 'result' in data
      ? (data as { result?: unknown }).result
      : data;
    return { ok: true, result };
  },

  draftXPost: async (agentId, text) => {
    const result = await invokeChannel(agentId, { action: 'draft_post', text });
    if (!result.ok) return { ok: false, error: result.error };
    const data = result.data as { summary?: unknown };
    const summary = normalizeSummary(data?.summary ?? result.data);
    set((state) => ({ byAgentId: { ...state.byAgentId, [agentId]: summary } }));
    return { ok: true };
  },

  approveXPost: async (agentId, postId) => {
    const result = await invokeChannel(agentId, { action: 'approve_post', post_id: postId });
    if (!result.ok) return { ok: false, error: result.error };
    const summary = normalizeSummary(result.data);
    set((state) => ({ byAgentId: { ...state.byAgentId, [agentId]: summary } }));
    return { ok: true };
  },

  postXNow: async (agentId, input) => {
    const result = await invokeChannel(agentId, {
      action: 'post_now',
      post_id: input.postId,
      text: input.text,
      explicit_approval: input.explicitApproval === true,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const data = result.data as { summary?: unknown };
    const summary = normalizeSummary(data?.summary ?? result.data);
    set((state) => ({ byAgentId: { ...state.byAgentId, [agentId]: summary } }));
    return { ok: true };
  },
}));

export function selectAgentXSummary(agentId: string): AgentXSummary {
  return useAgentSocialChannelStore.getState().byAgentId[agentId] ?? fallbackSummary();
}

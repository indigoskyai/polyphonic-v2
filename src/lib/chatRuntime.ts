export type ThreadRuntimeMode = 'classic' | 'agent';

export interface ChatModelOption {
  id: string;
  name: string;
  flags: { label: string; variant?: 'reasoning' | 'multimodal' | 'default' }[];
}

export const DEFAULT_CHAT_MODEL = 'moonshotai/kimi-k2.6';

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', flags: [{ label: 'Default', variant: 'default' }, { label: 'Multimodal', variant: 'multimodal' }] },
  { id: 'anthropic/claude-opus-4-7', name: 'Claude Opus 4.7', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', flags: [] },
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.3-chat', name: 'GPT-5.3 Chat', flags: [] },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', flags: [] },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', flags: [] },
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20', flags: [] },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', flags: [] },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', flags: [] },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', flags: [] },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', flags: [] },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', flags: [] },
  { id: 'qwen/qwen3-max', name: 'Qwen3 Max', flags: [] },
];

export function normalizeThreadRuntimeMode(
  value: string | null | undefined,
  fallback: ThreadRuntimeMode = 'classic',
): ThreadRuntimeMode {
  return value === 'agent' || value === 'classic' ? value : fallback;
}

export function defaultRuntimeForAgent(agentId: string | null | undefined): ThreadRuntimeMode {
  return agentId && agentId !== 'luca' ? 'agent' : 'classic';
}

const MODEL_ID_ALIASES: Record<string, string> = {
  'anthropic/claude-opus-4.7': 'anthropic/claude-opus-4-7',
  'anthropic/claude-4.7-opus-20260416': 'anthropic/claude-opus-4-7',
};

export function normalizeChatModelId(modelId: string | null | undefined): string {
  const id = modelId || DEFAULT_CHAT_MODEL;
  return MODEL_ID_ALIASES[id] || id;
}

export function getChatModelLabel(modelId: string | null | undefined): string {
  const id = normalizeChatModelId(modelId);
  return CHAT_MODEL_OPTIONS.find((model) => model.id === id)?.name || id.split('/').pop() || id;
}

export function getModelFamily(modelId: string | null | undefined): string {
  const provider = String(modelId || DEFAULT_CHAT_MODEL).split('/')[0]?.toLowerCase() || 'openrouter';
  return provider.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'openrouter';
}

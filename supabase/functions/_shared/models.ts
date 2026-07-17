/**
 * Reasoning Model Registry
 *
 * Maps OpenRouter model IDs to their reasoning capabilities and
 * the correct parameter format for enabling thinking/reasoning.
 */

import {
  getDefaultMaxOutputTokens,
  getHistoryRowLimit,
  getInputTokenBudget,
  getModelCapabilities,
  normalizeReasoningEffort as normalizeCapabilityReasoningEffort,
  type ModelParameterStyle,
  type ModelReasoningEffort,
} from '../../../shared/modelCapabilities.ts';

export type ParamStyle = ModelParameterStyle;
export type ReasoningEffort = ModelReasoningEffort;

interface ModelMeta {
  reasoning: true;
  paramStyle: ParamStyle;
  label: string;
}

export const REASONING_MODELS: Record<string, ModelMeta> = {
  // Anthropic — uses thinking.type + budget_tokens
  'anthropic/claude-opus-4.8': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.8' },
  'anthropic/claude-4.8-opus-20260528': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.8' },
  'anthropic/claude-opus-4-7': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.7' },
  'anthropic/claude-opus-4.7': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.7' },
  'anthropic/claude-4.7-opus-20260416': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.7' },
  'anthropic/claude-opus-4.6': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.6' },
  'anthropic/claude-opus-4.6-fast': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.6 Fast' },
  'anthropic/claude-opus-4.5': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.5' },
  'anthropic/claude-4.5-opus-20251124': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.5' },
  'anthropic/claude-opus-4.1': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.1' },
  'anthropic/claude-4.1-opus-20250805': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4.1' },
  'anthropic/claude-opus-4': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4' },
  'anthropic/claude-sonnet-4.6': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Sonnet 4.6' },
  'anthropic/claude-sonnet-4.5': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Sonnet 4.5' },
  'anthropic/claude-sonnet-4': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Sonnet 4' },
  'anthropic/claude-haiku-4.5': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Haiku 4.5' },
  'anthropic/claude-3.7-sonnet': { reasoning: true, paramStyle: 'anthropic', label: 'Claude 3.7 Sonnet' },
  'anthropic/claude-3.7-sonnet:thinking': { reasoning: true, paramStyle: 'anthropic', label: 'Claude 3.7 Sonnet (thinking)' },

  // OpenAI GPT-5 series — uses reasoning.effort + reasoning_details in response
  'openai/gpt-5.4': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.4' },
  'openai/gpt-5.4-mini': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.4 Mini' },
  'openai/gpt-5.4-nano': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.4 Nano' },
  'openai/gpt-5.4-pro': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.4 Pro' },
  'openai/gpt-5.2': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.2' },
  'openai/gpt-5.2-pro': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.2 Pro' },
  'openai/gpt-5.1': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.1' },
  'openai/gpt-5': { reasoning: true, paramStyle: 'openai', label: 'GPT-5' },
  'openai/gpt-5-mini': { reasoning: true, paramStyle: 'openai', label: 'GPT-5 Mini' },
  'openai/gpt-5-pro': { reasoning: true, paramStyle: 'openai', label: 'GPT-5 Pro' },

  // Moonshot Kimi K3 — OpenRouter exposes reasoning.effort and reasoning details.
  'moonshotai/kimi-k3': { reasoning: true, paramStyle: 'kimi-k3', label: 'Kimi K3' },

  // Google Gemini 3.x — uses thinking.thinkingLevel
  'google/gemini-3.1-pro-preview': { reasoning: true, paramStyle: 'google-v3', label: 'Gemini 3.1 Pro' },
  'google/gemini-3-flash-preview': { reasoning: true, paramStyle: 'google-v3', label: 'Gemini 3 Flash' },

  // Google Gemini 2.5 — uses thinking.enabled + budget_tokens
  'google/gemini-2.5-pro': { reasoning: true, paramStyle: 'google-v2', label: 'Gemini 2.5 Pro' },
  'google/gemini-2.5-flash': { reasoning: true, paramStyle: 'google-v2', label: 'Gemini 2.5 Flash' },
};

/** Check if a model supports reasoning/thinking output. */
export function isReasoningModel(modelId: string): boolean {
  return modelId in REASONING_MODELS;
}

/** Get display label for a model. */
export function getModelLabel(modelId: string): string {
  return REASONING_MODELS[modelId]?.label || modelId.split('/').pop() || modelId;
}

/** Normalize stale clients to the provider-supported effort for this model. */
export function normalizeReasoningEffort(modelId: string, effort: string | null | undefined): ReasoningEffort {
  return normalizeCapabilityReasoningEffort(modelId, effort);
}

export function getModelDefaultMaxOutputTokens(modelId: string, fallback = 16_000): number {
  return getDefaultMaxOutputTokens(modelId, fallback);
}

export function getModelInputTokenBudget(modelId: string): number | null {
  return getInputTokenBudget(modelId);
}

export function getModelHistoryRowLimit(modelId: string, fallback: number): number {
  return getHistoryRowLimit(modelId, fallback);
}

export function shouldPreserveReasoningDetails(modelId: string): boolean {
  return getModelCapabilities(modelId)?.reasoningPreservation === true;
}

/**
 * Build the correct reasoning/thinking parameters for a model's API request.
 * Returns an object to spread into the OpenRouter request body.
 */
export function buildReasoningParams(
  modelId: string,
  effort: ReasoningEffort = 'medium',
): Record<string, unknown> {
  const meta = REASONING_MODELS[modelId];
  if (!meta) return {};
  const normalizedEffort = normalizeReasoningEffort(modelId, effort);

  switch (meta.paramStyle) {
    case 'anthropic': {
      // Anthropic extended thinking via OpenRouter
      const budgetMap: Record<ReasoningEffort, number> = {
        low: 2048,
        medium: 8192,
        high: 32768,
        max: 65536,
      };
      return {
        thinking: {
          type: 'enabled',
          budget_tokens: budgetMap[normalizedEffort],
        },
      };
    }

    case 'openai': {
      // OpenAI GPT-5.x reasoning via OpenRouter
      return {
        reasoning: {
          effort: normalizedEffort,
        },
      };
    }

    case 'kimi-k3': {
      // K3 is not a K2 thinking model. OpenRouter expects the top-level field,
      // and the current release supports mandatory max reasoning only.
      return { reasoning_effort: normalizedEffort };
    }

    case 'google-v3': {
      // Gemini 3.x uses thinkingLevel
      return {
        thinking: {
          thinkingLevel: normalizedEffort === 'max' ? 'high' : normalizedEffort,
        },
      };
    }

    case 'google-v2': {
      // Gemini 2.5 uses enabled + budget_tokens
      const budgetMap: Record<ReasoningEffort, number> = {
        low: 2048,
        medium: 8192,
        high: 32768,
        max: 65536,
      };
      return {
        thinking: {
          enabled: true,
          budget_tokens: budgetMap[normalizedEffort],
        },
      };
    }

    default:
      return {};
  }
}

/**
 * Extract thinking/reasoning content from a non-streaming OpenRouter response.
 * Different providers return reasoning in different fields.
 */
export function extractThinkingFromResponse(
  // deno-lint-ignore no-explicit-any
  data: any,
  modelId: string,
): string | null {
  const meta = REASONING_MODELS[modelId];
  if (!meta) return null;

  const choice = data?.choices?.[0];
  if (!choice) return null;

  // Anthropic: reasoning in message.reasoning_content or message.thinking
  if (meta.paramStyle === 'anthropic') {
    return choice.message?.reasoning_content || choice.message?.thinking || null;
  }

  // OpenAI GPT-5.x: reasoning in reasoning_details array
  if (meta.paramStyle === 'openai' || meta.paramStyle === 'kimi-k3') {
    const details = choice.message?.reasoning_details || choice.reasoning_details;
    if (Array.isArray(details)) {
      return details
        .filter((d: { type?: string; content?: string }) => d.type === 'thinking' && d.content)
        .map((d: { content: string }) => d.content)
        .join('\n') || null;
    }
    // Fallback: some models use reasoning_content directly
    return choice.message?.reasoning_content || null;
  }

  // Google Gemini: reasoning in message.thinking or message.reasoning_content
  if (meta.paramStyle === 'google-v3' || meta.paramStyle === 'google-v2') {
    return choice.message?.thinking || choice.message?.reasoning_content || null;
  }

  return null;
}

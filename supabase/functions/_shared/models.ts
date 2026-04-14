/**
 * Reasoning Model Registry
 *
 * Maps OpenRouter model IDs to their reasoning capabilities and
 * the correct parameter format for enabling thinking/reasoning.
 */

export type ParamStyle = 'anthropic' | 'openai' | 'google-v3' | 'google-v2';
export type ReasoningEffort = 'low' | 'medium' | 'high';

interface ModelMeta {
  reasoning: true;
  paramStyle: ParamStyle;
  label: string;
}

export const REASONING_MODELS: Record<string, ModelMeta> = {
  // Anthropic — uses thinking.type + budget_tokens
  'anthropic/claude-sonnet-4-20250514': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Sonnet 4' },
  'anthropic/claude-opus-4-20250514': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Opus 4' },
  'anthropic/claude-haiku-3.5-20241022': { reasoning: true, paramStyle: 'anthropic', label: 'Claude Haiku 3.5' },

  // OpenAI GPT-5 series — uses reasoning.effort + reasoning_details in response
  'openai/gpt-5.4': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.4' },
  'openai/gpt-5.4-mini': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.4 Mini' },
  'openai/gpt-5.2': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.2' },
  'openai/gpt-5.1': { reasoning: true, paramStyle: 'openai', label: 'GPT-5.1' },
  'openai/gpt-5': { reasoning: true, paramStyle: 'openai', label: 'GPT-5' },

  // Google Gemini 3.x — uses thinking.thinkingLevel
  'google/gemini-3.1-pro-preview': { reasoning: true, paramStyle: 'google-v3', label: 'Gemini 3.1 Pro' },
  'google/gemini-3-pro-preview': { reasoning: true, paramStyle: 'google-v3', label: 'Gemini 3 Pro' },
  'google/gemini-3-flash-preview': { reasoning: true, paramStyle: 'google-v3', label: 'Gemini 3 Flash' },

  // Google Gemini 2.5 (legacy) — uses thinking.enabled + budget_tokens
  'google/gemini-2.5-pro-preview-03-25': { reasoning: true, paramStyle: 'google-v2', label: 'Gemini 2.5 Pro' },
};

/** Check if a model supports reasoning/thinking output. */
export function isReasoningModel(modelId: string): boolean {
  return modelId in REASONING_MODELS;
}

/** Get display label for a model. */
export function getModelLabel(modelId: string): string {
  return REASONING_MODELS[modelId]?.label || modelId.split('/').pop() || modelId;
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

  switch (meta.paramStyle) {
    case 'anthropic': {
      // Anthropic extended thinking via OpenRouter
      const budgetMap: Record<ReasoningEffort, number> = {
        low: 2048,
        medium: 8192,
        high: 32768,
      };
      return {
        thinking: {
          type: 'enabled',
          budget_tokens: budgetMap[effort],
        },
      };
    }

    case 'openai': {
      // OpenAI GPT-5.x reasoning via OpenRouter
      return {
        reasoning: {
          effort,
        },
      };
    }

    case 'google-v3': {
      // Gemini 3.x uses thinkingLevel
      return {
        thinking: {
          thinkingLevel: effort,
        },
      };
    }

    case 'google-v2': {
      // Gemini 2.5 uses enabled + budget_tokens
      const budgetMap: Record<ReasoningEffort, number> = {
        low: 2048,
        medium: 8192,
        high: 32768,
      };
      return {
        thinking: {
          enabled: true,
          budget_tokens: budgetMap[effort],
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
  if (meta.paramStyle === 'openai') {
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

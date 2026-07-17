/**
 * Provider capability data shared by the browser and edge runtime.
 *
 * This is the checked-in fallback used when provider discovery is unavailable.
 * `npm run check:model-capabilities` compares it with OpenRouter at release time.
 */
export type ModelReasoningEffort = "low" | "medium" | "high" | "max";
export type ModelInputModality = "text" | "image" | "audio" | "video" | "file";
export type ModelParameterStyle =
  | "anthropic"
  | "openai"
  | "google-v3"
  | "google-v2"
  | "kimi-k3";

export interface ModelCapabilities {
  contextWindow: number;
  defaultMaxOutputTokens: number;
  maxOutputTokens: number;
  inputModalities: ModelInputModality[];
  supportedReasoningEfforts: ModelReasoningEffort[];
  reasoningMandatory: boolean;
  parameterStyle: ModelParameterStyle;
  streaming: boolean;
  tools: boolean;
  toolChoice: boolean;
  structuredOutput: boolean;
  reasoningPreservation: boolean;
}

export const KIMI_K3_MODEL_ID = "moonshotai/kimi-k3";
export const KIMI_K3_SYSTEM_AND_SAFETY_RESERVE = 65_536;

export const MODEL_CAPABILITIES: Readonly<Record<string, ModelCapabilities>> = {
  [KIMI_K3_MODEL_ID]: {
    contextWindow: 1_048_576,
    defaultMaxOutputTokens: 131_072,
    maxOutputTokens: 1_048_576,
    inputModalities: ["text", "image"],
    supportedReasoningEfforts: ["max"],
    reasoningMandatory: true,
    parameterStyle: "kimi-k3",
    streaming: true,
    tools: true,
    toolChoice: true,
    structuredOutput: true,
    reasoningPreservation: true,
  },
};

export function getModelCapabilities(modelId: string | null | undefined): ModelCapabilities | null {
  return MODEL_CAPABILITIES[String(modelId || "")] || null;
}

export function getSupportedReasoningEfforts(
  modelId: string | null | undefined,
  fallback: readonly ModelReasoningEffort[] = ["low", "medium", "high"],
): ModelReasoningEffort[] {
  const configured = getModelCapabilities(modelId)?.supportedReasoningEfforts;
  return configured?.length ? [...configured] : [...fallback];
}

export function normalizeReasoningEffort(
  modelId: string | null | undefined,
  requested: string | null | undefined,
  fallback: ModelReasoningEffort = "medium",
): ModelReasoningEffort {
  const supported = getModelCapabilities(modelId)?.supportedReasoningEfforts;
  return resolveReasoningEffortForCapabilities(supported, requested, fallback);
}

export function resolveReasoningEffortForCapabilities(
  supported: readonly ModelReasoningEffort[] | null | undefined,
  requested: string | null | undefined,
  fallback: ModelReasoningEffort = "medium",
): ModelReasoningEffort {
  if (!supported?.length) {
    return requested === "low" || requested === "medium" || requested === "high" || requested === "max"
      ? requested
      : fallback;
  }
  if (requested && supported.includes(requested as ModelReasoningEffort)) {
    return requested as ModelReasoningEffort;
  }
  return supported.includes(fallback) ? fallback : supported[supported.length - 1];
}

export function getInputTokenBudget(modelId: string | null | undefined): number | null {
  const capabilities = getModelCapabilities(modelId);
  if (!capabilities) return null;
  return Math.max(
    0,
    capabilities.contextWindow
      - capabilities.defaultMaxOutputTokens
      - KIMI_K3_SYSTEM_AND_SAFETY_RESERVE,
  );
}

export function getDefaultMaxOutputTokens(
  modelId: string | null | undefined,
  fallback = 16_000,
): number {
  return getModelCapabilities(modelId)?.defaultMaxOutputTokens || fallback;
}

export function getHistoryRowLimit(modelId: string | null | undefined, fallback: number): number {
  return getModelCapabilities(modelId) ? 1_000 : fallback;
}

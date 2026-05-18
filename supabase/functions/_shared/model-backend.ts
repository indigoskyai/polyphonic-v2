// Resolves which upstream chat-completions backend to use for a user.
//
// - If the user has connected an OpenRouter API key, we use OpenRouter exactly
//   as before (no behaviour change, they keep model selection and the full
//   council/pipeline stack).
// - Otherwise we fall back to the Lovable AI Gateway via LOVABLE_API_KEY so
//   brand-new signups can chat immediately. The gateway is OpenAI-compatible.
//
// This helper intentionally has no Supabase typing imports — it just takes a
// service-role client.

export type ChatBackend = {
  provider: "openrouter" | "lovable";
  apiKey: string;
  baseUrl: string;          // chat/completions URL
  headers: Record<string, string>;
  model: string;            // model id to send upstream
  // True when the saved model id is not portable to this backend and we had
  // to substitute a default. Callers may surface this in logs.
  substitutedModel: boolean;
};

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Default free-tier model for Lovable AI Gateway.
const LOVABLE_DEFAULT_MODEL = "google/gemini-3-flash-preview";

// Models actually exposed by Lovable AI Gateway. Anything else (Anthropic,
// OpenRouter-only slugs, etc.) gets remapped to the default.
const LOVABLE_SUPPORTED = new Set<string>([
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5.2",
]);

export async function resolveChatBackend(
  supabase: any,
  userId: string,
  requestedModel: string,
): Promise<ChatBackend> {
  // 1. Try the user's OpenRouter key first.
  const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
  const openRouterKey: string | null =
    (typeof userKeyData === "string" ? userKeyData.trim() : null) || null;

  if (openRouterKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterKey,
      baseUrl: OPENROUTER_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Luca",
      },
      model: requestedModel,
      substitutedModel: false,
    };
  }

  // 2. Fall back to Lovable AI Gateway.
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    throw new Error("no_backend_available");
  }

  const portable = LOVABLE_SUPPORTED.has(requestedModel);
  return {
    provider: "lovable",
    apiKey: lovableKey,
    baseUrl: LOVABLE_GATEWAY_URL,
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey,
      Authorization: `Bearer ${lovableKey}`,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    model: portable ? requestedModel : LOVABLE_DEFAULT_MODEL,
    substitutedModel: !portable,
  };
}

// Shared helper: resolve image generation provider/model per user.
// Default provider is OpenRouter (uses user's OpenRouter key, falls back
// to system OPENROUTER_API_KEY). Users can opt into their personal
// OpenAI key by setting image_provider = 'openai' in user_settings.

export type ImageProvider = "openrouter" | "openai";

export interface ImageModelConfig {
  provider: ImageProvider;
  model: string;
  apiKey: string;
  keySource: "user" | "system";
}

export const DEFAULT_OPENROUTER_IMAGE_MODEL = "google/gemini-2.5-flash-image";
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";

export async function resolveImageModel(
  supabase: any,
  userId: string,
): Promise<{ config: ImageModelConfig | null; error?: string }> {
  let provider: ImageProvider = "openrouter";
  let model = DEFAULT_OPENROUTER_IMAGE_MODEL;

  if (userId && userId !== "system") {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("image_provider, image_model")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings?.image_provider === "openai") provider = "openai";
    if (typeof settings?.image_model === "string" && settings.image_model.trim()) {
      model = settings.image_model.trim();
    } else if (provider === "openai") {
      model = DEFAULT_OPENAI_IMAGE_MODEL;
    }
  }

  if (provider === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return { config: null, error: "OpenAI image generation not configured (OPENAI_API_KEY missing)" };
    return { config: { provider, model, apiKey: key, keySource: "system" } };
  }

  // OpenRouter — prefer user's key, fall back to system key.
  let userKey = "";
  if (userId && userId !== "system") {
    const { data } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    userKey = typeof data === "string" ? data.trim() : "";
  }
  const key = userKey || Deno.env.get("OPENROUTER_API_KEY")?.trim() || "";
  if (!key) return { config: null, error: "OpenRouter image generation not configured" };
  return {
    config: { provider, model, apiKey: key, keySource: userKey ? "user" : "system" },
  };
}

const OPENROUTER_HEADERS = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://polyphonic.chat",
  "X-Title": "Polyphonic",
});

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  revisedPrompt?: string;
}

export async function generateViaOpenRouter(
  config: ImageModelConfig,
  prompt: string,
  sourceImage?: { bytes: Uint8Array; mimeType: string },
): Promise<GeneratedImage> {
  const content: any[] = [{ type: "text", text: prompt }];
  if (sourceImage) {
    const b64 = btoa(String.fromCharCode(...sourceImage.bytes));
    content.push({
      type: "image_url",
      image_url: { url: `data:${sourceImage.mimeType};base64,${b64}` },
    });
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: OPENROUTER_HEADERS(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ImageProviderError(res.status, `OpenRouter image failed: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url as string | undefined;
  if (!url) throw new ImageProviderError(422, "No image returned");
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new ImageProviderError(422, "Unexpected image payload");
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { bytes, mimeType: match[1] || "image/png" };
}

export async function generateViaOpenAI(
  config: ImageModelConfig,
  prompt: string,
  aspect?: string,
  transparent?: boolean,
  sourceImage?: { bytes: Uint8Array; mimeType: string },
): Promise<GeneratedImage> {
  const size = (() => {
    switch ((aspect || "").toLowerCase()) {
      case "wide": case "landscape": case "16:9": case "3:2": return "1536x1024";
      case "tall": case "portrait": case "9:16": case "2:3": return "1024x1536";
      case "square": case "1:1": return "1024x1024";
      default: return "auto";
    }
  })();

  if (sourceImage) {
    const form = new FormData();
    form.append("model", config.model);
    form.append("prompt", prompt);
    form.append("n", "1");
    form.append("size", "auto");
    form.append("quality", "medium");
    form.append("image", new Blob([sourceImage.bytes], { type: sourceImage.mimeType }), "source.png");
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ImageProviderError(res.status, `OpenAI edit failed: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const item = data?.data?.[0];
    const b64 = item?.b64_json as string | undefined;
    if (!b64) throw new ImageProviderError(422, "No image returned");
    return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), mimeType: "image/png" };
  }

  const body: Record<string, unknown> = {
    model: config.model,
    prompt,
    n: 1,
    size,
    quality: "medium",
    output_format: "png",
  };
  if (transparent) body.background = "transparent";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ImageProviderError(res.status, `OpenAI image failed: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const item = data?.data?.[0];
  const b64 = item?.b64_json as string | undefined;
  if (!b64) throw new ImageProviderError(422, "No image returned");
  return {
    bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    mimeType: "image/png",
    revisedPrompt: item?.revised_prompt,
  };
}

export class ImageProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

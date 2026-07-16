// Shared helper: resolve image generation provider/model per user.
// Default provider is OpenRouter (uses user's OpenRouter key, falls back
// to system OPENROUTER_API_KEY). Users can opt into their personal
// OpenAI key by setting image_provider = 'openai' in user_settings.

import { ImagePayloadError, parseImageApiPayload } from "./image-generation.ts";

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
  const body: Record<string, unknown> = {
    model: config.model,
    prompt,
    n: 1,
    output_format: "png",
  };
  if (sourceImage) {
    body.input_references = [{
      type: "image_url",
      image_url: { url: `data:${sourceImage.mimeType};base64,${bytesToBase64(sourceImage.bytes)}` },
    }];
  }
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: OPENROUTER_HEADERS(config.apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ImageProviderError(res.status, `OpenRouter image failed: ${text.slice(0, 300)}`, {
      provider: "openrouter",
      code: "provider_http_error",
    });
  }
  const data = await res.json();
  const image = parseProviderPayload(data, "openrouter");
  return { bytes: base64ToBytes(image.base64), mimeType: image.mimeType, revisedPrompt: image.revisedPrompt };
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
    const sourceBuffer = sourceImage.bytes.slice().buffer as ArrayBuffer;
    form.append("image", new Blob([sourceBuffer], { type: sourceImage.mimeType }), "source.png");
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ImageProviderError(res.status, `OpenAI edit failed: ${text.slice(0, 300)}`, {
        provider: "openai",
        code: "provider_http_error",
      });
    }
    const data = await res.json();
    const image = parseProviderPayload(data, "openai");
    return { bytes: base64ToBytes(image.base64), mimeType: image.mimeType, revisedPrompt: image.revisedPrompt };
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
    throw new ImageProviderError(res.status, `OpenAI image failed: ${text.slice(0, 300)}`, {
      provider: "openai",
      code: "provider_http_error",
    });
  }
  const data = await res.json();
  const image = parseProviderPayload(data, "openai");
  return {
    bytes: base64ToBytes(image.base64),
    mimeType: image.mimeType,
    revisedPrompt: image.revisedPrompt,
  };
}

export class ImageProviderError extends Error {
  status: number;
  provider?: ImageProvider;
  code?: string;
  returnedKeys?: string[];

  constructor(
    status: number,
    message: string,
    details: { provider?: ImageProvider; code?: string; returnedKeys?: string[] } = {},
  ) {
    super(message);
    this.name = "ImageProviderError";
    this.status = status;
    this.provider = details.provider;
    this.code = details.code;
    this.returnedKeys = details.returnedKeys;
  }
}

function parseProviderPayload(data: unknown, provider: ImageProvider) {
  try {
    return parseImageApiPayload(data, provider);
  } catch (error) {
    if (error instanceof ImagePayloadError) {
      throw new ImageProviderError(422, error.message, {
        provider,
        code: error.code,
        returnedKeys: error.returnedKeys,
      });
    }
    throw error;
  }
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

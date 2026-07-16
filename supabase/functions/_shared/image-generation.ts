export type ImageAspect = "square" | "landscape" | "portrait" | "auto";

const IMAGE_NOUNS =
  /\b(image|images|picture|pictures|photo|photos|pic|pics|illustration|illustrations|portrait|landscape|painting|paintings|art|artwork|drawing|drawings|visual|visuals)\b/;
const CREATE_VERBS =
  /\b(generat\w*|creat\w*|mak\w*|draw\w*|paint\w*|render\w*|design\w*|illustrat\w*|show|give)\b/;
const EDIT_VERBS = /\b(edit|modify|change|revise|tweak|iterate|adjust|remix|transform)\b/;
const RENDERABLE_OUTPUTS = /\b(svg|html|react|component|mermaid|chart|diagram|wireframe|code|page|app)\b/;
const EXPLICIT_IMAGE_TOOLS =
  /\b(generate_image|edit_image|image\s*gen(?:eration)?|image\s*(?:generator|tool)|generate\s+(?:me\s+)?an?\s+image|nano\s*banana|dall[- ]?e|midjourney|stable\s*diffusion)\b/;

export function looksLikeImageToolRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  if (EXPLICIT_IMAGE_TOOLS.test(normalized)) return true;
  return IMAGE_NOUNS.test(normalized) && (CREATE_VERBS.test(normalized) || EDIT_VERBS.test(normalized));
}

export function looksLikeDirectImageGenerationRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  if (RENDERABLE_OUTPUTS.test(normalized)) return false;
  if (EDIT_VERBS.test(normalized) || /\b(make|change)\s+(it|that)\b/.test(normalized)) return false;
  return (
    (IMAGE_NOUNS.test(normalized) && CREATE_VERBS.test(normalized)) ||
    /\b(generate_image|image\s*gen(?:eration)?|generate\s+(?:me\s+)?an?\s+image)\b/.test(normalized)
  );
}

export function inferImageAspectRatio(text: string): ImageAspect {
  const normalized = text.toLowerCase();
  if (/\b(square|1:1|avatar|profile)\b/.test(normalized)) return "square";
  if (/\b(landscape|wide|16:9|3:2|banner|wallpaper)\b/.test(normalized)) return "landscape";
  if (/\b(portrait|vertical|tall|9:16|2:3)\b/.test(normalized)) return "portrait";
  return "auto";
}

export interface ParsedImagePayload {
  base64: string;
  mimeType: string;
  revisedPrompt?: string;
}

export function parseImageApiPayload(data: unknown, provider: "openrouter" | "openai"): ParsedImagePayload {
  const root = data && typeof data === "object" ? data as { data?: unknown } : {};
  const item = Array.isArray(root.data) && root.data[0] && typeof root.data[0] === "object"
    ? root.data[0] as Record<string, unknown>
    : undefined;
  const base64 = typeof item?.b64_json === "string" ? item.b64_json : "";
  if (!base64) {
    const returnedKeys = item && typeof item === "object" ? Object.keys(item) : [];
    throw new ImagePayloadError(provider, "missing_b64_json", returnedKeys);
  }
  return {
    base64,
    mimeType: typeof item?.media_type === "string" ? item.media_type : "image/png",
    revisedPrompt: typeof item?.revised_prompt === "string" ? item.revised_prompt : undefined,
  };
}

export class ImagePayloadError extends Error {
  readonly provider: "openrouter" | "openai";
  readonly code: "missing_b64_json";
  readonly returnedKeys: string[];

  constructor(provider: "openrouter" | "openai", code: "missing_b64_json", returnedKeys: string[]) {
    super(`${provider} returned no image data`);
    this.name = "ImagePayloadError";
    this.provider = provider;
    this.code = code;
    this.returnedKeys = returnedKeys;
  }
}

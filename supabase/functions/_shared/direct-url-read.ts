const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 512_000;
const DEFAULT_MAX_CHARS = 12_000;
const MAX_REDIRECTS = 5;

export type DirectReadFormat = "text" | "raw";

export interface DirectReadOptions {
  format?: string;
  maxChars?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface DirectReadSuccess {
  ok: true;
  title: string;
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  detectedFormat: "html" | "json" | "text" | "xml" | "unknown";
  format: DirectReadFormat;
  content: string;
  rawExcerpt?: string;
  truncated: boolean;
  bytesRead: number;
  charsReturned: number;
}

export interface DirectReadFailure {
  ok: false;
  status: number;
  error: string;
  url?: string;
  finalUrl?: string;
  contentType?: string;
}

export type DirectReadResult = DirectReadSuccess | DirectReadFailure;

export function normalizeDirectReadFormat(format: string | undefined): DirectReadFormat {
  return format === "raw" ? "raw" : "text";
}

export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;

  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return false;

  const ipv6 = host.replace(/^\[|\]$/g, "");
  if (host.includes(":")) {
    if (
      ipv6 === "::" ||
      ipv6 === "::1" ||
      ipv6.startsWith("fe80:") ||
      ipv6.startsWith("fc") ||
      ipv6.startsWith("fd")
    ) return false;
  }

  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const octets = m.slice(1).map((n) => Number.parseInt(n, 10));
    if (octets.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }

  return true;
}

export async function directFetchAndExtract(
  url: string,
  options: DirectReadOptions = {},
): Promise<DirectReadResult> {
  if (!isSafePublicUrl(url)) {
    return { ok: false, status: 400, error: "URL must be a public http(s) address", url };
  }

  const format = normalizeDirectReadFormat(options.format);
  const maxChars = clampInteger(options.maxChars, 1_000, 40_000, DEFAULT_MAX_CHARS);
  const maxBytes = clampInteger(options.maxBytes, 32_000, 1_500_000, DEFAULT_MAX_BYTES);
  const timeoutMs = clampInteger(options.timeoutMs, 2_000, 45_000, DEFAULT_TIMEOUT_MS);

  let response: Response;
  let finalUrl = url;
  try {
    const fetched = await fetchWithSafeRedirects(url, timeoutMs);
    response = fetched.response;
    finalUrl = fetched.finalUrl;
  } catch (err) {
    console.error("[direct-url-read] fetch failed:", err);
    return { ok: false, status: 502, error: "Failed to fetch the URL", url };
  }

  const contentType = response.headers.get("content-type") || "";
  const status = response.status;
  if (!response.ok) {
    return {
      ok: false,
      status: status >= 400 && status < 600 ? 502 : 502,
      error: `Failed to fetch URL: ${status}`,
      url,
      finalUrl,
      contentType,
    };
  }

  let body: LimitedText;
  try {
    body = await readResponseTextLimited(response, maxBytes);
  } catch (err) {
    console.error("[direct-url-read] body read failed:", err);
    return { ok: false, status: 502, error: "Failed to read the URL response", url, finalUrl, contentType };
  }

  const detectedFormat = detectBodyFormat(contentType, body.text);
  if (detectedFormat === "unknown" && !looksLikeText(body.text)) {
    return {
      ok: false,
      status: 415,
      error: `URL returned non-text content${contentType ? ` (${contentType})` : ""}`,
      url,
      finalUrl,
      contentType,
    };
  }

  const extracted = extractDirectContent(body.text, contentType, format, maxChars);

  return {
    ok: true,
    title: extracted.title,
    url,
    finalUrl,
    status,
    contentType,
    detectedFormat: extracted.detectedFormat,
    format,
    content: extracted.content,
    rawExcerpt: format === "raw" ? undefined : body.text.slice(0, 2_000),
    truncated: body.truncated || extracted.truncated,
    bytesRead: body.bytesRead,
    charsReturned: extracted.content.length,
  };
}

export function extractDirectContent(
  rawText: string,
  contentType = "",
  format: DirectReadFormat = "text",
  maxChars = DEFAULT_MAX_CHARS,
): {
  title: string;
  content: string;
  detectedFormat: DirectReadSuccess["detectedFormat"];
  truncated: boolean;
} {
  const detectedFormat = detectBodyFormat(contentType, rawText);
  const htmlTitle = detectedFormat === "html" ? extractHtmlTitle(rawText) : "";

  let content = rawText;
  if (format === "text") {
    if (detectedFormat === "html") {
      content = htmlToText(rawText);
    } else if (detectedFormat === "json") {
      content = prettyJson(rawText);
    }
  }

  const truncated = content.length > maxChars;
  if (truncated) content = content.slice(0, maxChars);

  return {
    title: htmlTitle,
    content,
    detectedFormat: detectedFormat === "unknown" && looksLikeText(rawText) ? "text" : detectedFormat,
    truncated,
  };
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  timeoutMs: number,
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    if (!isSafePublicUrl(currentUrl)) {
      throw new Error("Redirect target is not a public http(s) URL");
    }

    const response = await fetchWithTimeout(currentUrl, timeoutMs);
    if (!isRedirect(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: currentUrl };

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error(`Too many redirects (${MAX_REDIRECTS})`);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "Polyphonic/1.0 (+https://polyphonic.chat)",
        "Accept": "text/html,application/xhtml+xml,application/json,text/plain,application/xml,*/*;q=0.8",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface LimitedText {
  text: string;
  bytesRead: number;
  truncated: boolean;
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<LimitedText> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return { text, bytesRead: new TextEncoder().encode(text).byteLength, truncated: false };
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  let truncated = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    const remaining = maxBytes - bytesRead;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }

    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    text += decoder.decode(chunk, { stream: true });
    bytesRead += chunk.byteLength;

    if (value.byteLength > remaining) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  text += decoder.decode();
  return { text, bytesRead, truncated };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function detectBodyFormat(contentType: string, body: string): DirectReadSuccess["detectedFormat"] {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime === "application/json" || mime.endsWith("+json")) return "json";
  if (mime === "application/xml" || mime === "text/xml" || mime.endsWith("+xml")) return "xml";
  if (mime.startsWith("text/")) return "text";

  const sample = body.slice(0, 500).trimStart();
  if (/^<!doctype\s+html/i.test(sample) || /^<html[\s>]/i.test(sample)) return "html";
  if (sample.startsWith("{") || sample.startsWith("[")) return "json";
  if (sample.startsWith("<?xml") || /^<rss[\s>]/i.test(sample) || /^<feed[\s>]/i.test(sample)) return "xml";
  return "unknown";
}

function looksLikeText(text: string): boolean {
  if (!text) return true;
  const sample = text.slice(0, 4096);
  if (sample.includes("\u0000")) return false;
  const replacementChars = (sample.match(/\uFFFD/g) || []).length;
  return replacementChars / sample.length < 0.02;
}

function extractHtmlTitle(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return decodeHtmlEntities(stripTags(title)).replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  text = text.replace(/<\/(p|div|section|article|header|footer|main|li|h[1-6]|tr|br)>/gi, "\n");
  text = stripTags(text);
  text = decodeHtmlEntities(text);
  return text.replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
      const lower = String(body).toLowerCase();
      if (lower.startsWith("#x")) {
        const code = Number.parseInt(lower.slice(2), 16);
        return codePointToString(code, entity);
      }
      if (lower.startsWith("#")) {
        const code = Number.parseInt(lower.slice(1), 10);
        return codePointToString(code, entity);
      }
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
        rsquo: "'",
        lsquo: "'",
        rdquo: '"',
        ldquo: '"',
        ndash: "-",
        mdash: "-",
      };
      return named[lower] ?? entity;
    });
}

function codePointToString(code: number, fallback: string): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : fallback;
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// OpenRouter call wrapper with one retry on transient upstream errors.
// Streaming callers should NOT use this — they need to keep the SSE pipe open.

import { UpstreamUnavailableError } from "./errors.ts";

const TRANSIENT = new Set([429, 502, 503, 504]);

export interface OpenRouterCallOpts {
  apiKey: string;
  body: Record<string, unknown>;
  retry?: boolean; // default true
  signal?: AbortSignal;
}

export async function openRouterChat(opts: OpenRouterCallOpts): Promise<Response> {
  const { apiKey, body, signal } = opts;
  const retry = opts.retry ?? true;

  const doFetch = () =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Luca",
      },
      body: JSON.stringify(body),
      signal,
    });

  let resp: Response;
  try {
    resp = await doFetch();
  } catch (err) {
    if (!retry) throw new UpstreamUnavailableError("OpenRouter unreachable");
    await sleep(300 + Math.random() * 400);
    try {
      resp = await doFetch();
    } catch {
      throw new UpstreamUnavailableError("OpenRouter unreachable after retry");
    }
  }

  if (TRANSIENT.has(resp.status) && retry) {
    await sleep(300 + Math.random() * 400);
    resp = await doFetch();
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    if (TRANSIENT.has(resp.status)) {
      throw new UpstreamUnavailableError(`OpenRouter ${resp.status}`, { upstream_status: resp.status, body: txt.slice(0, 500) });
    }
    // Non-retryable upstream error — bubble status + body
    throw new UpstreamUnavailableError(`OpenRouter error ${resp.status}`, { upstream_status: resp.status, body: txt.slice(0, 500) });
  }
  return resp;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

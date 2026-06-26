// Shared Perplexity Sonar (via OpenRouter) helper for synthesized web search.
//
// `anima-web-search` uses this as an answer engine: Sonar searches online and
// returns a synthesized response plus citations. `anima-web-read` intentionally
// does NOT use this helper; direct URL reads bypass synthesis and fetch source
// content through `_shared/direct-url-read.ts`.
//
// Resolves the user's OpenRouter key from `decrypt_user_api_key` regardless
// of whether the call came in via JWT or via service-role (in which case
// the caller must pass `userId` explicitly — there's no platform key).

const SEARCH_MODEL = "perplexity/sonar";
const REQUEST_TIMEOUT_MS = 30_000;

export interface SonarCitation {
  title: string;
  url: string;
  snippet: string;
}

export interface SonarResult {
  answer: string;
  results: SonarCitation[];
}

export interface SonarOptions {
  /** Override the default Sonar model (e.g. "perplexity/sonar-pro" for deeper research). */
  model?: string;
  temperature?: number;
  /** Max output tokens. Defaults to 1500 — enough for a synthesized answer + citations. */
  maxTokens?: number;
}

/**
 * Look up the user's OpenRouter key. Returns null if no key is configured;
 * callers must surface an error to the user in that case rather than fall
 * back to a platform key (we don't have one).
 */
export async function loadUserOpenRouterKey(
  supabase: any,
  userId: string,
): Promise<string | null> {
  if (!userId || userId === "system") return null;
  try {
    const { data } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    if (typeof data === "string" && data.trim().length > 0) return data.trim();
  } catch (err) {
    console.warn("[perplexity] key lookup failed:", err);
  }
  return null;
}

/** Run a web search via Perplexity Sonar. */
export async function perplexitySearch(
  apiKey: string,
  query: string,
  options: SonarOptions = {},
): Promise<SonarResult> {
  return runSonar(apiKey, [
    {
      role: "system",
      content:
        "You are a web search assistant. Search for the user's query and produce a synthesized answer plus the key sources you used. " +
        "Format the response as a JSON object with this exact shape: " +
        '{"answer": "your synthesized answer", "results": [{"title": "page title", "url": "source url", "snippet": "relevant excerpt"}]}. ' +
        "Include 4–6 results. Return ONLY valid JSON, no markdown fences, no surrounding prose.",
    },
    { role: "user", content: query },
  ], { model: options.model || SEARCH_MODEL, temperature: options.temperature ?? 0.1, maxTokens: options.maxTokens ?? 1500 });
}

interface ChatMessage {
  role: string;
  content: string;
}

async function runSonar(
  apiKey: string,
  messages: ChatMessage[],
  options: { model: string; temperature: number; maxTokens: number },
): Promise<SonarResult & { title?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic",
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sonar ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const choice = data?.choices?.[0]?.message;
    const rawContent = typeof choice?.content === "string" ? choice.content : "";
    const inlineCitations: string[] = Array.isArray(choice?.citations) ? choice.citations : [];

    return parseSonarResponse(rawContent, inlineCitations);
  } finally {
    clearTimeout(timer);
  }
}

function parseSonarResponse(rawContent: string, inlineCitations: string[]): SonarResult & { title?: string } {
  const fallbackResults = inlineCitations.map((u) => ({ title: "", url: u, snippet: "" }));

  if (!rawContent) {
    return { answer: "", title: "", results: fallbackResults };
  }

  const cleaned = rawContent
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const results: SonarCitation[] = Array.isArray(parsed.results)
      ? parsed.results.map((r: any) => ({
          title: typeof r.title === "string" ? r.title : "",
          url: typeof r.url === "string" ? r.url : "",
          snippet: typeof r.snippet === "string" ? r.snippet : (typeof r.content === "string" ? r.content : ""),
        }))
      : fallbackResults;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      answer: typeof parsed.answer === "string" ? parsed.answer : rawContent,
      results,
    };
  } catch {
    return { answer: rawContent, title: "", results: fallbackResults };
  }
}

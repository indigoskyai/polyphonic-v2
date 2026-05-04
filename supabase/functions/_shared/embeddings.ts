/**
 * Embedding generation via OpenRouter.
 *
 * Used by mnemos.encode (post-insert hook), hypomnema-write (post-insert hook),
 * and the embeddings-backfill edge function. All callers gate on the memory
 * augmentation flag — this module is the mechanism, not the policy.
 *
 * Default model: openai/text-embedding-3-small (1536 dims, ~$0.02/1M tokens).
 * Falls back to google/text-embedding-004 if the primary call fails. Both
 * produce 768-dim vectors at minimum but text-embedding-3-small returns 1536
 * which matches the schema column. If the fallback gets used and returns a
 * different dimensionality, the insert/update will fail at the DB level
 * (vector(1536) constraint) — caller should treat that as a no-op and
 * continue without the embedding (backfill picks up later).
 */

const PRIMARY_MODEL = "openai/text-embedding-3-small";
const FALLBACK_MODEL = "openai/text-embedding-3-small"; // single model for now; OpenRouter sometimes serves text-embedding-004 differently
const ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const TIMEOUT_MS = 12_000;
const MAX_BATCH = 100;
const MAX_INPUT_CHARS = 8000; // single-input cap to keep tokens bounded

export interface EmbedResult {
  vector: number[];
  model: string;
}

/** Build the canonical text-to-embed for an engram. Combines content + tags + type
 * so that semantic neighbors discovered via vector similarity respect type
 * and tag context (a "belief" tagged 'work' shouldn't seed an episodic 'mood' query). */
export function buildEmbeddingText(engram: { content: string; engram_type?: string | null; tags?: string[] | null }): string {
  const parts: string[] = [];
  if (engram.engram_type) parts.push(`[${engram.engram_type}]`);
  if (engram.tags && engram.tags.length > 0) {
    parts.push(`(tags: ${engram.tags.slice(0, 8).join(", ")})`);
  }
  parts.push((engram.content || "").slice(0, MAX_INPUT_CHARS));
  return parts.join(" ");
}

async function callEmbeddings(opts: {
  apiKey: string;
  input: string | string[];
  model: string;
}): Promise<number[][]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Embeddings",
      },
      body: JSON.stringify({
        model: opts.model,
        input: opts.input,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`OpenRouter embeddings ${resp.status}: ${txt.slice(0, 240)}`);
    }
    const data = await resp.json();
    const items = data?.data;
    if (!Array.isArray(items)) throw new Error("missing data array in response");
    return items.map((it: { embedding: number[] }) => it.embedding);
  } finally {
    clearTimeout(t);
  }
}

/** Embed a single text. Returns null on failure (caller stores NULL embedding). */
export async function embedOne(apiKey: string, text: string): Promise<EmbedResult | null> {
  if (!apiKey || !text) return null;
  const input = text.slice(0, MAX_INPUT_CHARS);
  try {
    const vectors = await callEmbeddings({ apiKey, input, model: PRIMARY_MODEL });
    if (vectors.length > 0 && vectors[0].length > 0) {
      return { vector: vectors[0], model: PRIMARY_MODEL };
    }
  } catch (err) {
    console.warn("[embeddings] primary failed:", (err as Error).message);
  }
  if (PRIMARY_MODEL !== FALLBACK_MODEL) {
    try {
      const vectors = await callEmbeddings({ apiKey, input, model: FALLBACK_MODEL });
      if (vectors.length > 0 && vectors[0].length > 0) {
        return { vector: vectors[0], model: FALLBACK_MODEL };
      }
    } catch (err) {
      console.warn("[embeddings] fallback failed:", (err as Error).message);
    }
  }
  return null;
}

/** Embed many texts in batches. Used by the backfill cron. */
export async function embedBatch(
  apiKey: string,
  texts: string[],
  batchSize = MAX_BATCH,
): Promise<Array<EmbedResult | null>> {
  const out: Array<EmbedResult | null> = new Array(texts.length).fill(null);
  for (let start = 0; start < texts.length; start += batchSize) {
    const chunk = texts.slice(start, start + batchSize).map((t) => t.slice(0, MAX_INPUT_CHARS));
    try {
      const vectors = await callEmbeddings({ apiKey, input: chunk, model: PRIMARY_MODEL });
      vectors.forEach((v, i) => {
        if (v && v.length > 0) out[start + i] = { vector: v, model: PRIMARY_MODEL };
      });
    } catch (err) {
      console.warn(`[embeddings] batch ${start}/${texts.length} failed:`, (err as Error).message);
      // Leave nulls; the backfill loop will retry on the next pass.
    }
  }
  return out;
}

/**
 * Reciprocal Rank Fusion. Combines multiple ranked lists (each a list of ids
 * in descending relevance order) into a single ranking, weighted per source.
 *
 * Standard RRF: score(id) = Σ over each source S of weight(S) / (k + rank_in_S(id)).
 * k=60 is the canonical choice (Cormack et al.); we expose it as an option.
 */
export interface RankedSource {
  ids: string[];
  weight: number;
}

export function reciprocalRankFusion(sources: RankedSource[], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const src of sources) {
    src.ids.forEach((id, idx) => {
      const contribution = src.weight / (k + idx + 1);
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

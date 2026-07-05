export type DigestSuggestionAction = "keep" | "release" | "distill";

export interface DigestSuggestion {
  id: string;
  action: DigestSuggestionAction | string;
  confidence: number;
  reason: string;
}

export function parseDigestSuggestionPayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") {
    throw new Error("digest suggestion response was not JSON text");
  }

  const trimmed = raw.trim();
  const unfenced = stripSingleFence(trimmed);
  const attempts = [
    unfenced,
    extractFirstJsonObject(unfenced),
    extractFirstJsonObject(trimmed),
  ].filter((value, index, values): value is string =>
    Boolean(value) && values.indexOf(value) === index
  );

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next extraction strategy below.
    }
  }

  throw new Error("digest suggestion response did not contain a valid JSON object");
}

export function normalizeDigestSuggestions(raw: unknown): DigestSuggestion[] {
  const parsed = parseDigestSuggestionPayload(raw);
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  return suggestions.map((item) => {
    const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const confidence = Number(record.confidence ?? 0);
    return {
      id: String(record.id ?? ""),
      action: String(record.action ?? ""),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      reason: String(record.reason ?? ""),
    };
  });
}

function stripSingleFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? text).trim();
}

function extractFirstJsonObject(text: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (start === -1) {
      if (char === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

import { withModelRetry } from "./modelRetry.ts";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AutonomousGenerationOptions<T> {
  apiKey: string;
  model: string;
  writer: string;
  messages: ChatMessage[];
  parse: (raw: string) => T;
  content: (parsed: T) => string[];
  allowEmpty?: (raw: string) => boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  // deno-lint-ignore no-explicit-any
  supabase?: any;
  userId?: string;
  agentId?: string;
}

export interface AutonomousGenerationResult<T> {
  value: T;
  raw: string;
  finishReason: string;
  attempts: number;
  structured: boolean;
}

export class AutonomousGenerationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "AutonomousGenerationError";
  }
}

const OUTPUT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "autonomous_generation_payload",
    strict: true,
    schema: {
      type: "object",
      properties: { output: { type: "string", minLength: 1 } },
      required: ["output"],
      additionalProperties: false,
    },
  },
};

const LEAK_PATTERNS = [
  /\[text\]\s*\*?\s*SALIENCE\s*:/i,
  /SALIENCE\s*:\s*\[0(?:\.0)?\s*-\s*1(?:\.0)?\]/i,
  /TAGS\s*:\s*\[(?:tags?|comma[- ]separated)/i,
  /(?:respond|return|output)\s+(?:only|exactly)\s+(?:in|with|the following)/i,
  /do not (?:include|write|mention).{0,80}(?:instructions|format|explanation)/i,
  /(?:system|developer)\s+(?:prompt|message|instructions?)\s*:/i,
];

const PLACEHOLDER_PATTERNS = [
  /\[(?:text|tags?|question|answer|content|summary|title|type|context|memory|observation|reflection|connection)\]/i,
  /\{\{[^{}]+\}\}/,
  /<(?:insert|your|generated|placeholder)[^>]*>/i,
];

export function normalizeAutonomousContent(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assertCompleteAutonomousContent(value: string, minimumLength = 12): string {
  const normalized = normalizeAutonomousContent(value);
  if (normalized.length < minimumLength) throw new AutonomousGenerationError("incomplete_content", "Generated content is too short");
  if (LEAK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new AutonomousGenerationError("prompt_leak", "Generated content contains prompt or format instructions");
  }
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new AutonomousGenerationError("placeholder", "Generated content contains an unresolved placeholder");
  }
  if (!/[.!?…]["'’”)*\]]*$/.test(normalized)) {
    throw new AutonomousGenerationError("incomplete_content", "Generated content appears to end mid-sentence");
  }
  return normalized;
}

function compactMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.role === "system" || message.content.length <= 24_000) return message;
    return {
      ...message,
      content: `${message.content.slice(0, 6_000)}\n\n[older context compacted for retry]\n\n${message.content.slice(-16_000)}`,
    };
  });
}

function unwrapOutput(content: unknown): string {
  if (typeof content !== "string") return "";
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.output === "string") return parsed.output;
  } catch {
    // Models without structured-output support use the validated legacy parser.
  }
  return content.trim();
}

async function recordFailure<T>(options: AutonomousGenerationOptions<T>, reason: string, detail: string, attempts: number) {
  if (!options.supabase || !options.userId) return;
  await options.supabase.from("autonomous_generation_events").insert({
    user_id: options.userId,
    agent_id: options.agentId || null,
    writer: options.writer,
    status: "failed",
    reason,
    attempts,
    model: options.model,
    detail: detail.slice(0, 2_000),
  }).then(({ error }: { error?: unknown }) => {
    if (error) console.warn(`[${options.writer}] could not record generation failure`, error);
  }).catch((error: unknown) => console.warn(`[${options.writer}] could not record generation failure`, error));
}

async function callProvider<T>(
  options: AutonomousGenerationOptions<T>,
  messages: ChatMessage[],
  maxTokens: number,
  structured: boolean,
) {
  return await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://polyphonic.chat",
      "X-Title": "Polyphonic Autonomous Integrity",
    },
    body: JSON.stringify({
      model: options.model,
      messages: structured
        ? [
            ...messages,
            { role: "system", content: "Return one JSON object matching the response schema. Put the complete requested legacy-formatted output in the output string." },
          ]
        : messages,
      temperature: options.temperature ?? 0.75,
      max_tokens: maxTokens,
      reasoning: { max_tokens: Math.min(768, Math.max(256, Math.floor(maxTokens / 4))), exclude: true },
      ...(structured ? { response_format: OUTPUT_SCHEMA } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 75_000),
  }));
}

export async function generateAutonomous<T>(options: AutonomousGenerationOptions<T>): Promise<AutonomousGenerationResult<T>> {
  const baseMaxTokens = Math.max(512, options.maxTokens ?? 2_048);
  let lastError: unknown = null;
  let structuredSupported = true;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages = attempt === 1 ? options.messages : compactMessages(options.messages);
    const maxTokens = attempt === 1 ? baseMaxTokens : Math.min(8_192, Math.max(2_048, baseMaxTokens * 2));
    try {
      let response = await callProvider(options, messages, maxTokens, structuredSupported);
      if (!response.ok && structuredSupported && [400, 404, 422].includes(response.status)) {
        structuredSupported = false;
        response = await callProvider(options, messages, maxTokens, false);
      }
      if (!response.ok) throw new AutonomousGenerationError("provider_error", `Provider returned ${response.status}: ${(await response.text()).slice(0, 600)}`);
      const payload = await response.json();
      const choice = payload?.choices?.[0];
      const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
      if (finishReason !== "stop") throw new AutonomousGenerationError("non_stop_finish", `Generation ended with finish_reason=${finishReason}`);
      const raw = unwrapOutput(choice?.message?.content);
      if (!raw) throw new AutonomousGenerationError("empty_content", "Generation returned no content");
      const value = options.parse(raw);
      const content = options.content(value);
      if (!content.length && !options.allowEmpty?.(raw)) throw new AutonomousGenerationError("invalid_structure", "Generation contained no complete records");
      for (const item of content) assertCompleteAutonomousContent(item);
      return { value, raw, finishReason, attempts: attempt, structured: structuredSupported };
    } catch (error) {
      lastError = error;
      console.warn(`[${options.writer}] autonomous generation attempt ${attempt} rejected`, error);
    }
  }

  const reason = lastError instanceof AutonomousGenerationError ? lastError.reason : "generation_failed";
  const detail = lastError instanceof Error ? lastError.message : String(lastError || "Unknown failure");
  await recordFailure(options, reason, detail, 2);
  throw new AutonomousGenerationError(reason, detail);
}

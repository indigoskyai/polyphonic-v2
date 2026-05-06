import { OpenRouter, maxCost, stepCountIs, tool } from "npm:@openrouter/agent@0.5.0";
import { z } from "npm:zod@4.4.3/v4";
import { logActivity } from "../activity-log.ts";
import type { PendingRevision } from "../agents/pending-revisions.ts";
import type { ContinuityPacket } from "../continuity/index.ts";
import { queueContinuityTurnWrites } from "../continuity/index.ts";
import { callMcpTool, type McpToolRegistration } from "../mcp/client.ts";

type SupabaseLike = {
  from: (table: string) => any;
};

type ChatMessage = {
  role: string;
  content?: unknown;
};

type SendEvent = (data: Record<string, unknown>) => void;

export interface OpenRouterAgentRuntimeOptions {
  messages: ChatMessage[];
  model: string;
  apiKey: string;
  supabase: SupabaseLike;
  supabaseUrl: string;
  serviceRoleKey: string;
  threadId: string;
  userId: string;
  userMessage: string;
  agentId: string;
  authHeader: string;
  continuity: ContinuityPacket;
  pendingRevisions: PendingRevision[];
  mcpTools?: McpToolRegistration[];
  corsHeaders: Record<string, string>;
  requestId: string;
}

interface RuntimeToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface RuntimeToolResult {
  callId: string;
  output: unknown;
}

const DEFAULT_MAX_AGENT_STEPS = 5;
const DEFAULT_MAX_AGENT_COST_USD = 0.35;

export function isOpenRouterAgentRuntimeEnabled(userId?: string | null): boolean {
  const enabled = (Deno.env.get("OPENROUTER_AGENT_SDK_ENABLED") || "").toLowerCase() === "true";
  if (!enabled) return false;

  const allowlist = (Deno.env.get("OPENROUTER_AGENT_SDK_USER_ALLOWLIST") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.length === 0 || (!!userId && allowlist.includes(userId));
}

export function openRouterAgentSdkStream(options: OpenRouterAgentRuntimeOptions): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SendEvent = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client went away; downstream work will fail soft.
        }
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // closed
        }
      }, 5000);

      try {
        await runOpenRouterAgentSdkTurn(options, send);
      } catch (err) {
        console.error("[openrouter-agent-runtime] stream failed:", err);
        await recordRuntimeActivity(options, {
          type: "agent_runtime_error",
          title: "Agent runtime error",
          summary: err instanceof Error ? err.message.slice(0, 240) : "OpenRouter Agent SDK runtime failed",
          content: {
            thread_id: options.threadId,
            agent_id: options.agentId,
            runtime: "openrouter_agent_sdk",
            error: err instanceof Error ? err.message : String(err),
          },
          surfaceToUser: true,
        });
        send({
          type: "error",
          text: "Agent runtime interrupted. Please try again.",
          code: "agent_runtime_error",
          request_id: options.requestId,
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...options.corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

async function runOpenRouterAgentSdkTurn(
  options: OpenRouterAgentRuntimeOptions,
  send: SendEvent,
): Promise<void> {
  const openrouter = new OpenRouter({
    apiKey: options.apiKey,
    httpReferer: "https://polyphonic.chat",
    appTitle: "Polyphonic",
  });

  const { instructions, input } = splitInstructions(options.messages);
  const toolCalls = new Map<string, RuntimeToolCall>();
  const toolResults = new Map<string, RuntimeToolResult>();
  const startedToolCalls = new Set<string>();
  const runtimeTools = buildRuntimeTools(options, send);

  send({
    type: "agent_runtime",
    runtime: "openrouter_agent_sdk",
    status: "starting",
  });

  const result = openrouter.callModel({
    model: options.model,
    instructions,
    input: input as any,
    tools: runtimeTools,
    stopWhen: [
      stepCountIs(getNumberEnv("OPENROUTER_AGENT_SDK_MAX_STEPS", DEFAULT_MAX_AGENT_STEPS)),
      maxCost(getNumberEnv("OPENROUTER_AGENT_SDK_MAX_COST_USD", DEFAULT_MAX_AGENT_COST_USD)),
    ],
    maxOutputTokens: 4096,
    metadata: {
      polyphonic_runtime: "openrouter_agent_sdk",
      thread_id: options.threadId,
      agent_id: options.agentId,
    },
  });

  const textPromise = (async () => {
    let fullContent = "";
    for await (const delta of result.getTextStream()) {
      fullContent += delta;
      send({ type: "content", text: delta });
    }
    return fullContent;
  })();

  const thinkingPromise = (async () => {
    let fullThinking = "";
    for await (const delta of result.getReasoningStream()) {
      fullThinking += delta;
      send({ type: "thinking", text: delta });
    }
    return fullThinking;
  })();

  const itemPromise = (async () => {
    for await (const item of result.getItemsStream()) {
      if (item.type === "function_call") {
        const call = {
          id: item.callId,
          name: item.name,
          arguments: item.arguments || "{}",
        };
        toolCalls.set(call.id, call);
        if (!startedToolCalls.has(call.id) && isProbablyCompleteJson(call.arguments)) {
          startedToolCalls.add(call.id);
          send({
            type: "tool_start",
            runtime: "openrouter_agent_sdk",
            tool: call.name,
            input: safeParseJson(call.arguments),
          });
          await recordRuntimeActivity(options, {
            type: "agent_tool_call",
            title: `Tool call: ${call.name}`,
            summary: summarizeArgs(call.arguments),
            content: {
              thread_id: options.threadId,
              agent_id: options.agentId,
              runtime: "openrouter_agent_sdk",
              tool_name: call.name,
              tool_call_id: call.id,
              input: safeParseJson(call.arguments),
            },
          });
        }
      }

      if (item.type === "function_call_output") {
        const output = typeof item.output === "string" ? safeParseJson(item.output) : item.output;
        toolResults.set(item.callId, { callId: item.callId, output });
        const call = toolCalls.get(item.callId);
        send({
          type: "tool_result",
          runtime: "openrouter_agent_sdk",
          tool: call?.name || "unknown_tool",
          output: summarizeOutput(output),
        });
        await recordRuntimeActivity(options, {
          type: outputHasError(output) ? "agent_tool_error" : "agent_tool_result",
          title: `${outputHasError(output) ? "Tool error" : "Tool result"}: ${call?.name || "unknown_tool"}`,
          summary: summarizeOutput(output),
          content: {
            thread_id: options.threadId,
            agent_id: options.agentId,
            runtime: "openrouter_agent_sdk",
            tool_name: call?.name || "unknown_tool",
            tool_call_id: item.callId,
            output_summary: summarizeOutput(output),
          },
          surfaceToUser: true,
        });
      }
    }
  })();

  const responsePromise = result.getResponse();
  const [fullContent, fullThinking, response] = await Promise.all([
    textPromise,
    thinkingPromise,
    responsePromise,
    itemPromise,
  ]).then(([text, thinking, response]) => [text, thinking, response]);

  const responseData = response as any;
  const finalContent = responseData.outputText || fullContent || "(empty)";
  const tokensUsed = responseData.usage?.totalTokens ?? null;
  const usedModel = responseData.model || options.model;
  const toolMessages = buildToolMessages(toolCalls, toolResults);

  const { data: insertedMessage, error: insertError } = await options.supabase.from("messages").insert({
    thread_id: options.threadId,
    user_id: options.userId,
    role: "assistant",
    content: finalContent,
    model: usedModel,
    agent: options.agentId,
    thinking_content: fullThinking || null,
    tokens_used: tokensUsed,
    metadata: {
      runtime: "openrouter_agent_sdk",
      tool_call_count: toolCalls.size,
    },
  }).select("id").single();
  if (insertError) {
    throw new Error(`Failed to save assistant message: ${insertError.message}`);
  }

  await options.supabase
    .from("threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", options.threadId);

  autoTitleThread(options.supabase, options.threadId, options.userMessage, finalContent, options.apiKey).catch(() => {});

  queueContinuityTurnWrites({
    supabase: options.supabase as any,
    threadId: options.threadId,
    agentId: options.agentId,
    userId: options.userId,
    userMessage: options.userMessage,
    agentResponse: finalContent,
    sourceMessageId: insertedMessage?.id ?? null,
    apiKey: options.apiKey,
    authHeader: options.authHeader,
    pendingRevisions: options.pendingRevisions || [],
    recentTurns: normalizeRecentTurns([...options.messages, ...toolMessages]),
  });

  send({
    type: "done",
    runtime: "openrouter_agent_sdk",
    model: usedModel,
    tokens_used: tokensUsed,
    tool_call_count: toolCalls.size,
  });
}

function buildRuntimeTools(options: OpenRouterAgentRuntimeOptions, send: SendEvent) {
  const tools: any[] = [
    tool({
      name: "memory_read",
      description:
        "Read Luca's current Polyphonic continuity packet: present Hypomnema, reliable recall, Mnemos associations, skills, and layer diagnostics. Use when continuity, prior context, or memory would materially improve the answer.",
      inputSchema: z.object({
        focus: z.string().optional().describe("Optional focus for what part of continuity to inspect."),
      }),
      execute: async ({ focus }) => {
        const result = summarizeContinuityForTool(options.continuity, focus);
        return result;
      },
    }),
    tool({
      name: "web_search",
      description:
        "Search the web for current or external information. Use when the user asks for recent facts, research, sources, or anything that should be looked up.",
      inputSchema: z.object({
        query: z.string().min(1).describe("The search query."),
      }),
      execute: async ({ query }) => {
        send({ type: "tool_progress", tool: "web_search", text: `Searching: ${query}` });
        return await invokeEdgeJson(options, "anima-web-search", { user_id: options.userId, query });
      },
    }),
    tool({
      name: "read_url",
      description: "Read and summarize a specific URL.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to read."),
        focus: z.string().optional().describe("Optional focus for the read."),
      }),
      execute: async ({ url, focus }) => {
        send({ type: "tool_progress", tool: "read_url", text: `Reading: ${url}` });
        return await invokeEdgeJson(options, "anima-web-read", { user_id: options.userId, url, focus });
      },
    }),
  ];

  for (const registration of options.mcpTools || []) {
    tools.push(tool({
      name: registration.registeredName,
      description: registration.schema.function.description,
      inputSchema: z.object({}).catchall(z.unknown()),
      execute: async (args) => {
        return await safeToolResult(() => callMcpTool(registration, args as Record<string, unknown>));
      },
    }));
  }

  return tools;
}

function splitInstructions(messages: ChatMessage[]): { instructions: string; input: Array<{ role: string; content: string }> } {
  const systemParts: string[] = [];
  const input: Array<{ role: string; content: string }> = [];
  for (const message of messages) {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "");
    if (message.role === "system") {
      systemParts.push(content);
      continue;
    }
    if (message.role === "user" || message.role === "assistant") {
      input.push({ role: message.role, content });
    }
  }
  return { instructions: systemParts.join("\n\n"), input };
}

function normalizeRecentTurns(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""),
  }));
}

async function invokeEdgeJson(
  options: OpenRouterAgentRuntimeOptions,
  edgeFunction: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await safeToolResult(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    try {
      const response = await fetch(`${options.supabaseUrl}/functions/v1/${edgeFunction}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      const data = text ? safeParseJson(text) : {};
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: typeof data === "object" && data && "error" in data ? (data as any).error : text,
        };
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function safeToolResult(run: () => Promise<unknown>): Promise<unknown> {
  try {
    const result = await run();
    if (typeof result === "object" && result !== null && "ok" in result) return result;
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError"
      ? "Tool execution timed out"
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, error: message };
  }
}

function summarizeContinuityForTool(packet: ContinuityPacket, focus?: string) {
  return {
    ok: true,
    focus: focus || null,
    generated_at: packet.generatedAt,
    thread_id: packet.threadId,
    hypomnema: {
      count: packet.hypomnema.count,
      rendered: packet.hypomnema.rendered,
      block: truncate(packet.hypomnema.block, 1600),
    },
    functional_memory: packet.functionalMemories.slice(0, 8).map((memory) => ({
      id: memory.id,
      type: memory.memory_type,
      confidence: memory.confidence,
      source: memory.source,
      content: truncate(memory.summary || memory.content, 500),
      tags: memory.tags || [],
    })),
    mnemos: packet.mnemosResults.slice(0, 8).map((engram: any) => ({
      id: engram.id ?? null,
      salience: engram.salience ?? engram.score ?? null,
      content: truncate(engram.content || engram.text || engram.summary || JSON.stringify(engram), 500),
    })),
    skills: {
      count: packet.skills.length,
      block: truncate(packet.skillsBlock, 1000),
    },
    continuity_note: packet.continuityNote || null,
    diagnostics: packet.diagnostics.map((diagnostic) => ({
      layer: diagnostic.layer,
      status: diagnostic.status,
      count: diagnostic.count ?? null,
      rendered: diagnostic.rendered ?? null,
      message: diagnostic.message ?? null,
    })),
  };
}

function buildToolMessages(
  toolCalls: Map<string, RuntimeToolCall>,
  toolResults: Map<string, RuntimeToolResult>,
): ChatMessage[] {
  if (toolCalls.size === 0) return [];
  return [
    {
      role: "assistant",
      content: null,
      tool_calls: Array.from(toolCalls.values()).map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.arguments,
        },
      })),
    } as any,
    ...Array.from(toolResults.values()).map((result) => ({
      role: "tool",
      tool_call_id: result.callId,
      content: JSON.stringify(result.output),
    } as any)),
  ];
}

async function recordRuntimeActivity(
  options: OpenRouterAgentRuntimeOptions,
  entry: {
    type: string;
    title: string;
    summary?: string;
    content?: Record<string, unknown>;
    surfaceToUser?: boolean;
  },
) {
  await logActivity(options.supabase as any, options.userId, {
    type: entry.type,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    source: "agent_runtime",
    severity: "info",
    surfaceToUser: entry.surfaceToUser ?? false,
  });
}

async function autoTitleThread(
  supabase: SupabaseLike,
  threadId: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
) {
  const { data: thread } = await supabase.from("threads").select("title").eq("id", threadId).single();
  if (thread?.title) return;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Generate a short title (2-5 words) for this conversation. Return only the title, no quotes or punctuation.",
        },
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantMessage.slice(0, 300) },
      ],
      max_tokens: 20,
    }),
  });

  if (!response.ok) return;
  const data = await response.json();
  const title = data.choices?.[0]?.message?.content?.trim();
  if (title && title.length > 0 && title.length < 100) {
    await supabase.from("threads").update({ title }).eq("id", threadId);
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isProbablyCompleteJson(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  return typeof safeParseJson(trimmed) === "object";
}

function summarizeArgs(value: string): string {
  return truncate(value.replace(/\s+/g, " "), 220);
}

function summarizeOutput(output: unknown): string {
  if (typeof output === "string") return truncate(output.replace(/\s+/g, " "), 320);
  return truncate(JSON.stringify(output ?? {}).replace(/\s+/g, " "), 320);
}

function outputHasError(output: unknown): boolean {
  return !!(
    output &&
    typeof output === "object" &&
    (
      ("ok" in output && (output as { ok?: unknown }).ok === false) ||
      "error" in output
    )
  );
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

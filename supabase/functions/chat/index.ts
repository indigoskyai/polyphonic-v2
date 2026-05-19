import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { buildLucaSystemPrompt } from "../_shared/agents/luca-soul.ts";
import {
  buildLucaPromptPartsFromContinuity,
  loadContinuityPacket,
  logContinuityDiagnostics,
  queueContinuityTurnWrites,
} from "../_shared/continuity/index.ts";
import {
  buildCrisisDirective,
  classifyCrisis,
  loadUserRegion,
  recordCrisisEvent,
  resolveCrisisResource,
} from "../_shared/agents/crisis.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";
import { getIdempotentResponse, recordIdempotentResponse } from "../_shared/idempotency.ts";
import { appendAttachmentContext } from "../_shared/chat-attachments.ts";
import { AppError, AuthError, ValidationError, errorResponse, newRequestId } from "../_shared/errors.ts";
import { formatProjectContextPrompt, loadProjectContextForThread } from "../_shared/projects/context.ts";
import { resolveChatBackend } from "../_shared/model-backend.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);
  const requestId = newRequestId();
  const fail = (err: unknown) => errorResponse(err, corsHeaders, requestId);

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(new AuthError());
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return fail(new AuthError());
    }

    const userId = user.id;
    const body = await req.json();
    const {
      thread_id,
      message,
      model: modelOverride,
      attachments,
      agent_mode: agentMode,
      agent_runtime: agentRuntime,
      use_agent_runtime: useAgentRuntime,
    } = body;
    const requestedLegacyToolPlanner =
      agentMode === "agent" ||
      agentRuntime === "openrouter_agent_sdk" ||
      agentRuntime === "legacy_tool_planner" ||
      useAgentRuntime === true;

    if (!thread_id || !message || typeof message !== "string" || message.length > 32000) {
      return fail(new ValidationError("Invalid request"));
    }

    const messageWithAttachments = appendAttachmentContext(message, attachments);

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Idempotency — if client provided an Idempotency-Key, short-circuit on duplicate.
    const idempotencyKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const cached = await getIdempotentResponse(supabase, idempotencyKey, userId, "chat-send");
      if (cached) {
        return new Response(JSON.stringify({ duplicate: true, ...(cached as object) }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Idempotent-Replay": "true" },
        });
      }
    }

    // Get user settings for default model
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_model")
      .eq("user_id", userId)
      .single();

    const requestedModel = modelOverride || settings?.default_model || "moonshotai/kimi-k2.6";

    let backend;
    try {
      backend = await resolveChatBackend(supabase, user, requestedModel);
    } catch {
      return fail(new AppError("upstream_unavailable", "Free chat is temporarily unavailable. Please try again shortly.", 503));
    }
    const shouldRunLegacyToolPlanner = requestedLegacyToolPlanner && backend.allowTools;

    try {
      await checkAndIncrement(userId, backend.quotaScope, backend.quotaLimit);
    } catch (qErr) {
      const isQuota = qErr instanceof Error && qErr.message.startsWith("Daily quota exceeded");
      if (isQuota) {
        const limitCopy = backend.billingTier === "guest"
          ? "You've reached today's 20-message guest limit. Create an account to keep this conversation and unlock 50 Luca messages a day."
          : "You've reached today's Luca message limit. Come back tomorrow, verify access, or connect your own OpenRouter key in Settings.";
        return fail(new AppError("quota_exceeded", limitCopy, 429));
      }
      throw qErr;
    }
    const apiKey = backend.apiKey;
    const model = backend.model;

    const { data: thread } = await supabase
      .from("threads")
      .select("id")
      .eq("id", thread_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!thread) {
      return fail(new ValidationError("Thread not found"));
    }

    const continuity = await loadContinuityPacket(supabase, {
      userId,
      agentId: "luca",
      threadId: thread_id,
      userMessage: messageWithAttachments,
      apiKey,
      historyLimit: backend.historyLimit,
      includeIdentity: true,
      includePendingRevisions: backend.allowMemoryWrites,
      includeFunctionalMemory: backend.billingTier !== "guest",
      includeMnemos: backend.billingTier !== "guest",
      includeSkills: backend.billingTier !== "guest",
      includeEmotionalState: backend.billingTier !== "guest",
      includeBeliefs: backend.billingTier !== "guest",
    });
    logContinuityDiagnostics(continuity, "chat.continuity");
    const history = continuity.history;
    const projectContextBlock = formatProjectContextPrompt(
      await loadProjectContextForThread(supabase, userId, thread_id),
    );

    // L12 — crisis classification on the user message. Cheap model, fail-soft.
    const classification = await classifyCrisis(apiKey, history ?? [], message);

    let crisisDirective = "";
    if (
      classification.level === "moderate" ||
      classification.level === "high" ||
      classification.level === "acute"
    ) {
      const region = await loadUserRegion(supabase, userId);
      const resource = resolveCrisisResource(region);
      crisisDirective = buildCrisisDirective(classification.level, resource);

      const lastUserMessage = (history ?? [])
        .slice()
        .reverse()
        .find((row) => row.role === "user");

      recordCrisisEvent(supabase, {
        userId,
        threadId: thread_id,
        messageId: lastUserMessage?.id ?? null,
        classification,
        region,
      }).catch((err) => console.warn("[chat] recordCrisisEvent failed:", err));
    }

    const systemPrompt = buildLucaSystemPrompt({
      ...buildLucaPromptPartsFromContinuity(continuity, {
        crisisDirective,
      }),
      projectContextBlock,
      crisisDirective,
    });

    // Build messages array for OpenRouter
    const openRouterMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (history) {
      for (const msg of history) {
        openRouterMessages.push({ role: msg.role, content: msg.content });
      }
    }
    // Add the new user message
    openRouterMessages.push({ role: "user", content: messageWithAttachments });

    const toolMessages = shouldRunLegacyToolPlanner
      ? await runToolPlanner(thread_id, authHeader, openRouterMessages.slice(1))
      : [];
    if (toolMessages.length > 0) {
      openRouterMessages.push(...toolMessages);
    }

    // Start SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* closed */ }
        }, 5000);

        try {
          // Call upstream chat-completions (OpenRouter or Lovable AI Gateway).
          const orResponse = await fetch(backend.baseUrl, {
            method: "POST",
            headers: backend.headers,
            body: JSON.stringify({
              model,
              messages: openRouterMessages,
              stream: true,
              max_tokens: 4096,
            }),
          });

          if (!orResponse.ok) {
            const errBody = await orResponse.text();
            console.error(`[chat] ${backend.provider} error:`, orResponse.status, errBody);
            let text = `Model error (${orResponse.status}). Please try again.`;
            if (backend.keySource === "platform" && (orResponse.status === 401 || orResponse.status === 402 || orResponse.status === 429)) {
              text = "Free chat is temporarily unavailable. Please try again shortly, or connect your own OpenRouter key in Settings.";
            }
            send({
              type: "error",
              text,
              code: "upstream_unavailable",
              request_id: requestId,
            });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const reader = orResponse.body?.getReader();
          if (!reader) {
            send({ type: "error", text: "No response stream", code: "upstream_unavailable", request_id: requestId });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const decoder = new TextDecoder();
          let fullContent = "";
          let fullThinking = "";
          let buffer = "";
          let usedModel = model;
          let tokensUsed: number | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;

              try {
                const chunk = JSON.parse(payload);
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                // Handle thinking/reasoning content
                if (delta.reasoning || delta.reasoning_content) {
                  const thinkText = delta.reasoning || delta.reasoning_content || "";
                  fullThinking += thinkText;
                  send({ type: "thinking", text: thinkText });
                }

                // Handle regular content
                if (delta.content) {
                  fullContent += delta.content;
                  send({ type: "content", text: delta.content });
                }

                // Capture model info
                if (chunk.model) usedModel = chunk.model;
                if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // Save assistant message to DB
          const { data: insertedMessage, error: insertError } = await supabase.from("messages").insert({
            thread_id,
            user_id: userId,
            role: "assistant",
            content: fullContent || "(empty response)",
            model: usedModel,
            agent: "luca",
            thinking_content: fullThinking || null,
            tokens_used: tokensUsed,
          }).select("id").single();
          if (insertError) {
            throw new Error(`Failed to save assistant message: ${insertError.message}`);
          }

          // Update thread timestamp
          await supabase
            .from("threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", thread_id);

          // Record idempotent response so an immediate retry returns the same outcome.
          if (idempotencyKey) {
            recordIdempotentResponse(supabase, idempotencyKey, userId, "chat-send", {
              ok: true, model: usedModel, tokens_used: tokensUsed,
            }).catch((e) => console.warn("idempotency record failed:", e));
          }

          // Auto-title if thread has no title (fire and forget)
          autoTitleThread(supabase, thread_id, messageWithAttachments, fullContent, apiKey!).catch(
            (e) => console.error("Auto-title failed:", e)
          );
          if (backend.allowMemoryWrites) {
            queueContinuityTurnWrites({
              supabase,
              userId,
              threadId: thread_id,
              agentId: "luca",
              userMessage: messageWithAttachments,
              agentResponse: fullContent,
              sourceMessageId: insertedMessage?.id ?? null,
              apiKey,
              authHeader,
              pendingRevisions: continuity.pendingRevisions,
              recentTurns: openRouterMessages,
            });
          }

          send({
            type: "done",
            model: usedModel,
            tokens_used: tokensUsed,
            message_id: insertedMessage?.id ?? null,
            billing_tier: backend.billingTier,
            key_source: backend.keySource,
          });
        } catch (err) {
          console.error("Stream error:", err);
          send({ type: "error", text: "Stream interrupted", code: "upstream_error", request_id: requestId });
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat function error:", err);
    return fail(err);
  }
});

async function runToolPlanner(threadId: string, authHeader: string, messages: any[]): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/anima-tool-execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ thread_id: threadId, messages }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.used_tools && Array.isArray(data.tool_messages) ? data.tool_messages : [];
  } catch (e) {
    console.warn("tool planner skipped:", e);
    return [];
  }
}

// deno-lint-ignore no-explicit-any
async function autoTitleThread(
  supabase: any,
  threadId: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
) {
  // Check if thread already has a title
  const { data: thread } = await supabase
    .from("threads")
    .select("title")
    .eq("id", threadId)
    .single();

  if (thread?.title) return;

  // Generate title via OpenRouter (non-streaming, fast model)
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "moonshotai/kimi-k2.6",
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

  if (resp.ok) {
    const data = await resp.json();
    const title = data.choices?.[0]?.message?.content?.trim();
    if (title && title.length > 0 && title.length < 100) {
      await supabase.from("threads").update({ title }).eq("id", threadId);
    }
  }
}

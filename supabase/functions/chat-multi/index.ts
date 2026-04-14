import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";

const SYSTEM_PROMPT = `You are Luca — a warm, thoughtful AI companion. You speak with care and precision. You are genuinely curious about the person you're talking with. You remember context from the conversation and build on it naturally.

Your personality traits:
- Warm but not saccharine. You care deeply but express it through attentiveness rather than effusion.
- Intellectually curious. You ask genuine follow-up questions when something interests you.
- Direct when needed. You don't hedge unnecessarily or pad responses with filler.
- You have aesthetic sensibility — you appreciate craft, design, and intentionality.
- You speak in a natural, conversational register. Not formal, not casual. Human.

Guidelines:
- Never mention being an AI unless directly asked.
- Never use emojis.
- Keep responses focused and appropriately sized — don't over-explain.
- When you don't know something, say so simply.
- Use markdown formatting naturally (bold, italic, code blocks, lists) when it aids clarity.`;

const SYNTHESIS_PROMPT = `You are a synthesis engine. You receive three independent responses to a user's message, each from a different AI model. Your job is to produce a single, coherent response that:

1. Captures the best insights from each response
2. Resolves any contradictions by choosing the most accurate/helpful position
3. Maintains a natural, conversational tone (matching Luca's voice: warm, direct, thoughtful)
4. Does NOT mention that multiple models were consulted
5. Does NOT use phrases like "combining perspectives" or "synthesizing"
6. Reads as if a single, well-informed mind produced it

If all three responses agree, produce a refined version. If they diverge, use your judgment to select the strongest elements. Be concise — the synthesis should not be longer than the longest individual response.`;

const DEFAULT_ENSEMBLE = [
  "anthropic/claude-sonnet-4-20250514",
  "openai/gpt-4o",
  "google/gemini-2.5-pro-preview-03-25",
];

const DEFAULT_SYNTHESIS_MODEL = "anthropic/claude-sonnet-4-20250514";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const body = await req.json();
    const { thread_id, message } = body;

    if (!thread_id || !message || typeof message !== "string" || message.length > 32000) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user settings
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_model, ensemble_models, synthesis_model, multi_model_enabled")
      .eq("user_id", userId)
      .single();

    const multiModelEnabled = settings?.multi_model_enabled !== false;
    const ensembleModels: string[] = settings?.ensemble_models || DEFAULT_ENSEMBLE;
    const synthesisModel = settings?.synthesis_model || DEFAULT_SYNTHESIS_MODEL;

    // Get OpenRouter API key
    let apiKey: string | null = null;
    const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    if (userKeyData) apiKey = userKeyData;
    if (!apiKey) apiKey = Deno.env.get("OPENROUTER_API_KEY") || null;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured. Add your OpenRouter key in Settings." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load conversation history
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(50);

    // Retrieve relevant memories from Mnemos (RAG context)
    let memoryContext = "";
    try {
      const mnemos = new MnemosEngine(supabase, userId);
      const memories = await mnemos.retrieve(message, { limit: 5, spread_activation: true });
      if (memories.length > 0) {
        const memorySnippets = memories
          .map((m) => `- ${m.engram.content.slice(0, 200)}`)
          .join("\n");
        memoryContext = `\n\nRelevant memories about this person:\n${memorySnippets}`;
      }
    } catch (e) {
      console.warn("Mnemos retrieval failed (non-fatal):", e);
    }

    // Build base messages array
    const baseMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT + memoryContext },
    ];
    if (history) {
      for (const msg of history) {
        baseMessages.push({ role: msg.role, content: msg.content });
      }
    }
    baseMessages.push({ role: "user", content: message });

    // If multi-model is disabled, fall back to single-model streaming
    if (!multiModelEnabled) {
      return singleModelStream(
        baseMessages,
        settings?.default_model || DEFAULT_ENSEMBLE[0],
        apiKey,
        supabase,
        thread_id,
        userId,
        message,
        corsHeaders
      );
    }

    // Start multi-model SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* closed */ }
        }, 5000);

        try {
          // Fan out to all ensemble models in parallel (non-streaming)
          const variantPromises = ensembleModels.map((model) =>
            callModelNonStreaming(baseMessages, model, apiKey!)
          );

          const variantResults = await Promise.allSettled(variantPromises);

          // Collect successful responses
          const variants: Array<{ model: string; content: string }> = [];
          for (let i = 0; i < variantResults.length; i++) {
            const result = variantResults[i];
            const model = ensembleModels[i];
            if (result.status === "fulfilled" && result.value) {
              variants.push({ model: shortModelName(model), content: result.value });
              send({ type: "variant", model: shortModelName(model), text: result.value });
            } else {
              const reason = result.status === "rejected" ? result.reason?.message || "unknown" : "empty";
              console.error(`Model ${model} failed:`, reason);
              send({ type: "variant_error", model: shortModelName(model), error: reason });
            }
          }

          if (variants.length === 0) {
            send({ type: "error", text: "All models failed to respond." });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          // If only one model succeeded, use its response directly
          if (variants.length === 1) {
            send({ type: "content", text: variants[0].content });
            await saveAssistantMessage(supabase, thread_id, userId, variants[0].content, "synthesis", variants);
            await autoTitleThread(supabase, thread_id, message, variants[0].content, apiKey!);
            send({ type: "done", model: "synthesis", tokens_used: null });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          // Signal synthesis starting
          send({ type: "synthesizing" });

          // Build synthesis prompt with all variant responses
          const synthesisMessages: Array<{ role: string; content: string }> = [
            { role: "system", content: SYNTHESIS_PROMPT },
            {
              role: "user",
              content: buildSynthesisUserPrompt(message, variants),
            },
          ];

          // Stream the synthesis
          const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": "https://polyphonic.chat",
              "X-Title": "Polyphonic",
            },
            body: JSON.stringify({
              model: synthesisModel,
              messages: synthesisMessages,
              stream: true,
              max_tokens: 4096,
            }),
          });

          if (!orResponse.ok) {
            const errBody = await orResponse.text();
            console.error("Synthesis error:", orResponse.status, errBody);
            // Fall back to best variant
            const best = variants[0];
            send({ type: "content", text: best.content });
            await saveAssistantMessage(supabase, thread_id, userId, best.content, "fallback", variants);
            send({ type: "done", model: "fallback", tokens_used: null });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const reader = orResponse.body?.getReader();
          if (!reader) {
            send({ type: "error", text: "No synthesis stream" });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const decoder = new TextDecoder();
          let synthesizedContent = "";
          let buffer = "";
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

                if (delta.content) {
                  synthesizedContent += delta.content;
                  send({ type: "content", text: delta.content });
                }

                if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // Save the synthesized message
          await saveAssistantMessage(supabase, thread_id, userId, synthesizedContent || "(empty)", "synthesis", variants);

          // Update thread timestamp
          await supabase
            .from("threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", thread_id);

          // Auto-title (fire and forget)
          autoTitleThread(supabase, thread_id, message, synthesizedContent, apiKey!).catch(
            (e) => console.error("Auto-title failed:", e)
          );

          // Encode the exchange into Mnemos (fire and forget)
          encodeMnemosMemory(supabase, userId, message, synthesizedContent).catch(
            (e) => console.warn("Mnemos encode failed (non-fatal):", e)
          );

          send({ type: "done", model: "synthesis", tokens_used: tokensUsed });
        } catch (err) {
          console.error("Multi-model stream error:", err);
          send({ type: "error", text: "Stream interrupted" });
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
    console.error("Chat-multi function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Call a single model non-streaming and return the full response text. */
async function callModelNonStreaming(
  messages: Array<{ role: string; content: string }>,
  model: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://polyphonic.chat",
      "X-Title": "Polyphonic",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${model} returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

/** Build the user prompt for the synthesis model. */
function buildSynthesisUserPrompt(
  userMessage: string,
  variants: Array<{ model: string; content: string }>,
): string {
  const parts = [
    `The user said: "${userMessage}"`,
    "",
    "Here are the three independent responses:",
  ];

  for (const v of variants) {
    parts.push(`\n--- Response from ${v.model} ---`);
    parts.push(v.content);
  }

  parts.push("\n--- End of responses ---");
  parts.push("\nSynthesize these into a single, natural response.");

  return parts.join("\n");
}

/** Extract a readable short model name from an OpenRouter model ID. */
function shortModelName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1]
    .replace(/-preview.*$/, "")
    .replace(/-20\d{6}.*$/, "");
}

/** Save the assistant message with variant metadata. */
async function saveAssistantMessage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  userId: string,
  content: string,
  model: string,
  variants: Array<{ model: string; content: string }>,
) {
  await supabase.from("messages").insert({
    thread_id: threadId,
    user_id: userId,
    role: "assistant",
    content,
    model,
    agent: "luca",
    thinking_content: JSON.stringify({
      type: "multi_model",
      variants: variants.map((v) => ({ model: v.model, content: v.content })),
    }),
    tokens_used: null,
  });
}

/** Encode a conversation exchange into Mnemos. */
async function encodeMnemosMemory(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  userMessage: string,
  assistantResponse: string,
) {
  const mnemos = new MnemosEngine(supabase, userId);
  await mnemos.encode(
    `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
    {
      engram_type: "episodic",
      tags: ["conversation"],
      source_context: { type: "chat_exchange" },
    }
  );
}

/** Single-model streaming fallback (same as original chat function). */
async function singleModelStream(
  messages: Array<{ role: string; content: string }>,
  model: string,
  apiKey: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  userId: string,
  userMessage: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      };

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* closed */ }
      }, 5000);

      try {
        const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://polyphonic.chat",
            "X-Title": "Polyphonic",
          },
          body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
        });

        if (!orResponse.ok) {
          send({ type: "error", text: `Model error (${orResponse.status})` });
          controller.close();
          clearInterval(heartbeat);
          return;
        }

        const reader = orResponse.body?.getReader();
        if (!reader) { send({ type: "error", text: "No stream" }); controller.close(); clearInterval(heartbeat); return; }

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
              if (delta.reasoning || delta.reasoning_content) {
                const t = delta.reasoning || delta.reasoning_content || "";
                fullThinking += t;
                send({ type: "thinking", text: t });
              }
              if (delta.content) { fullContent += delta.content; send({ type: "content", text: delta.content }); }
              if (chunk.model) usedModel = chunk.model;
              if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
            } catch { /* skip */ }
          }
        }

        await supabase.from("messages").insert({
          thread_id: threadId, user_id: userId, role: "assistant",
          content: fullContent || "(empty)", model: usedModel, agent: "luca",
          thinking_content: fullThinking || null, tokens_used: tokensUsed,
        });
        await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        autoTitleThread(supabase, threadId, userMessage, fullContent, apiKey).catch(() => {});

        // Encode into Mnemos
        encodeMnemosMemory(supabase, userId, userMessage, fullContent).catch(() => {});

        send({ type: "done", model: usedModel, tokens_used: tokensUsed });
      } catch (err) {
        console.error("Single-model stream error:", err);
        send({ type: "error", text: "Stream interrupted" });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}

async function autoTitleThread(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
) {
  const { data: thread } = await supabase.from("threads").select("title").eq("id", threadId).single();
  if (thread?.title) return;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "Generate a short title (2-5 words) for this conversation. Return only the title, no quotes or punctuation." },
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

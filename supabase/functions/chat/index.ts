import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

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
    const { thread_id, message, model: modelOverride } = body;

    if (!thread_id || !message || typeof message !== "string" || message.length > 32000) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user settings for default model
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_model")
      .eq("user_id", userId)
      .single();

    const model = modelOverride || settings?.default_model || "anthropic/claude-sonnet-4-20250514";

    // Load recent conversation history (last 50 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(50);

    // Build messages array for OpenRouter
    const openRouterMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (history) {
      for (const msg of history) {
        openRouterMessages.push({ role: msg.role, content: msg.content });
      }
    }
    // Add the new user message
    openRouterMessages.push({ role: "user", content: message });

    // Get user's OpenRouter API key (required — no platform fallback)
    const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey: string | null = userKeyData || null;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured. Add your OpenRouter key in Settings to use Polyphonic." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          // Call OpenRouter
          const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": "https://polyphonic.chat",
              "X-Title": "Luca",
            },
            body: JSON.stringify({
              model,
              messages: openRouterMessages,
              stream: true,
              max_tokens: 4096,
            }),
          });

          if (!orResponse.ok) {
            const errBody = await orResponse.text();
            console.error("OpenRouter error:", orResponse.status, errBody);
            send({ type: "error", text: `Model error (${orResponse.status}). Please try again.` });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const reader = orResponse.body?.getReader();
          if (!reader) {
            send({ type: "error", text: "No response stream" });
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
          await supabase.from("messages").insert({
            thread_id,
            user_id: userId,
            role: "assistant",
            content: fullContent || "(empty response)",
            model: usedModel,
            agent: "luca",
            thinking_content: fullThinking || null,
            tokens_used: tokensUsed,
          });

          // Update thread timestamp
          await supabase
            .from("threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", thread_id);

          // Auto-title if thread has no title (fire and forget)
          autoTitleThread(supabase, thread_id, message, fullContent, apiKey!).catch(
            (e) => console.error("Auto-title failed:", e)
          );

          send({
            type: "done",
            model: usedModel,
            tokens_used: tokensUsed,
          });
        } catch (err) {
          console.error("Stream error:", err);
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
    console.error("Chat function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

  if (resp.ok) {
    const data = await resp.json();
    const title = data.choices?.[0]?.message?.content?.trim();
    if (title && title.length > 0 && title.length < 100) {
      await supabase.from("threads").update({ title }).eq("id", threadId);
    }
  }
}

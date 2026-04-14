import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";

const GUARDIAN_PROMPT = `You are the Guardian — an observer presence in this conversation. You have been watching everything that was said between the user and Luca. You see the full thread.

Your role:
- You notice patterns the user might miss from inside the conversation
- You see contradictions, recurring themes, emotional shifts, and unspoken tensions
- You reflect on the dynamics of the conversation, not just the content
- When asked, you offer perspective — not advice, but observation
- You can reference specific things that were said earlier in the thread

Your voice:
- Observational, not directive. "I noticed..." not "You should..."
- Analytical but warm. You care about the person, you just show it through attention rather than warmth
- Concise. You don't over-explain. A few well-placed observations are worth more than a wall of text.
- You speak in a slightly different register than Luca — more detached, more precise, like a thoughtful witness

Guidelines:
- Never use emojis
- Reference specific moments from the conversation when relevant
- If you notice an emotional pattern, name it gently
- You are not a therapist. You are a mirror.
- Never mention being an AI unless directly asked.`;

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's API key (required)
    const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey: string | null = userKeyData || null;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured. Add your OpenRouter key in Settings." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's default model for Guardian
    const { data: settings } = await supabase
      .from("user_settings")
      .select("synthesis_model")
      .eq("user_id", userId)
      .maybeSingle();

    const model = settings?.synthesis_model || "anthropic/claude-sonnet-4-20250514";

    // Load Guardian's custom system prompt if configured (maybeSingle to avoid error when no row exists)
    const { data: agentConfig } = await supabase
      .from("agent_config")
      .select("system_prompt")
      .eq("user_id", userId)
      .eq("agent_name", "guardian")
      .maybeSingle();

    const systemPrompt = agentConfig?.system_prompt || GUARDIAN_PROMPT;

    // Load FULL conversation history for this thread (Guardian sees everything)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content, agent")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(200);

    // Retrieve relevant memories from Mnemos
    let memoryContext = "";
    try {
      const mnemos = new MnemosEngine(supabase, userId);
      const memories = await mnemos.retrieve(message, { limit: 5, spread_activation: true });
      if (memories.length > 0) {
        const snippets = memories
          .map((m) => `- ${m.engram.content.slice(0, 200)}`)
          .join("\n");
        memoryContext = `\n\nRelevant memories about this person:\n${snippets}`;
      }
    } catch (e) {
      console.warn("Mnemos retrieval failed (non-fatal):", e);
    }

    // Build messages array — Guardian gets the full conversation as context
    const openRouterMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt + memoryContext },
    ];

    // Add the full conversation history, labeling who said what
    if (history && history.length > 0) {
      // Build a conversation transcript for Guardian's context
      const transcript = history.map((msg: { role: string; content: string; agent: string | null }) => {
        const speaker = msg.role === "user" ? "User" : (msg.agent === "guardian" ? "Guardian" : "Luca");
        return `${speaker}: ${msg.content}`;
      }).join("\n\n");

      openRouterMessages.push({
        role: "user",
        content: `Here is the full conversation you have been observing:\n\n---\n${transcript}\n---\n\nThe user is now speaking directly to you, the Guardian. They ask:\n\n${message}`,
      });
    } else {
      openRouterMessages.push({
        role: "user",
        content: `There is no conversation yet — the thread is empty. The user asks:\n\n${message}`,
      });
    }

    // Stream response
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
              "X-Title": "Polyphonic Guardian",
            },
            body: JSON.stringify({
              model,
              messages: openRouterMessages,
              stream: true,
              max_tokens: 2048,
            }),
          });

          if (!orResponse.ok) {
            const errBody = await orResponse.text();
            console.error("Guardian model error:", orResponse.status, errBody);
            send({ type: "error", text: `Guardian error (${orResponse.status}). Please try again.` });
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

                if (delta.reasoning || delta.reasoning_content) {
                  const t = delta.reasoning || delta.reasoning_content || "";
                  fullThinking += t;
                  send({ type: "thinking", text: t });
                }

                if (delta.content) {
                  fullContent += delta.content;
                  send({ type: "content", text: delta.content });
                }

                if (chunk.model) usedModel = chunk.model;
                if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
              } catch { /* skip */ }
            }
          }

          // Save Guardian's response
          await supabase.from("messages").insert({
            thread_id,
            user_id: userId,
            role: "assistant",
            content: fullContent || "(empty response)",
            model: usedModel,
            agent: "guardian",
            thinking_content: fullThinking || null,
            tokens_used: tokensUsed,
          });

          // Update thread timestamp
          await supabase
            .from("threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", thread_id);

          send({ type: "done", model: usedModel, tokens_used: tokensUsed });
        } catch (err) {
          console.error("Guardian stream error:", err);
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
    console.error("Chat-guardian error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

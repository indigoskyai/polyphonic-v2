// observer-chat — synchronous request/response. The user asks the Observer
// a question about a thread. Persists both messages.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { OBSERVER_SOUL, OBSERVER_CHAT_INSTRUCTIONS } from "../_shared/agents/observer-soul.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { AuthError, MissingApiKeyError, UpstreamUnavailableError, ValidationError, errorResponse, newRequestId } from "../_shared/errors.ts";
import { resolveScopeAgentId } from "../_shared/agent-scope.ts";

const OBSERVER_MODEL = "anthropic/claude-haiku-4.5";

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  const requestId = newRequestId();
  const fail = (err: unknown) => errorResponse(err, corsHeaders, requestId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(new AuthError());
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return fail(new AuthError());
    }

    const { thread_id, message } = await req.json();
    if (!thread_id || !message || typeof message !== "string" || message.length > 4000) {
      return fail(new ValidationError("Invalid request"));
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, user_id, agent_id, primary_agent_id")
      .eq("id", thread_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (threadError) {
      console.error("[observer-chat] thread lookup failed:", threadError);
      return fail(new ValidationError("Thread lookup failed"));
    }
    if (!thread) {
      return fail(new ValidationError("Thread not found"));
    }
    const threadAgentId = resolveScopeAgentId(thread);

    const { data: apiKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user.id });
    if (!apiKey) {
      return fail(new MissingApiKeyError("No API key configured."));
    }

    // Persist the user's question first
    await supabase.from("observer_chat_messages").insert({
      user_id: user.id,
      thread_id,
      role: "user",
      content: message,
    });

    // Load context: thread history, observer notes, prior observer chat, emotional state
    const [historyRes, notesRes, observerChatRes, emotionalRes] = await Promise.allSettled([
      supabase.from("messages")
        .select("role, content, agent, created_at")
        .eq("user_id", user.id)
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("observer_notes")
        .select("kind, content, created_at, salience")
        .eq("user_id", user.id)
        .eq("agent_id", threadAgentId)
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("observer_chat_messages")
        .select("role, content, created_at")
        .eq("user_id", user.id)
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: false })
        .limit(20),
      loadEmotionalState(supabase, user.id, threadAgentId),
    ]);

    const history = historyRes.status === "fulfilled" ? (historyRes.value.data || []).reverse() : [];
    const notes = notesRes.status === "fulfilled" ? (notesRes.value.data || []) : [];
    const observerChat = observerChatRes.status === "fulfilled" ? (observerChatRes.value.data || []).reverse() : [];
    const emotionalBlock = emotionalRes.status === "fulfilled"
      ? formatEmotionalPrompt(emotionalRes.value)
      : "";

    const transcript = history
      .map((m: { role: string; content: string; agent?: string }) => {
        const speaker = m.role === "user" ? "user" : (m.agent || "assistant");
        return `${speaker}: ${(m.content || "").slice(0, 1000)}`;
      })
      .join("\n\n");

    const notesBlock = notes.length > 0
      ? `\n\nYour prior observations on this thread:\n${notes.map((n: { kind: string; content: string }) => `- [${n.kind}] ${n.content}`).join("\n")}`
      : "\n\nYou have no prior observations on this thread yet.";

    const contextBlock = [
      emotionalBlock ? `\n${emotionalBlock}` : "",
      `\nThread transcript:\n${transcript || "(empty thread)"}`,
      notesBlock,
      `\n\n${OBSERVER_CHAT_INSTRUCTIONS}`,
    ].filter(Boolean).join("\n");

    // Build the chat with prior observer-chat exchanges (skip the very last user message we just inserted —
    // observerChat already excludes it because the read happened before the insert was committed in some cases,
    // but to be safe we filter anyway).
    const chatMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: OBSERVER_SOUL + "\n\n" + contextBlock },
    ];
    // Include only the last few prior turns (omit the just-inserted question; we'll add it explicitly)
    const prior = observerChat.filter(
      (m: { role: string; content: string }, idx: number, arr: Array<{ role: string; content: string }>) =>
        !(idx === arr.length - 1 && m.role === "user" && m.content === message)
    );
    for (const m of prior) {
      chatMessages.push({ role: m.role, content: m.content });
    }
    chatMessages.push({ role: "user", content: message });

    const orResponse = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Observer",
      },
      body: JSON.stringify({
        model: OBSERVER_MODEL,
        messages: chatMessages,
        max_tokens: 800,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!orResponse.ok) {
      const errText = await orResponse.text().catch(() => "");
      console.error("observer-chat model error:", orResponse.status, errText.slice(0, 300));
      return fail(new UpstreamUnavailableError(`Model error (${orResponse.status})`, { status: orResponse.status }));
    }

    const data = await orResponse.json();
    const reply = (data?.choices?.[0]?.message?.content || "").trim();

    if (!reply) {
      return fail(new UpstreamUnavailableError("Empty reply"));
    }

    await supabase.from("observer_chat_messages").insert({
      user_id: user.id,
      thread_id,
      role: "assistant",
      content: reply,
    });

    return new Response(JSON.stringify({ ok: true, reply }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("observer-chat error:", err);
    return fail(err);
  }
});

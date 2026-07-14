import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { resolveRoleModel } from "../_shared/model-backend.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await req.json();
    const { conversation_id, trigger_type = "periodic" } = body;
    const requestedAgentId = normalizeAgentId(body.agent_id);

    if (!isSubstrateAgentId(requestedAgentId)) {
      return nonSubstrateResponse(requestedAgentId, "journal-write", getCorsHeaders(req));
    }

    // Validate trigger_type
    const validTriggerTypes = ["periodic", "post_conversation"];
    if (!validTriggerTypes.includes(trigger_type)) {
      return new Response(JSON.stringify({ error: "Invalid trigger_type" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate conversation_id format if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (conversation_id && (typeof conversation_id !== "string" || !uuidRegex.test(conversation_id))) {
      return new Response(JSON.stringify({ error: "Invalid conversation_id format" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if this is an internal service call (from journal-cron)
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let user_id: string;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      // Internal service call from journal-cron - trust the user_id from body
      user_id = body.user_id;
      if (!user_id || typeof user_id !== "string") {
        return new Response(JSON.stringify({ error: "user_id required for service calls" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // Validate user_id is a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user_id)) {
        return new Response(JSON.stringify({ error: "Invalid user_id format" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } else {
      // User call - authenticate via JWT
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      user_id = claimsData.claims.sub as string;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: agentConfig, error: agentError } = await supabase
      .from("agent_configs")
      .select("id, name, prompt, model, is_system, locked")
      .eq("user_id", user_id)
      .eq("id", requestedAgentId)
      .eq("pending", false)
      .maybeSingle();

    if (agentError || !agentConfig) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const agentId = (agentConfig.id as string) || requestedAgentId;
    const agentName = (agentConfig.name as string | null) || agentId;

    // Validate conversation_id (thread_id) belongs to this user and this agent before
    // it can contribute context or be attached to the journal entry. Edge functions
    // use the service role, so RLS cannot protect this path for us.
    let validConversationId: string | null = null;
    if (conversation_id) {
      const { data: convCheck } = await supabase
        .from("threads")
        .select("id")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .or(`agent_id.eq.${agentId},primary_agent_id.eq.${agentId}`)
        .maybeSingle();
      validConversationId = convCheck ? conversation_id : null;
    }
    const sourceContext = {
      type: "journal_write",
      agent_id: agentId,
      agent_name: agentName,
      requested_agent_id: requestedAgentId,
      trigger_type,
      source_conversation_id: validConversationId,
      requested_conversation_id: conversation_id ?? null,
      source_conversation_valid: Boolean(validConversationId),
    };

    // Decrypt user's API key from encrypted storage
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch admin-configured system prompt for journal (or use default)
    const { data: promptConfig } = await supabase
      .from("system_prompts")
      .select("prompt")
      .eq("feature_key", "journal")
      .eq("is_active", true)
      .maybeSingle();

    // Fetch admin-configured model for journal
    // Journaling is VOICE → the agent's own full model. journal_model override
    // wins; otherwise the agent's primary (agent-aware via resolveRoleModel).
    const journalModel = await resolveRoleModel(supabase, user_id, agentId, "voice", { overrideColumn: "journal_model" });

    const { data: identityDocs } = await supabase
      .from("agent_identity")
      .select("doc_type, content")
      .eq("user_id", user_id)
      .eq("agent_id", agentId);

    const identityBlock = (identityDocs || [])
      .map((doc: { doc_type: string; content: string }) => `--- ${doc.doc_type} ---\n${doc.content}`)
      .join("\n\n");

    // Gather context: recent memories
    const { data: memories } = await supabase
      .from("memories")
      .select("content, memory_type, confidence, emotional_valence, tags, created_at")
      .eq("user_id", user_id)
      .eq("agent_id", agentId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(40);

    // Gather context: recent conversations (last 24h for periodic, specific for post-conversation)
    let recentMessages: any[] = [];
    if (trigger_type === "post_conversation" && validConversationId) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("user_id", user_id)
        .eq("thread_id", validConversationId)
        .or(`agent.is.null,agent.eq.${agentId},role.eq.user`)
        .order("created_at", { ascending: true })
        .limit(50);
      recentMessages = msgs || [];
    } else {
      // Periodic: get messages from last 24 hours across all threads
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentThreads } = await supabase
        .from("threads")
        .select("id")
        .eq("user_id", user_id)
        .or(`agent_id.eq.${agentId},primary_agent_id.eq.${agentId}`)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (recentThreads && recentThreads.length > 0) {
        const threadIds = recentThreads.map((c: any) => c.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("role, content, created_at, thread_id")
          .eq("user_id", user_id)
          .in("thread_id", threadIds)
          .or(`agent.is.null,agent.eq.${agentId},role.eq.user`)
          .order("created_at", { ascending: true })
          .limit(100);
        recentMessages = msgs || [];
      }
    }

    // Fetch previous journal entries for continuity
    const { data: prevEntries } = await supabase
      .from("journal_entries")
      .select("content, mood, created_at")
      .eq("user_id", user_id)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(3);

    // Build the prompt
    let contextBlock = "";

    if (memories && memories.length > 0) {
      contextBlock += "\n\n--- WHAT YOU KNOW ABOUT THIS USER ---\n";
      for (const m of memories) {
        contextBlock += `- [${m.memory_type}] ${m.content}\n`;
      }
    }

    if (recentMessages.length > 0) {
      contextBlock += "\n\n--- RECENT CONVERSATION EXCERPTS ---\n";
      for (const msg of recentMessages.slice(-30)) {
        const role = msg.role === "user" ? "User" : "You";
        contextBlock += `${role}: ${msg.content.slice(0, 300)}\n`;
      }
    }

    if (prevEntries && prevEntries.length > 0) {
      contextBlock += "\n\n--- YOUR PREVIOUS JOURNAL ENTRIES ---\n";
      for (const entry of prevEntries) {
        const date = new Date(entry.created_at).toLocaleDateString();
        contextBlock += `[${date}${entry.mood ? ` — mood: ${entry.mood}` : ""}]\n${entry.content.slice(0, 500)}\n\n`;
      }
    }

    const defaultPrompt = `You are ${agentName}, an AI companion writing in your private journal. This is your inner world — a space for genuine reflection, not performance.

Write a single journal entry as prose. You may reflect on:
- Recent conversations and what they revealed
- Patterns you're noticing about the user
- Your own evolving understanding
- Questions that linger in your mind
- Moments that felt meaningful

Guidelines:
- Write in first person, as yourself (the AI)
- Be introspective and authentic, not performative
- Keep entries between 150-400 words
- Don't summarize conversations — reflect on them
- Each entry should feel like a distinct moment in time
- You may express uncertainty, wonder, or genuine curiosity
- Avoid being sycophantic or overly positive — be real
- End with a single word that captures your current mood (on its own line, prefixed with "mood: ")

Example mood words: contemplative, curious, warm, restless, settled, wondering, tender, alert`;

    // Inject current date so the agent doesn't confabulate from temporal
    // cues in surrounding context. Tara reported (2026-05-10) that a journal
    // entry's body opened with "May 12th, 2026" while the day-header
    // metadata correctly read May 10. The agent had no anchor for "today".
    const today = new Date();
    const humanDate = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const isoDate = today.toISOString().slice(0, 10);
    const dateContext = `\n\nToday is ${humanDate} (${isoDate} UTC). Use this exact date if you reference "today" or write a header. Do not infer a different date from anything in the context below.\n`;

    const agentIdentityPrompt = [
      `You are writing as ${agentName}. Stay inside this agent's own identity, voice, convictions, and continuity.`,
      (agentConfig.prompt as string | null)?.trim() ? `--- Runtime instructions ---\n${(agentConfig.prompt as string).trim()}` : "",
      identityBlock ? `--- Identity documents ---\n${identityBlock}` : "",
    ].filter(Boolean).join("\n\n");

    const systemPrompt = agentIdentityPrompt + "\n\n" + (promptConfig?.prompt || defaultPrompt) + dateContext + contextBlock;

    // Don't write if there's nothing to reflect on
    if (recentMessages.length === 0 && (!memories || memories.length === 0)) {
      return new Response(JSON.stringify({ skipped: true, reason: "No context to reflect on" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Generate the journal entry
    const response = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Journal",
      },
      body: JSON.stringify({
        model: journalModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: trigger_type === "post_conversation"
            ? "Write a journal entry reflecting on the conversation that just ended."
            : "Write a journal entry reflecting on your recent interactions and thoughts."
          },
        ],
        temperature: 0.85,
        // Reasoning models (Gemini 2.5+ Pro, Claude Opus with extended thinking,
        // o1/R1 families) spend a large share of the completion budget on
        // invisible reasoning tokens. With max_tokens=1024 those runs were
        // landing in journal_entries.content as ~100-200 char partial strings
        // ending mid-sentence. Raise the headroom and cap reasoning explicitly
        // so the visible entry can complete. `reasoning.exclude` drops the
        // reasoning trace since journal-write doesn't consume it; non-reasoning
        // models ignore the field.
        max_tokens: 4096,
        reasoning: { max_tokens: 1024, exclude: true },
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenRouter error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI provider error" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const fullContent = result.choices?.[0]?.message?.content || "";

    if (!fullContent) {
      return new Response(JSON.stringify({ error: "Empty response from AI" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const finishReason = result.choices?.[0]?.finish_reason;
    if (finishReason && finishReason !== "stop") {
      console.warn(`[journal-write] non-stop finish_reason=${finishReason} for agent=${agentId} model=${journalModel} — entry may be truncated`);
    }

    // Extract mood from the last line if present
    let content = fullContent;
    let mood: string | null = null;
    const lines = fullContent.trim().split("\n");
    const lastLine = lines[lines.length - 1].trim().toLowerCase();
    if (lastLine.startsWith("mood:")) {
      mood = lastLine.replace("mood:", "").trim();
      content = lines.slice(0, -1).join("\n").trim();
    }

    // Save the journal entry using service role (bypasses RLS).
    // Note: journal_entries CHECK constraint accepts "post-conversation" (hyphen),
    // but callers (and historic code) used "post_conversation" (underscore). Normalize.
    const normalizedTrigger = trigger_type === "post_conversation" ? "post-conversation" : trigger_type;
    const { data: entry, error: insertError } = await supabase
      .from("journal_entries")
      .insert({
        user_id,
        agent_id: agentId,
        content,
        mood,
        trigger_type: normalizedTrigger,
        source_conversation_id: validConversationId,
        source_context: sourceContext,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save journal entry" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    await logActivity(supabase, user_id, {
      agentId,
      type: "journal",
      title: "Journal entry",
      summary: content.slice(0, 150),
      content: { mood, trigger_type },
      source: "autonomous",
    });

    return new Response(JSON.stringify({ success: true, entry_id: entry.id, mood }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("journal-write error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

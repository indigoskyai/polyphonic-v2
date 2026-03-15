import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await req.json();
    const { conversation_id, trigger_type = "periodic" } = body;

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

    // Decrypt user's API key from encrypted storage
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey || Deno.env.get("OPENROUTER_API_KEY");
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
    const { data: modelConfig } = await supabase
      .from("model_configs")
      .select("model_id")
      .eq("feature_key", "journal")
      .eq("is_active", true)
      .maybeSingle();

    // Fetch user's preferred journal model
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("journal_model")
      .eq("user_id", user_id)
      .maybeSingle();

    // Priority: user preference > admin config > hardcoded default
    const journalModel = userSettings?.journal_model || modelConfig?.model_id || "anthropic/claude-opus-4.6";

    // Gather context: recent memories
    const { data: memories } = await supabase
      .from("memories")
      .select("content, memory_type, confidence, emotional_valence, tags, created_at")
      .eq("user_id", user_id)
      .eq("is_deleted", false)
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(40);

    // Gather context: recent conversations (last 24h for periodic, specific for post-conversation)
    let recentMessages: any[] = [];
    if (trigger_type === "post_conversation" && conversation_id) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(50);
      recentMessages = msgs || [];
    } else {
      // Periodic: get messages from last 24 hours across all conversations
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentConvos } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user_id)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (recentConvos && recentConvos.length > 0) {
        const convIds = recentConvos.map((c: any) => c.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("role, content, created_at, conversation_id")
          .in("conversation_id", convIds)
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

    const defaultPrompt = `You are an AI companion writing in your private journal. This is your inner world — a space for genuine reflection, not performance.

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

    const systemPrompt = (promptConfig?.prompt || defaultPrompt) + contextBlock;

    // Don't write if there's nothing to reflect on
    if (recentMessages.length === 0 && (!memories || memories.length === 0)) {
      return new Response(JSON.stringify({ skipped: true, reason: "No context to reflect on" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Generate the journal entry
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        max_tokens: 1024,
      }),
    });

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

    // Extract mood from the last line if present
    let content = fullContent;
    let mood: string | null = null;
    const lines = fullContent.trim().split("\n");
    const lastLine = lines[lines.length - 1].trim().toLowerCase();
    if (lastLine.startsWith("mood:")) {
      mood = lastLine.replace("mood:", "").trim();
      content = lines.slice(0, -1).join("\n").trim();
    }

    // Validate conversation_id exists before using it as FK
    let validConversationId: string | null = null;
    if (conversation_id) {
      const { data: convCheck } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversation_id)
        .maybeSingle();
      validConversationId = convCheck ? conversation_id : null;
    }

    // Save the journal entry using service role (bypasses RLS)
    const { data: entry, error: insertError } = await supabase
      .from("journal_entries")
      .insert({
        user_id,
        content,
        mood,
        model_used: journalModel,
        trigger_type,
        source_conversation_id: validConversationId,
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

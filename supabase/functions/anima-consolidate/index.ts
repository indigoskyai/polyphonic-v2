import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

const CONSOLIDATION_PROMPT = `You are performing nightly memory consolidation. Review the day's experiences — journals, thoughts, conversations — and determine which deserve to become lasting memories.

Apply the Behavioral Change Test: "Would knowing this change how I interact or think in the future?" Only consolidate what passes.

Today's experiences:

=== Journal Entries ===
{journals}

=== Thoughts Generated ===
{thoughts}

=== Emotional Arc ===
{emotions}

For each memory worth keeping, use this exact format:

MEMORY: [the memory content — what happened and why it matters, 1-3 sentences]
TYPE: [one of: experience, insight, relationship, impression, fact]
EMOTIONAL_CONTEXT: [brief emotional note — how this felt]
SALIENCE: [0.0 to 1.0]
TAGS: [comma-separated lowercase tags]

Generate 0-5 memories. Zero is valid if nothing notable happened. Don't manufacture significance.`;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    let user_id: string;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      const body = await req.json();
      user_id = body.user_id;
      if (!user_id || !uuidRegex.test(user_id)) {
        return new Response(JSON.stringify({ error: "Valid user_id required" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } else {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      user_id = claimsData.claims.sub as string;
    }

    // Get API key
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Resolve model
    const { data: modelConfig } = await supabase
      .from("model_configs").select("model_id")
      .eq("feature_key", "anima_consolidate").eq("is_active", true).maybeSingle();
    const consolidateModel = modelConfig?.model_id || "anthropic/claude-opus-4.6";

    // Gather last 24h of data
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: journals },
      { data: thoughts },
      { data: emotionalHistory },
    ] = await Promise.all([
      supabase.from("journal_entries").select("content, mood, created_at")
        .eq("user_id", user_id).gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
      supabase.from("thought_stream").select("content, source, salience, created_at")
        .eq("user_id", user_id).gte("created_at", cutoff)
        .gt("salience", 0.4)
        .order("created_at", { ascending: true }),
      supabase.from("emotional_history").select("state, timestamp")
        .eq("user_id", user_id).gte("timestamp", cutoff)
        .order("timestamp", { ascending: true }).limit(10),
    ]);

    if ((!journals || journals.length === 0) && (!thoughts || thoughts.length === 0)) {
      return new Response(JSON.stringify({ memories_consolidated: 0, reason: "no activity today" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const journalsText = (journals || [])
      .map((j: any) => `[${j.created_at?.slice(11, 16)} — ${j.mood || "?"}] ${j.content.slice(0, 400)}`)
      .join("\n") || "(none)";

    const thoughtsText = (thoughts || [])
      .map((t: any) => `[${t.source}, sal=${t.salience}] ${t.content}`)
      .join("\n") || "(none)";

    const emotionsText = (emotionalHistory || [])
      .map((e: any) => {
        const state = e.state || {};
        return `[${e.timestamp?.slice(11, 16)}] ${Object.entries(state).map(([k, v]) => `${k}=${typeof v === "number" ? (v as number).toFixed(1) : v}`).join(", ")}`;
      })
      .join("\n") || "(no emotional history today)";

    const prompt = CONSOLIDATION_PROMPT
      .replace("{journals}", journalsText)
      .replace("{thoughts}", thoughtsText)
      .replace("{emotions}", emotionsText);

    // Call LLM
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: consolidateModel,
        messages: [
          { role: "system", content: "You are performing nightly memory consolidation. Be selective — only memories that pass the Behavioral Change Test deserve to persist." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "LLM call failed" }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Parse memories
    const newMemories: any[] = [];
    const blocks = raw.split(/(?=MEMORY:)/);
    for (const block of blocks) {
      if (!block.trim().startsWith("MEMORY:")) continue;
      const contentMatch = block.match(/MEMORY:\s*(.+?)(?=\nTYPE:|\Z)/s);
      const typeMatch = block.match(/TYPE:\s*(\S+)/);
      const emotionMatch = block.match(/EMOTIONAL_CONTEXT:\s*(.+?)(?=\nSALIENCE:|\Z)/s);
      const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
      const tagsMatch = block.match(/TAGS:\s*(.+)/);
      if (!contentMatch) continue;
      const content = contentMatch[1].trim();
      if (!content || content.length < 15) continue;

      const memoryType = typeMatch?.[1]?.toLowerCase() || "experience";
      const emotionalContext = emotionMatch?.[1]?.trim() || "";
      const salience = salMatch ? Math.max(0, Math.min(1, parseFloat(salMatch[1]))) : 0.5;
      const tags = tagsMatch ? tagsMatch[1].split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

      newMemories.push({
        user_id,
        content,
        memory_type: memoryType,
        confidence: salience,
        emotional_valence: emotionalContext ? 0.5 : 0.0, // Neutral default
        tags: [...tags, "consolidated"],
        sharpness: 1.0,
        decay_factor: 1.0,
        is_deleted: false,
      });
    }

    // Insert memories
    if (newMemories.length > 0) {
      await supabase.from("memories").insert(newMemories);

      // Also add consolidation thoughts
      await supabase.from("thought_stream").insert(
        newMemories.map((m) => ({
          user_id,
          content: `consolidated memory: ${m.content.slice(0, 150)}`,
          source: "consolidation",
          salience: m.confidence,
          tags: ["consolidation"],
          model_used: consolidateModel,
        }))
      );
    }

    // Log each consolidated memory to activity log
    for (const m of newMemories) {
      await logActivity(supabase, user_id, {
        type: "consolidation",
        title: "Memory consolidated",
        summary: m.content.slice(0, 150),
        content: { memory_type: m.memory_type, salience: m.confidence },
        source: "autonomous",
      });
    }

    // Log
    await supabase.from("daily_logs").insert({
      user_id,
      log_type: "nightly_consolidation",
      content: {
        memories_consolidated: newMemories.length,
        journals_reviewed: (journals || []).length,
        thoughts_reviewed: (thoughts || []).length,
        model: consolidateModel,
      },
    });

    return new Response(JSON.stringify({
      memories_consolidated: newMemories.length,
      journals_reviewed: (journals || []).length,
      thoughts_reviewed: (thoughts || []).length,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-consolidate error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

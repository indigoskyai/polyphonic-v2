import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";

const SYNTHESIS_PROMPT = `You are a Narrative Synthesis Agent. You analyze ALL extracted memories from a user's conversation history to create a deep, unified understanding of who this person is.

Your tasks:

1. **Narrative Threads** (3-8): Identify the major life narratives running through these memories. Each should have:
   - A clear label (e.g., "career transition from corporate to freelance")
   - A paragraph-length summary capturing the arc, evolution, and emotional weight
   - Related topics that connect to this thread

2. **Identity Profile**: Write a 2-3 paragraph synthesis of who this person is at their core. What drives them? What patterns define their thinking? How do they relate to the world? This should read like a deeply perceptive friend describing them.

3. **Synthesis Memories**: Create 5-15 high-level memories that capture overarching truths no single conversation would reveal. Examples:
   - "Tends to process major decisions by researching extensively before committing"
   - "Uses humor as a coping mechanism when discussing difficult family dynamics"
   - "Values autonomy deeply — most career and lifestyle choices optimize for independence"

4. **Cross-Connections**: Identify non-obvious links between different areas of their life (e.g., their interest in stoicism connects to how they handle work stress).

5. **Deduplication**: Review all memories and identify groups that are essentially saying the same thing. For each group, note which memory is the most complete/accurate version and which should be consolidated.

Each synthesis memory should be tagged with its narrative thread and have confidence 0.75-0.90 (these are pattern-derived, not direct quotes).`;

const synthesisTool = {
  type: "function",
  function: {
    name: "synthesize_memories",
    description: "Synthesize narrative threads, identity profile, and cross-connections from all memories",
    parameters: {
      type: "object",
      properties: {
        narrative_threads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short thread label" },
              summary: { type: "string", description: "Paragraph-length summary" },
              related_topics: { type: "array", items: { type: "string" } },
            },
            required: ["label", "summary"],
          },
        },
        identity_profile: {
          type: "string",
          description: "2-3 paragraph personality synthesis",
        },
        synthesis_memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "High-level synthesis memory" },
              memory_type: { type: "string", enum: ["fact", "preference", "principle", "context"] },
              narrative_thread: { type: "string" },
              confidence: { type: "number" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["content", "memory_type", "narrative_thread", "confidence"],
          },
        },
        cross_connections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from_topic: { type: "string" },
              to_topic: { type: "string" },
              insight: { type: "string" },
            },
            required: ["from_topic", "to_topic", "insight"],
          },
        },
        duplicate_groups: {
          type: "array",
          description: "Groups of memory contents that say essentially the same thing",
          items: {
            type: "object",
            properties: {
              keep: { type: "string", description: "The best/most complete version to keep" },
              duplicates: { type: "array", items: { type: "string" }, description: "Contents of memories that duplicate the kept one" },
            },
            required: ["keep", "duplicates"],
          },
        },
      },
      required: ["narrative_threads", "identity_profile", "synthesis_memories"],
    },
  },
};

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const user_id = claimsData.claims.sub as string;
    const body = await req.json();
    const { import_id } = body;
    let agent_id = normalizeAgentId(body.agent_id);
    if (import_id) {
      const { data: importRow, error: importErr } = await supabase
        .from("chat_imports")
        .select("id, agent_id")
        .eq("id", import_id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (importErr) {
        return new Response(JSON.stringify({ error: importErr.message }), {
          status: 500,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (!importRow) {
        return new Response(JSON.stringify({ error: "Import not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      agent_id = normalizeAgentId(body.agent_id || importRow.agent_id);
    }
    if (!isSubstrateAgentId(agent_id)) {
      return nonSubstrateResponse(agent_id, "memory-synthesize", getCorsHeaders(req));
    }

    // Use Lovable AI Gateway (no user key required)
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Update import stage
    if (import_id) {
      await supabase
        .from("chat_imports")
        .update({ pipeline_stage: "synthesizing" })
        .eq("id", import_id)
        .eq("user_id", user_id)
        .eq("agent_id", agent_id);
    }

    // Fetch all memories for this user/agent scope
    const { data: allMemories } = await supabase
      .from("memories")
      .select("id, content, memory_type, confidence, emotional_intensity, detail_level, narrative_thread, tags, created_at")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false)
      .order("confidence", { ascending: false })
      .limit(500);

    if (!allMemories || allMemories.length < 5) {
      return new Response(JSON.stringify({
        synthesis_memories_created: 0,
        reason: "insufficient memories for synthesis",
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Build memory dump for the model
    const memoryDump = allMemories
      .map((m: any) => {
        const tags = m.tags?.length ? ` [tags: ${m.tags.join(", ")}]` : "";
        const thread = m.narrative_thread ? ` [thread: ${m.narrative_thread}]` : "";
        return `[${m.memory_type}|${m.detail_level || "standard"}|confidence:${m.confidence}|intensity:${m.emotional_intensity || 0}]${thread}${tags} ${m.content}`;
      })
      .join("\n");

    const fullPrompt = `${SYNTHESIS_PROMPT}

ALL MEMORIES FOR THIS USER (${allMemories.length} total):
${memoryDump}`;

    // Background synthesis stays on a cheap model; user-facing chat owns the Opus budget.
    const synthesisModel = "google/gemini-2.5-flash";

    const aiResponse = await withModelRetry(() => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: synthesisModel,
        messages: [{ role: "user", content: fullPrompt }],
        tools: [synthesisTool],
        tool_choice: { type: "function", function: { name: "synthesize_memories" } },
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Synthesis AI call failed:", errText);
      return new Response(JSON.stringify({ error: "Synthesis AI call failed" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let synthesisResult: any = { narrative_threads: [], identity_profile: "", synthesis_memories: [] };

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        synthesisResult = JSON.parse(toolCall.function.arguments);
      } else {
        const content = aiData.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        synthesisResult = JSON.parse(cleaned);
      }
    } catch (parseErr) {
      console.error("Failed to parse synthesis:", parseErr);
      return new Response(JSON.stringify({ error: "parse error", synthesis_memories_created: 0 }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let synthesisMemoriesCreated = 0;

    // ── Remove old synthesis memories (replace with fresh ones) ──
    await supabase
      .from("memories")
      .update({ is_deleted: true })
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .contains("tags", ["synthesis"]);

    // ── Insert synthesis memories ──
    if (synthesisResult.synthesis_memories?.length > 0) {
      const synthRows = synthesisResult.synthesis_memories.map((m: any) => ({
        user_id,
        agent_id,
        content: m.content,
        memory_type: m.memory_type || "context",
        relevance_score: m.confidence ?? 0.8,
        confidence: m.confidence ?? 0.8,
        confidence_source: "model_inferred",
        emotional_intensity: 0.5,
        detail_level: "detailed",
        narrative_thread: m.narrative_thread || null,
        tags: [...(m.tags || []), "synthesis"],
        provenance: {
          source: "chatgpt_import",
          import_id: import_id || null,
          pipeline: "synthesis_v2",
          synthesized_at: new Date().toISOString(),
        },
      }));

      const { data: synthInserted, error: synthErr } = await supabase
        .from("memories")
        .insert(synthRows)
        .select("id");

      if (synthErr) {
        console.error("Synthesis memory insert error:", synthErr);
      } else {
        synthesisMemoriesCreated += synthInserted?.length || 0;
      }
    }

    // ── Insert identity profile as a special synthesis memory ──
    if (synthesisResult.identity_profile) {
      const { error: idErr } = await supabase.from("memories").insert({
        user_id,
        agent_id,
        content: synthesisResult.identity_profile,
        memory_type: "context",
        relevance_score: 0.95,
        confidence: 0.85,
        confidence_source: "model_inferred",
        emotional_intensity: 0.6,
        detail_level: "detailed",
        narrative_thread: "identity_profile",
        tags: ["synthesis", "identity", "profile"],
        provenance: {
          source: "chatgpt_import",
          import_id: import_id || null,
          pipeline: "synthesis_identity_v2",
          synthesized_at: new Date().toISOString(),
        },
      });

      if (!idErr) synthesisMemoriesCreated++;
    }

    // ── Insert narrative threads as memories ──
    if (synthesisResult.narrative_threads?.length > 0) {
      const threadRows = synthesisResult.narrative_threads.map((t: any) => ({
        user_id,
        agent_id,
        content: `NARRATIVE THREAD — ${t.label}: ${t.summary}`,
        memory_type: "context",
        relevance_score: 0.85,
        confidence: 0.8,
        confidence_source: "model_inferred",
        detail_level: "detailed",
        narrative_thread: t.label,
        tags: ["synthesis", "narrative_thread"],
        provenance: {
          source: "chatgpt_import",
          import_id: import_id || null,
          pipeline: "synthesis_threads_v2",
          synthesized_at: new Date().toISOString(),
        },
      }));

      const { data: threadInserted } = await supabase
        .from("memories")
        .insert(threadRows)
        .select("id");

      if (threadInserted) synthesisMemoriesCreated += threadInserted.length;
    }

    // ── Handle deduplication ──
    if (synthesisResult.duplicate_groups?.length > 0) {
      let deduped = 0;
      for (const group of synthesisResult.duplicate_groups) {
        if (!group.duplicates?.length) continue;
        for (const dupContent of group.duplicates) {
          // Soft-delete duplicates
          const { data: found } = await supabase
            .from("memories")
            .select("id")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("content", dupContent)
            .eq("is_deleted", false)
            .limit(1);

          if (found?.[0]) {
            await supabase
              .from("memories")
              .update({ is_deleted: true })
              .eq("id", found[0].id)
              .eq("user_id", user_id)
              .eq("agent_id", agent_id);
            deduped++;
          }
        }
      }
      console.log(`Deduplication: soft-deleted ${deduped} duplicate memories`);
    }

    return new Response(JSON.stringify({
      synthesis_memories_created: synthesisMemoriesCreated,
      narrative_threads: synthesisResult.narrative_threads?.length || 0,
      cross_connections: synthesisResult.cross_connections?.length || 0,
      duplicates_removed: synthesisResult.duplicate_groups?.reduce(
        (acc: number, g: any) => acc + (g.duplicates?.length || 0), 0
      ) || 0,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("memory-synthesize error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

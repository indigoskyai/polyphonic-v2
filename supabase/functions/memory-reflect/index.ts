import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { resolvePrimaryModel } from "../_shared/model-backend.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let openrouterKey: string | null = null;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let user_id: string;
    let bodyData: any = {};
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (authHeader === `Bearer ${serviceRoleKey}`) {
      // Internal service call - trust user_id from body
      bodyData = await req.json();
      user_id = bodyData.user_id;
      if (!user_id || typeof user_id !== "string" || !uuidRegex.test(user_id)) {
        return new Response(JSON.stringify({ error: 'Valid user_id required for service calls' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } else {
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
      bodyData = await req.json().catch(() => ({}));
    }

    const agent_id = normalizeAgentId(bodyData.agent_id);
    if (!isSubstrateAgentId(agent_id)) {
      return nonSubstrateResponse(agent_id, "memory-reflect", getCorsHeaders(req));
    }

    // Get user's API key
    const { data: decryptedKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    openrouterKey = typeof decryptedKey === "string" ? decryptedKey.trim() : null;

    // Create reflection job
    const { data: job } = await supabase
      .from("reflection_jobs")
      .insert({ user_id, job_type: "reflect", status: "processing", started_at: new Date().toISOString() })
      .select("id")
      .single();
    const jobId = job?.id;

    // Fetch all active memories
    const { data: memories, error: memError } = await supabase
      .from("memories")
      .select("id, content, memory_type, confidence, confidence_source, relevance_score, created_at, access_count, tags, emotional_valence, emotional_intensity, decay_factor, is_watchlist, sharpness")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(200);

    if (memError || !memories || memories.length < 5) {
      if (jobId) await supabase.from("reflection_jobs").update({ status: "completed", completed_at: new Date().toISOString(), error_message: "insufficient memories" }).eq("id", jobId);
      return new Response(JSON.stringify({ synthesized: 0, reason: "insufficient memories" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get model: user settings > admin config > default
    const [{ data: modelConfig }, { data: memUserSettings }] = await Promise.all([
      supabase.from("model_configs").select("model_id").eq("feature_key", "memory_reflect").eq("is_active", true).maybeSingle(),
      supabase.from("user_settings").select("memory_model").eq("user_id", user_id).maybeSingle(),
    ]);

    const reflectionModel = memUserSettings?.memory_model || modelConfig?.model_id || await resolvePrimaryModel(supabase, user_id);

    // Get admin-configured prompt
    const { data: promptConfig } = await supabase
      .from("system_prompts")
      .select("prompt")
      .eq("feature_key", "memory_reflect")
      .eq("is_active", true)
      .maybeSingle();

    const memoryText = memories.map((m: any) => {
      const age = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
      const emotion = `${m.emotional_intensity ?? 0}/${m.emotional_valence ?? 0}`;
      const tagsStr = m.tags?.length > 0 ? `[${m.tags.join(',')}]` : '[]';
      const watchFlag = m.is_watchlist ? ' 🔍' : '';
      return `[${m.id}] [${m.memory_type}] (conf: ${m.confidence}, access: ${m.access_count || 0}, age: ${age}d, emotion: ${emotion}, tags: ${tagsStr})${watchFlag} ${m.content}`;
    }).join("\n");

    const reflectionSystemPrompt = promptConfig?.prompt || `You are the memory reflection engine for an AI companion. Your job is to maintain a clean, useful, and evolving memory system.

THE BEHAVIORAL CHANGE TEST FOR CONSOLIDATION:
Before creating any synthesis, ask: "Would this synthesis change future interactions MORE than any individual memory it replaces?" If no, don't synthesize — the individual memories are more useful.

Good synthesis: 3 memories about career frustrations → "User is experiencing a pattern of feeling undervalued at work, particularly around credit for technical contributions. This has been building for ~2 months."
Bad synthesis: 3 memories about liking different foods → "User likes food" (loses all specificity).

Tasks:
1. CONSOLIDATE: Find groups of 3+ related memories that can be merged into a higher-level synthesis that passes the Behavioral Change Test. The synthesis must be MORE actionable than any individual memory.

2. DECAY: Apply decay based on these guidelines:
   - AGGRESSIVE DECAY (new_decay_factor 0.1-0.3): Old (>60d) + low access (0-1) + low confidence (<0.6) + no emotional significance
   - MODERATE DECAY (0.4-0.6): Moderate age (30-60d) + low access + model-inferred confidence
   - RESIST DECAY: High emotional intensity (>0.7), user-verified memories, watchlist items (🔍), or memories with high access counts
   - NEVER decay: Facts with user_explicit confidence source, active commitments, or principles

3. CONNECTIONS: Create connections ONLY when there is a clear causal, thematic, or temporal link. "Both are about work" is NOT a valid connection. Valid connections:
   - "User's job stress" → "User's insomnia" (causal: stress causes sleep issues)
   - "User started therapy in March" → "User reports feeling better in April" (temporal progression)
   - "User values independence" contradicts "User feels guilty saying no" (genuine tension)

4. CONFIDENCE RE-SCORING:
   - Pattern confirmation: If 3+ memories support the same conclusion, increase confidence of each (cap at 0.95)
   - Single-mention inferences with model_inferred source: decrease confidence by 0.1 if >30 days old with 0 access
   - User-verified memories: never decrease below 0.85

5. SOFT-DELETE vs DECAY:
   - SOFT-DELETE: Memory is fully superseded by a synthesis, OR is clearly wrong/outdated (e.g., "User works at X" when a newer memory says "User left X")
   - DECAY ONLY: Memory is old but might still be relevant, or is partially covered by a synthesis but contains unique details

Rules:
- Never lose unique information — if a memory has details not captured in the synthesis, don't soft-delete it
- Prioritize user_explicit confidence over model_inferred
- Flag contradictions rather than silently resolving them
- Watchlist items (🔍) need special attention — they were below confidence threshold but emotionally significant`;

    const aiResponse = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: reflectionModel,
        messages: [
          { role: "system", content: reflectionSystemPrompt },
          { role: "user", content: `CURRENT MEMORIES:\n${memoryText}` },
        ],
        temperature: 0.2,
        tools: [
          {
            type: "function",
            function: {
              name: "reflect_memories",
              description: "Consolidate, decay, and connect memories",
              parameters: {
                type: "object",
                properties: {
                  syntheses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        content: { type: "string" },
                        memory_type: { type: "string", enum: ["synthesis"] },
                        confidence: { type: "number" },
                        supersedes_ids: { type: "array", items: { type: "string" }, description: "IDs of memories this synthesis replaces" },
                        tags: { type: "array", items: { type: "string" } },
                      },
                      required: ["content", "confidence", "supersedes_ids"],
                    },
                  },
                  decay_updates: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        memory_id: { type: "string" },
                        new_decay_factor: { type: "number", description: "0.0 to 1.0, lower means more decayed" },
                        new_relevance: { type: "number" },
                      },
                      required: ["memory_id", "new_decay_factor", "new_relevance"],
                    },
                  },
                  connections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source_id: { type: "string" },
                        target_id: { type: "string" },
                        relation_type: { type: "string", enum: ["supports", "contradicts", "elaborates", "causes", "temporal"] },
                        strength: { type: "number" },
                      },
                      required: ["source_id", "target_id", "relation_type", "strength"],
                    },
                  },
                  soft_delete_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "IDs of memories to soft-delete (redundant, expired, or fully superseded)",
                  },
                },
                required: ["syntheses", "decay_updates", "connections", "soft_delete_ids"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "reflect_memories" } },
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI reflection error:", errText);
      if (jobId) await supabase.from("reflection_jobs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: errText.slice(0, 500) }).eq("id", jobId);
      return new Response(JSON.stringify({ error: "AI reflection failed" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let result: any = { syntheses: [], decay_updates: [], connections: [], soft_delete_ids: [] };

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      } else {
        const content = aiData.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        result = JSON.parse(cleaned);
      }
    } catch {
      console.error("Failed to parse reflection");
      if (jobId) await supabase.from("reflection_jobs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: "parse error" }).eq("id", jobId);
      return new Response(JSON.stringify({ synthesized: 0, reason: "parse error" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let memoriesCreated = 0;
    let memoriesUpdated = 0;
    let connectionsCreated = 0;
    const visibleMemoryIds = new Set((memories || []).map((memory: any) => memory.id));

    // Insert syntheses with supersession chain
    if (result.syntheses?.length > 0) {
      for (const s of result.syntheses) {
        const { data: newMem } = await supabase
          .from("memories")
          .insert({
            user_id,
            agent_id,
            content: s.content,
            memory_type: "synthesis",
            confidence: s.confidence ?? 0.8,
            confidence_source: "model_inferred",
            relevance_score: s.confidence ?? 0.8,
            tags: s.tags || [],
            provenance: { source: "reflection", synthesized_from: s.supersedes_ids, reflected_at: new Date().toISOString() },
          })
          .select("id")
          .single();

        const scopedSupersedesIds = (s.supersedes_ids || []).filter((id: string) => visibleMemoryIds.has(id));
        if (newMem && scopedSupersedesIds.length > 0) {
          // Mark superseded memories
          for (const oldId of scopedSupersedesIds) {
            await supabase
              .from("memories")
              .update({ superseded_by: newMem.id })
              .eq("id", oldId)
              .eq("user_id", user_id)
              .eq("agent_id", agent_id);
          }
          // Set supersedes on the new synthesis (first one)
          await supabase
            .from("memories")
            .update({ supersedes: scopedSupersedesIds[0] })
            .eq("id", newMem.id)
            .eq("user_id", user_id)
            .eq("agent_id", agent_id);

          memoriesUpdated += scopedSupersedesIds.length;
        }
        memoriesCreated++;
      }
    }

    // Apply decay updates + LLM softening at sharpness thresholds
    if (result.decay_updates?.length > 0) {
      for (const d of result.decay_updates) {
        // Calculate new sharpness from decay factor
        const newSharpness = d.new_decay_factor; // Use decay as proxy for sharpness
        const currentMem = memories?.find((m: any) => m.id === d.memory_id);
        const currentSharpness = currentMem?.sharpness ?? 1.0;

        const update: any = {
          decay_factor: d.new_decay_factor,
          relevance_score: d.new_relevance,
          sharpness: newSharpness,
        };

        // LLM softening at sharpness thresholds: vivid(1.0) → softened(0.7) → impression(0.4) → archived(0.15)
        const crossedSoftenThreshold = currentSharpness > 0.7 && newSharpness <= 0.7;
        const crossedImpressionThreshold = currentSharpness > 0.4 && newSharpness <= 0.4;
        const crossedArchiveThreshold = currentSharpness > 0.15 && newSharpness <= 0.15;

        if ((crossedSoftenThreshold || crossedImpressionThreshold) && currentMem?.content) {
          // LLM softening: rewrite memory at lower resolution
          try {
            const softenPrompt = crossedImpressionThreshold
              ? `Reduce this memory to its emotional essence. One or two phrases maximum. What feeling remains when all detail is gone?\n\nThis is not a summary. It's an impression — like catching a scent that reminds you of something you can't quite place.\n\nMemory:\n${currentMem.content}\n\nWrite ONLY the impression. One or two phrases. Nothing else.`
              : `You are a memory softener. Given a sharp memory, rewrite it at lower resolution.\n\nKeep the emotional tone and core meaning. Remove specific timestamps, exact quotes, and precise details. Replace them with impressions and feelings. The result should feel like a memory that's naturally fading.\n\nCurrent sharpness: ${currentSharpness.toFixed(2)}\nTarget sharpness: ${newSharpness.toFixed(2)}\n\nMemory:\n${currentMem.content}\n\nWrite ONLY the softened version. Nothing else.`;

            const softenResponse = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openrouterKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: reflectionModel,
                messages: [{ role: "user", content: softenPrompt }],
                temperature: 0.3,
                max_tokens: 300,
              }),
              signal: AbortSignal.timeout(60000),
            }));

            if (softenResponse.ok) {
              const softenData = await softenResponse.json();
              const softened = softenData.choices?.[0]?.message?.content?.trim();
              if (softened && softened.length > 10) {
                update.content = softened;
                console.log(`[memory-reflect] Softened memory ${d.memory_id} at sharpness ${newSharpness.toFixed(2)}`);
              }
            }
          } catch (softenErr) {
            console.error("LLM softening error (non-blocking):", softenErr);
          }
        }

        if (crossedArchiveThreshold) {
          // Mark for soft-delete at archive threshold
          update.is_deleted = true;
          update.deleted_at = new Date().toISOString();
        }

        await supabase
          .from("memories")
          .update(update)
          .eq("id", d.memory_id)
          .eq("user_id", user_id)
          .eq("agent_id", agent_id);
        memoriesUpdated++;
      }
    }

    // Create connections
    if (result.connections?.length > 0) {
      const connRows = result.connections
        .filter((c: any) => visibleMemoryIds.has(c.source_id) && visibleMemoryIds.has(c.target_id))
        .map((c: any) => ({
          source_memory_id: c.source_id,
          target_memory_id: c.target_id,
          relation_type: c.relation_type,
          strength: c.strength ?? 0.5,
          user_id,
        }));

      if (connRows.length > 0) {
        const { error: connError } = await supabase
          .from("memory_connections")
          .upsert(connRows, { onConflict: "source_memory_id,target_memory_id,relation_type" });
        if (!connError) connectionsCreated = connRows.length;
      }
    }

    // Soft-delete redundant memories
    if (result.soft_delete_ids?.length > 0) {
      for (const id of result.soft_delete_ids.filter((id: string) => visibleMemoryIds.has(id))) {
        await supabase
          .from("memories")
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user_id)
          .eq("agent_id", agent_id);
      }
    }

    // Update job
    if (jobId) {
      await supabase.from("reflection_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        memories_created: memoriesCreated,
        memories_updated: memoriesUpdated,
        connections_created: connectionsCreated,
      }).eq("id", jobId);
    }

    return new Response(JSON.stringify({
      synthesized: memoriesCreated,
      updated: memoriesUpdated,
      connections: connectionsCreated,
      soft_deleted: result.soft_delete_ids?.length || 0,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("memory-reflect error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again later." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

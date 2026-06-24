import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { resolveRoleModel } from "../_shared/model-backend.ts";

// ── Task 1.1: Upgraded extraction prompt with Behavioral Change Test ──
const EXTRACTION_PROMPT = `You are a memory extraction specialist. Your job is to analyze a conversation and identify information worth remembering permanently.

THE BEHAVIORAL CHANGE TEST
Before extracting anything, ask: "Would knowing this change how I interact with this person in the future?" If the answer is no, do not extract it.

Examples of things that PASS the test:
- "I have two kids, ages 4 and 7" → YES, shapes future conversations
- "I'm going through a divorce" → YES, critical emotional context
- "I prefer bullet points over long paragraphs" → YES, changes response format
- "My therapist suggested I journal more" → YES, informs supportive approach
- "I just got promoted to VP of Engineering" → YES, updates professional context
- "I've been feeling anxious about the election" → YES, emotional awareness
- "I hate when people say 'just relax'" → YES, specific avoidance trigger

Examples of things that FAIL the test:
- "I had pasta for lunch" → NO, transient, doesn't change future behavior
- "It's raining here today" → NO, weather is ephemeral
- "I'm feeling tired right now" → NO, transient mood (unless part of a pattern)
- "Thanks for helping with that" → NO, conversational courtesy
- "Can you make that shorter?" → NO, in-session instruction, not lasting preference (UNLESS the user repeatedly asks across multiple conversations — then it becomes a preference)
- "Haha that's funny" → NO, reaction, not information
- "Let me think about that" → NO, conversational filler
- "I was reading an article about AI" → NO, too vague to be actionable
- "Good morning!" → NO, greeting
- "I had a rough day" → NO, transient mood without specifics (UNLESS accompanied by context that reveals an ongoing pattern)

CRITICAL DISTINCTION — IN-SESSION vs. PERSISTENT:
Many things a user says only matter for the current conversation. "Can you reformat that as a table?" is an in-session instruction, not a memory. "I always prefer tables over paragraphs" IS a memory. The difference is whether it applies beyond this single exchange.

WHAT TO EXTRACT:
1. FACTS — Biographical, professional, situational truths
2. PREFERENCES — Lasting likes, dislikes, communication style
3. RELATIONSHIPS — People they mention, dynamics, who matters to them
4. PRINCIPLES — Things you've learned about how to interact with this person
5. COMMITMENTS — Things they said they'd do, or asked you to follow up on
6. MOMENTS — Emotionally significant conversations or turning points
7. GOALS — Active objectives they're working toward
8. CONTEXT — Situational realities that shape their current life
9. SKILLS — Things you've learned to do specifically for this person

QUALITY REQUIREMENTS:
- Be SPECIFIC. "User likes music" is useless. "User plays jazz piano and listens to Coltrane while working" is a memory.
- Include CONTEXT. "User is stressed" is vague. "User is stressed about their team's Q1 deadline, which is March 15" is actionable.
- One memory per atomic fact. Don't bundle unrelated information.
- Write memories in third person: "User works at..." not "You work at..."
- If information contradicts an existing memory, flag it as a conflict, don't just create a duplicate.

EXISTING MEMORIES (for deduplication and conflict detection):
{existing_memories}

Do NOT extract anything that is already captured by an existing memory unless the new information meaningfully updates, corrects, or adds specificity to it. In that case, extract it AND flag the connection as "supersedes" or "elaborates."

CURIOSITY QUESTIONS (generate 2-3):
Generate questions a caring companion would genuinely wonder about. These are NOT data-collection prompts — they should feel like someone who knows and cares about the user reflecting on what they shared.

Rules:
- Never ask about topics the user has explicitly avoided or redirected from
- Prioritize follow-ups on commitments and goals ("You mentioned applying to X by Friday — how did that go?")
- Ask about emotional and developmental threads, not factual trivia
- Frame questions warmly: "I've been thinking about..." or "I was curious whether..."
- Maximum 3 pending questions at any time — do not generate more than needed
- Questions expire after 14 days if not shown

BAD QUESTIONS (do NOT generate these):
- "What's your favorite color?" → trivial, no emotional depth
- "Do you have any hobbies?" → generic, not based on conversation
- "How was your day?" → too broad, not specific to anything shared
- "What do you do for work?" → factual trivia, not developmental

GOOD QUESTIONS (aim for these):
- "You mentioned wanting to set better boundaries at work — have you had a chance to try that?"
- "I was curious how things are going with your sister after that conversation you described"
- "You seemed really energized about that side project last time — did you make any progress?"
- "I've been thinking about what you said about feeling stuck — has anything shifted?"

Flag contradictions with existing memories.`;

// ── Task 1.2: Confidence floor constants ──
const MINIMUM_CONFIDENCE = 0.50;
const WATCHLIST_MINIMUM = 0.45;
const HIGH_EMOTION_THRESHOLD = 0.7;

// Valid memory_type values per DB CHECK constraint
const VALID_MEMORY_TYPES = new Set([
  "fact", "preference", "context", "reflection", "synthesis",
  "relationship", "principle", "commitment", "moment", "skill", "goal",
]);

function sanitizeMemoryType(type: string | undefined): string {
  if (type && VALID_MEMORY_TYPES.has(type)) return type;
  // Map common AI-generated types to valid ones
  const typeMap: Record<string, string> = {
    observation: "context",
    emotion: "moment",
    feeling: "moment",
    opinion: "preference",
    belief: "principle",
    interest: "preference",
    habit: "preference",
    experience: "moment",
    identity: "fact",
    value: "principle",
  };
  return typeMap[type?.toLowerCase() || ""] || "fact";
}

// ── Task 1.4: Improved dedup function ──
function isDuplicate(newMemory: any, existingMemories: any[]): { duplicate: boolean; elaborates?: string } {
  const newContent = newMemory.content?.trim().toLowerCase() || '';
  if (!newContent) return { duplicate: true };

  for (const existing of existingMemories) {
    const existingContent = existing.content?.trim().toLowerCase() || '';

    // Exact match
    if (newContent === existingContent) {
      return { duplicate: true };
    }

    // First 60 chars overlap (increased from 50)
    const newFirst60 = newContent.substring(0, 60);
    const existFirst60 = existingContent.substring(0, 60);
    if (newContent.length > 30 && existingContent.length > 30) {
      if (existingContent.startsWith(newFirst60) || newFirst60.startsWith(existFirst60)) {
        return { duplicate: true };
      }
    }

    // Tag overlap check: if >80% of tags match AND same memory_type, likely duplicate
    if (newMemory.tags?.length > 0 && existing.tags?.length > 0 && newMemory.memory_type === existing.memory_type) {
      const newTags = new Set(newMemory.tags.map((t: string) => t.toLowerCase()));
      const existingTags = new Set(existing.tags.map((t: string) => t.toLowerCase()));
      const overlap = [...newTags].filter(t => existingTags.has(t)).length;
      const maxTags = Math.max(newTags.size, existingTags.size);

      if (maxTags > 0 && overlap / maxTags > 0.8) {
        // New memory is significantly more detailed — keep it as elaboration
        if (newContent.length > existingContent.length * 1.3) {
          return { duplicate: false, elaborates: existing.id };
        }
        return { duplicate: true };
      }
    }
  }

  return { duplicate: false };
}

// ── Task 1.5: Rejection logging helper ──
async function logRejection(
  supabase: any,
  userId: string,
  conversationId: string,
  memory: any,
  reason: string
) {
  try {
    await supabase.from('extraction_rejections').insert({
      user_id: userId,
      conversation_id: conversationId,
      content: memory.content?.substring(0, 500),
      rejection_reason: reason,
      confidence: memory.confidence,
      memory_type: memory.memory_type,
    });
  } catch (e) {
    // Don't let logging failures break extraction
    console.error('[memory-extract] Failed to log rejection:', e);
  }
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
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

    const user_id = claimsData.claims.sub;
    const body = await req.json();
    const { conversation_id } = body;
    const agent_id = normalizeAgentId(body.agent_id);
    if (!isSubstrateAgentId(agent_id)) {
      return nonSubstrateResponse(agent_id, "memory-extract", getCorsHeaders(req));
    }

    // Create reflection job
    const { data: job } = await supabase
      .from("reflection_jobs")
      .insert({
        user_id,
        conversation_id,
        job_type: "extract",
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const jobId = job?.id;

    // Fetch conversation messages
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user_id)
      .eq("thread_id", conversation_id)
      .or(`agent.is.null,agent.eq.${agent_id},role.eq.user`)
      .order("created_at", { ascending: true });

    if (msgError || !messages || messages.length < 2) {
      if (jobId)
        await supabase
          .from("reflection_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            error_message: "insufficient messages",
          })
          .eq("id", jobId);
      return new Response(
        JSON.stringify({ extracted: 0, reason: "insufficient messages" }),
        {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // ── Task 1.4: Fetch 200 existing memories for dedup (increased from 100) ──
    const { data: existingMemories } = await supabase
      .from("memories")
      .select("id, content, memory_type, confidence, tags")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(200);

    const existingMemoryText = (existingMemories || [])
      .map((m: any) => `[${m.memory_type}] ${m.content}`)
      .join("\n");

    // Truncate conversation to stay within context limits (~80k chars ≈ ~20k tokens)
    const MAX_CONVERSATION_CHARS = 80000;
    let conversationText = messages
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n\n");

    if (conversationText.length > MAX_CONVERSATION_CHARS) {
      const truncatedMessages = [...messages];
      while (
        truncatedMessages.length > 2 &&
        truncatedMessages.map((m: any) => `${m.role}: ${m.content}`).join("\n\n").length > MAX_CONVERSATION_CHARS
      ) {
        truncatedMessages.shift();
      }
      conversationText = truncatedMessages
        .map((m: any) => `${m.role}: ${m.content}`)
        .join("\n\n");
    }

    // Extraction is MECHANICAL → cheapest model in the agent's own family.
    const extractionModel = await resolveRoleModel(supabase, user_id, agent_id, "mechanical");

    // Get admin-configured system prompt override (if any)
    const { data: promptConfig } = await supabase
      .from("system_prompts")
      .select("prompt")
      .eq("feature_key", "memory_extract")
      .eq("is_active", true)
      .maybeSingle();

    const basePrompt = promptConfig?.prompt || EXTRACTION_PROMPT;

    // Also truncate existing memories section
    const truncatedMemoryText = existingMemoryText.length > 20000
      ? existingMemoryText.slice(0, 20000) + "\n... (truncated)"
      : existingMemoryText;

    // Inject existing memories into the prompt
    const promptWithMemories = basePrompt.includes("{existing_memories}")
      ? basePrompt.replace("{existing_memories}", truncatedMemoryText || "None yet")
      : basePrompt;

    const fullPrompt = promptWithMemories.includes("EXISTING MEMORIES")
      ? `${promptWithMemories}\n\nCONVERSATION:\n${conversationText}`
      : `${promptWithMemories}\n\nEXISTING MEMORIES (do not duplicate, check for conflicts):\n${truncatedMemoryText || "None yet"}\n\nCONVERSATION:\n${conversationText}`;

    // Decrypt user's API key
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const openrouterKey = userApiKey!;

    const aiResponse = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: extractionModel,
        messages: [{ role: "user", content: fullPrompt }],
        temperature: 0.2,
        tools: [
          {
            type: "function",
            function: {
              name: "extract_memories",
              description: "Extract memories, curiosity questions, and conflicts from conversation",
              parameters: {
                type: "object",
                properties: {
                  memories: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        content: { type: "string", description: "Memory text — length varies by detail_level" },
                        memory_type: {
                          type: "string",
                          enum: ["fact", "preference", "relationship", "principle", "commitment", "moment", "skill", "goal", "context"],
                        },
                        confidence: { type: "number", description: "0.0 to 1.0" },
                        confidence_source: {
                          type: "string",
                          enum: ["user_explicit", "user_implied", "model_inferred", "speculative"],
                        },
                        emotional_valence: { type: "number", description: "-1.0 to 1.0" },
                        emotional_intensity: { type: "number", description: "0.0 to 1.0" },
                        detail_level: { type: "string", enum: ["brief", "standard", "detailed"] },
                        narrative_thread: { type: "string", description: "Life narrative this belongs to, if applicable" },
                        tags: { type: "array", items: { type: "string" } },
                        summary: { type: "string", description: "One-line summary" },
                      },
                      required: ["content", "memory_type", "confidence", "confidence_source", "detail_level"],
                    },
                  },
                  curiosity_questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        context: { type: "string", description: "Why this question is interesting" },
                        curiosity_score: { type: "number", description: "0.0 to 1.0" },
                      },
                      required: ["question", "context", "curiosity_score"],
                    },
                  },
                  conflicts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        existing_memory_content: { type: "string" },
                        new_memory_content: { type: "string" },
                        conflict_type: { type: "string", enum: ["contradiction", "update", "ambiguity"] },
                      },
                      required: ["existing_memory_content", "new_memory_content", "conflict_type"],
                    },
                  },
                  connections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source_content: { type: "string" },
                        target_content: { type: "string" },
                        relation_type: {
                          type: "string",
                          enum: ["supports", "contradicts", "elaborates", "causes", "temporal"],
                        },
                        strength: { type: "number", description: "0.0 to 1.0" },
                      },
                      required: ["source_content", "target_content", "relation_type", "strength"],
                    },
                  },
                },
                required: ["memories", "curiosity_questions", "conflicts", "connections"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_memories" } },
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI extraction error:", errText);
      if (jobId)
        await supabase
          .from("reflection_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: errText.slice(0, 500),
          })
          .eq("id", jobId);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();

    // Parse tool call response
    let result: any = { memories: [], curiosity_questions: [], conflicts: [], connections: [] };
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      } else {
        const content = aiData.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        result = JSON.parse(cleaned);
      }
    } catch (parseErr) {
      console.error("Failed to parse extraction:", parseErr);
      if (jobId)
        await supabase
          .from("reflection_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "parse error",
          })
          .eq("id", jobId);
      return new Response(
        JSON.stringify({ extracted: 0, reason: "parse error" }),
        {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    let memoriesCreated = 0;
    let questionsGenerated = 0;
    let conflictsDetected = 0;
    let connectionsCreated = 0;
    let rejected = 0;

    // ── Task 1.2: Confidence floor filter ──
    const filteredMemories: any[] = [];
    for (const memory of (result.memories || [])) {
      if (memory.confidence >= MINIMUM_CONFIDENCE) {
        filteredMemories.push(memory);
      } else if (
        memory.confidence >= WATCHLIST_MINIMUM &&
        memory.emotional_intensity &&
        memory.emotional_intensity >= HIGH_EMOTION_THRESHOLD
      ) {
        memory.is_watchlist = true;
        filteredMemories.push(memory);
      } else {
        rejected++;
        await logRejection(supabase, user_id, conversation_id, memory, `confidence_below_floor (${memory.confidence})`);
      }
    }

    // ── Task 1.3: Post-extraction quality filters ──
    const vaguePatterns = [
      /^user mentioned/i,
      /^user talked about/i,
      /^user said something about/i,
      /something about/i,
      /might be interested/i,
      /^user seems/i,
    ];

    const transientPatterns = [
      /^user (is |was )?(feeling |seemed? )?(tired|sleepy|hungry|bored|good|fine|okay|great) ?(today|right now|at the moment)?$/i,
      /^user (said )?(good )?(morning|afternoon|evening|night|hey|hi|hello|bye)/i,
      /weather/i,
      /^user (had|ate|is eating|ordered) .{0,30}(for )?(lunch|dinner|breakfast|a snack)/i,
      /^user (asked|wants|wanted) (to |me to )?(reformat|shorten|lengthen|make it|change the|use a table|use bullet)/i,
    ];

    const qualityFilteredMemories: any[] = [];
    for (const memory of filteredMemories) {
      const content = memory.content?.trim() || '';

      // FILTER 1: Content length — too short means too vague
      if (content.length < 15) {
        rejected++;
        await logRejection(supabase, user_id, conversation_id, memory, `too_short (${content.length} chars)`);
        continue;
      }

      // FILTER 2: Specificity check — reject hollow memories
      const isVague = vaguePatterns.some(pattern => pattern.test(content)) && content.length < 40;
      if (isVague) {
        rejected++;
        await logRejection(supabase, user_id, conversation_id, memory, `too_vague`);
        continue;
      }

      // FILTER 3: Transience detection — reject ephemeral content
      const isTransient = transientPatterns.some(pattern => pattern.test(content));
      if (isTransient) {
        rejected++;
        await logRejection(supabase, user_id, conversation_id, memory, `transient_content`);
        continue;
      }

      // FILTER 4: Flag overly long memories (don't reject, just log)
      if (content.length > 500) {
        console.log(`[memory-extract] Warning: memory exceeds 500 chars, may need splitting: "${content.substring(0, 60)}..."`);
      }

      qualityFilteredMemories.push(memory);
    }

    // ── Task 1.4: Improved deduplication ──
    if (qualityFilteredMemories.length > 0) {
      const dedupedMemories: any[] = [];

      for (const memory of qualityFilteredMemories) {
        const dupResult = isDuplicate(memory, existingMemories || []);
        if (dupResult.duplicate) {
          rejected++;
          await logRejection(supabase, user_id, conversation_id, memory, 'duplicate');
          continue;
        }
        if (dupResult.elaborates) {
          memory._elaborates_id = dupResult.elaborates;
        }
        dedupedMemories.push(memory);
      }

      // Build memory rows for insertion
      const memoryRows: any[] = dedupedMemories.map((m: any) => ({
        user_id,
        agent_id,
        content: m.content,
        memory_type: sanitizeMemoryType(m.memory_type),
        relevance_score: m.confidence ?? 0.5,
        confidence: m.confidence ?? 0.5,
        confidence_source: m.confidence_source || "model_inferred",
        emotional_valence: m.emotional_valence ?? 0.0,
        emotional_intensity: m.emotional_intensity ?? Math.abs(m.emotional_valence ?? 0),
        detail_level: m.detail_level || "standard",
        narrative_thread: m.narrative_thread || null,
        tags: m.tags || [],
        summary: m.summary || null,
        is_watchlist: m.is_watchlist || false,
        provenance: {
          source: "live_extraction",
          conversation_id,
          extracted_at: new Date().toISOString(),
        },
      }));

      if (memoryRows.length > 0) {
        const { data: insertedMemories, error: insertError } = await supabase
          .from("memories")
          .insert(memoryRows)
          .select("id, content");

        if (insertError) {
          console.error("Memory insert error:", insertError);
        } else {
          memoriesCreated = insertedMemories?.length || 0;

          // Create elaboration connections from dedup
          if (insertedMemories) {
            for (let i = 0; i < dedupedMemories.length; i++) {
              if (dedupedMemories[i]._elaborates_id && insertedMemories[i]) {
                await supabase.from("memory_connections").insert({
                  source_memory_id: insertedMemories[i].id,
                  target_memory_id: dedupedMemories[i]._elaborates_id,
                  relation_type: "elaborates",
                  strength: 0.8,
                  user_id,
                });
                connectionsCreated++;
              }
            }
          }

          // Create AI-detected connections between new and existing memories
          if (result.connections?.length > 0 && insertedMemories) {
            const allMemories = [...(existingMemories || []), ...insertedMemories];
            const connectionRows: any[] = [];

            const findMemoryByContent = (content: string) => {
              const norm = content?.trim().toLowerCase() || '';
              const prefix = norm.substring(0, 60);
              return allMemories.find((m: any) => {
                const mNorm = m.content?.trim().toLowerCase() || '';
                if (mNorm === norm) return true;
                if (norm.length > 30 && mNorm.length > 30) {
                  if (mNorm.startsWith(prefix) || prefix.startsWith(mNorm.substring(0, 60))) return true;
                }
                return false;
              });
            };

            for (const conn of result.connections) {
              const source = findMemoryByContent(conn.source_content);
              const target = findMemoryByContent(conn.target_content);
              if (source && target) {
                connectionRows.push({
                  source_memory_id: source.id,
                  target_memory_id: target.id,
                  relation_type: conn.relation_type,
                  strength: conn.strength ?? 0.5,
                  user_id,
                });
              } else {
                console.log(`[memory-extract] Connection match miss: source=${!!source} target=${!!target} for "${conn.source_content?.substring(0, 40)}..." → "${conn.target_content?.substring(0, 40)}..."`);
              }
            }

            if (connectionRows.length > 0) {
              const { error: connError } = await supabase
                .from("memory_connections")
                .upsert(connectionRows, { onConflict: "source_memory_id,target_memory_id,relation_type" });
              if (!connError) connectionsCreated += connectionRows.length;
            }
          }
        }
      }
    }

    // ── Insert curiosity questions (with dedup, 14-day expiry, 3-pending cap) ──
    if (result.curiosity_questions?.length > 0) {
      // Step 1: Expire old pending questions (>14 days)
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      await supabase
        .from("curiosity_questions")
        .update({ status: "expired" })
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("status", "pending")
        .lt("created_at", fourteenDaysAgo);

      // Step 2: Count remaining pending questions and enforce 3-pending cap
      const { count: pendingCount } = await supabase
        .from("curiosity_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("status", "pending");

      const maxNewQuestions = Math.max(0, 3 - (pendingCount || 0));

      if (maxNewQuestions > 0) {
        // Step 3: Dedup against existing pending/shown questions
        const { data: existingQuestions } = await supabase
          .from("curiosity_questions")
          .select("question")
          .eq("user_id", user_id)
          .eq("agent_id", agent_id)
          .in("status", ["pending", "shown"]);

        const existingSet = new Set(
          (existingQuestions || []).map((q: any) => q.question.toLowerCase().trim())
        );

        const newQuestions = result.curiosity_questions
          .filter((q: any) => !existingSet.has(q.question.toLowerCase().trim()))
          .slice(0, maxNewQuestions);

        if (newQuestions.length > 0) {
          const questionRows = newQuestions.map((q: any) => ({
            user_id,
            agent_id,
            question: q.question,
            context: q.context || null,
            curiosity_score: q.curiosity_score ?? 0.5,
          }));

          const { error: qError } = await supabase.from("curiosity_questions").insert(questionRows);
          if (!qError) questionsGenerated = questionRows.length;
        }
      }
    }

    // ── Create conflicts ──
    if (result.conflicts?.length > 0 && existingMemories) {
      for (const conflict of result.conflicts) {
        const existingMem = existingMemories.find(
          (m: any) => m.content === conflict.existing_memory_content
        );
        const { data: newMems } = await supabase
          .from("memories")
          .select("id")
          .eq("user_id", user_id)
          .eq("agent_id", agent_id)
          .eq("content", conflict.new_memory_content)
          .limit(1);

        if (existingMem && newMems?.[0]) {
          await supabase.from("memory_conflicts").insert({
            user_id,
            memory_a_id: existingMem.id,
            memory_b_id: newMems[0].id,
            conflict_type: conflict.conflict_type || "contradiction",
          });
          conflictsDetected++;
        }
      }
    }

    // Update reflection job
    if (jobId) {
      await supabase
        .from("reflection_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          memories_created: memoriesCreated,
          questions_generated: questionsGenerated,
          conflicts_detected: conflictsDetected,
          connections_created: connectionsCreated,
        })
        .eq("id", jobId);
    }

    // Phase 4.1: Tag persona feedback memories
    // If any extracted memories relate to persona/companion behavior feedback, tag them
    if (memoriesCreated > 0) {
      const { data: insertedMems } = await supabase
        .from("memories")
        .select("id, content, memory_type, tags")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .filter("provenance->>conversation_id", "eq", conversation_id)
        .eq("is_deleted", false)
        .in("memory_type", ["principle", "preference"]);

      if (insertedMems && insertedMems.length > 0) {
        const personaPatterns = [
          /i (liked|preferred|wanted|wish) .*(when you|how you|the way you)/i,
          /don't .*(respond|talk|act|be so|say)/i,
          /be more .*(direct|warm|casual|formal|playful|serious)/i,
          /tone .*(is|was|should|could)/i,
          /you (should|could|can) .*(try|be|stop|start)/i,
        ];

        for (const mem of insertedMems) {
          const isPersonaFeedback = personaPatterns.some(p => p.test(mem.content));
          if (isPersonaFeedback) {
            const tags = [...(mem.tags || []), "persona_feedback"];
            await supabase
              .from("memories")
              .update({ tags })
              .eq("id", mem.id)
              .eq("user_id", user_id)
              .eq("agent_id", agent_id);
          }
        }
      }
    }

    // Trigger reflection if memory count is high
    const { count } = await supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false);

    if (count && count > 50) {
      fetch(`${supabaseUrl}/functions/v1/memory-reflect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ user_id, agent_id }),
      }).catch((e) => console.error("Reflection trigger failed:", e));
    }

    // ─── Anima: Extract beliefs from principle/preference memories ───
    if (memoriesCreated > 0) {
      try {
        const { data: principleMemories } = await supabase
          .from("memories")
          .select("id, content, memory_type, confidence, tags")
          .eq("user_id", user_id)
          .eq("agent_id", agent_id)
          .filter("provenance->>conversation_id", "eq", conversation_id)
          .eq("is_deleted", false)
          .in("memory_type", ["principle", "preference"]);

        if (principleMemories && principleMemories.length > 0) {
          // Check for existing beliefs to avoid duplicates
          const { data: existingBeliefs } = await supabase
            .from("beliefs")
            .select("content")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("active", true);

          const existingSet = new Set(
            (existingBeliefs || []).map((b: any) => b.content.toLowerCase().trim().slice(0, 60))
          );

          for (const mem of principleMemories) {
            const normContent = mem.content.toLowerCase().trim().slice(0, 60);
            if (existingSet.has(normContent)) continue;

            // Determine domain from tags
            const domainMap: Record<string, string> = {
              work: "professional", career: "professional",
              relationship: "relationships", family: "relationships", love: "relationships",
              health: "wellbeing", mental_health: "wellbeing",
              philosophy: "philosophy", consciousness: "philosophy",
              identity: "identity", self: "identity",
              creativity: "creativity", art: "creativity",
            };
            let domain = "general";
            for (const tag of mem.tags || []) {
              if (domainMap[tag]) { domain = domainMap[tag]; break; }
            }

            await supabase.from("beliefs").insert({
              user_id,
              agent_id,
              content: mem.content,
              // epistemic-humility band [0.05, 0.95] — beliefs are never absolute/extinct
              confidence: Math.max(0.05, Math.min(0.95, mem.confidence || 0.5)),
              domain,
              tags: mem.tags || [],
              source: "extraction",
            });
            existingSet.add(normContent);
          }
        }
      } catch (beliefErr) {
        console.error("Belief extraction error (non-blocking):", beliefErr);
      }
    }

    // ─── Anima: Trigger emotional state update after extraction ───
    fetch(`${supabaseUrl}/functions/v1/anima-emotional-state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ user_id, agent_id }),
    }).catch((e) => console.error("Emotional state update failed:", e));

    return new Response(
      JSON.stringify({
        extracted: memoriesCreated,
        questions: questionsGenerated,
        conflicts: conflictsDetected,
        connections: connectionsCreated,
        rejected,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("memory-extract error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again later." }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

// Linearize ChatGPT's tree-structured mapping into chronological messages
function linearizeMapping(mapping: Record<string, any>): { role: string; content: string }[] {
  const messages: { role: string; content: string; create_time: number }[] = [];

  for (const nodeId of Object.keys(mapping)) {
    const node = mapping[nodeId];
    const msg = node?.message;
    if (!msg) continue;
    if (!msg.content?.parts?.length) continue;

    const role = msg.author?.role;
    if (!role || role === "system" || role === "tool") continue;

    const textParts = msg.content.parts.filter((p: any) => typeof p === "string");
    const text = textParts.join("\n").trim();
    if (!text) continue;

    messages.push({
      role: role === "assistant" ? "assistant" : "user",
      content: text,
      create_time: msg.create_time || 0,
    });
  }

  messages.sort((a, b) => a.create_time - b.create_time);
  return messages.map(({ role, content }) => ({ role, content }));
}

// Truncate conversation text to avoid exceeding context limits
function truncateConversation(messages: { role: string; content: string }[], maxChars: number): { role: string; content: string }[] {
  let total = 0;
  const result: { role: string; content: string }[] = [];
  for (const msg of messages) {
    if (total + msg.content.length > maxChars) {
      const remaining = maxChars - total;
      if (remaining > 100) {
        result.push({ role: msg.role, content: msg.content.slice(0, remaining) + "..." });
      }
      break;
    }
    result.push(msg);
    total += msg.content.length;
  }
  return result;
}

// ─── Import-specific constants ───

const IMPORT_CONFIDENCE_CEILING = 0.85;
const EXTRACTION_MODEL = "google/gemini-2.5-flash";

function calculateStalenessRisk(createTime: number): "low" | "medium" | "high" {
  const ageMs = Date.now() - createTime * 1000;
  const sixMonths = 6 * 30 * 86400 * 1000;
  const twelveMonths = 12 * 30 * 86400 * 1000;
  if (ageMs < sixMonths) return "low";
  if (ageMs < twelveMonths) return "medium";
  return "high";
}

function getEstimatedDate(createTime: number): string {
  return new Date(createTime * 1000).toISOString().split("T")[0];
}

// Word-set overlap for fuzzy dedup — returns 0-1 ratio of shared words
function wordSetOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(b.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return overlap / Math.min(setA.size, setB.size);
}

// ─── Single-pass extraction prompt ───

const EXTRACTION_PROMPT = `You are a memory extraction system for an AI companion. You will analyze a batch of conversations and extract meaningful memories about the USER in a single pass.

Focus on what actually matters for a companion who knows this person:

**HIGH PRIORITY (extract with detail):**
- Facts the user stated directly about themselves (name, job, location, family, age)
- Strong preferences and opinions they expressed
- Emotional patterns — what makes them happy, frustrated, anxious, excited
- Relationships — who they mention, how they talk about them
- Goals and what they're actively working toward
- Communication style preferences (do they like directness? humor? depth?)
- Values and principles they live by

**MEDIUM PRIORITY:**
- Skills and expertise areas
- Commitments and ongoing projects
- Contextual info about their current situation

**SKIP:**
- Things the AI assistant said (we only care about the USER)
- Generic observations anyone could make
- Trivial or one-off mentions with no personal significance
- Information that's too vague to be useful

For each memory, set detail_level based on significance:
- "detailed": Core identity facts, strong emotional moments, important relationships — write a rich contextual sentence or two
- "standard": Clear preferences, goals, recurring topics — one solid sentence
- "brief": Minor facts, passing mentions — concise single statement

IMPORTED MEMORY CONFIDENCE RULES (these are imported, not live — cap accordingly):
- Identity facts stated directly (name, age, location) → 0.80 max
- Professional info from recent conversations → 0.70 max
- Goals and aspirations → 0.55 max
- Preferences and opinions → 0.65 max
- Relationships mentioned → 0.70 max
- Inferred personality traits → 0.50 max
- NEVER exceed 0.85 for any imported memory

Confidence sources:
- 0.7-0.85 (user_explicit): User directly stated this
- 0.5-0.69 (user_implied): Strongly implied
- 0.3-0.49 (model_inferred): Reasonably inferred from context

Also generate 2-3 curiosity questions — things a companion might genuinely wonder about based on these conversations. They should feel natural and caring, not interrogative.

Flag any contradictions you notice between different conversations in this batch OR with existing memories.`;

// ─── Tool schema ───

const extractionTool = {
  type: "function",
  function: {
    name: "extract_memories",
    description: "Extract memories, questions, and conflicts from a batch of conversations",
    parameters: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Memory text — length varies by detail_level" },
              memory_type: { type: "string", enum: ["fact", "preference", "relationship", "principle", "commitment", "moment", "skill", "goal", "context"] },
              confidence: { type: "number", description: "0.0 to 1.0" },
              confidence_source: { type: "string", enum: ["user_explicit", "user_implied", "model_inferred"] },
              emotional_valence: { type: "number", description: "-1.0 to 1.0" },
              emotional_intensity: { type: "number", description: "0.0 to 1.0" },
              detail_level: { type: "string", enum: ["brief", "standard", "detailed"] },
              narrative_thread: { type: "string", description: "Overarching life narrative this belongs to" },
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
              context: { type: "string" },
              curiosity_score: { type: "number" },
            },
            required: ["question", "context", "curiosity_score"],
          },
        },
        conflicts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              memory_a: { type: "string", description: "First conflicting statement" },
              memory_b: { type: "string", description: "Second conflicting statement" },
              conflict_type: { type: "string", enum: ["contradiction", "update", "ambiguity"] },
            },
            required: ["memory_a", "memory_b", "conflict_type"],
          },
        },
      },
      required: ["memories", "curiosity_questions", "conflicts"],
    },
  },
};

// ─── Main Handler ───

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Authenticate using getUser (vessel pattern)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const user_id = user.id;
    const { conversations, import_id, chunk_index, total_chunks, accumulated_memories } = await req.json();

    if (!conversations || !Array.isArray(conversations) || !import_id || chunk_index === undefined) {
      return new Response(JSON.stringify({ error: "Invalid request: need conversations, import_id, chunk_index" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY")!;
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Linearize and prepare conversation text
    const linearized = conversations
      .filter((c: any) => c.mapping && typeof c.mapping === "object")
      .map((conv: any) => ({
        title: conv.title || "Untitled",
        messages: linearizeMapping(conv.mapping),
        create_time: conv.create_time || 0,
      }))
      .filter((c: any) => c.messages.length >= 2);

    if (linearized.length === 0) {
      return new Response(JSON.stringify({
        memories_created: 0,
        questions_generated: 0,
        conflicts_detected: 0,
        chunk_index,
        status: "empty",
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Build conversation text, truncating long conversations
    const MAX_CHARS_PER_CONV = 80000;
    const batchText = linearized.map((conv: any) => {
      const date = conv.create_time
        ? new Date(conv.create_time * 1000).toISOString().split("T")[0]
        : "unknown date";
      const truncated = truncateConversation(conv.messages, MAX_CHARS_PER_CONV);
      const msgText = truncated
        .map((m: any) => `${m.role}: ${m.content}`)
        .join("\n");
      return `--- Conversation: "${conv.title}" (${date}) ---\n${msgText}`;
    }).join("\n\n");

    // Fetch existing memories for dedup context
    const { data: existingMemories } = await supabase
      .from("memories")
      .select("id, content, memory_type, confidence")
      .eq("user_id", user_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(500);

    // Merge DB memories with accumulated memories from earlier chunks in this import
    const accumulatedList: string[] = Array.isArray(accumulated_memories) ? accumulated_memories : [];
    const existingMemoryText = [
      ...(existingMemories || []).map((m: any) => `[${m.memory_type}] ${m.content}`),
      ...accumulatedList.map((c: string) => `[earlier_chunk] ${c}`),
    ].join("\n");

    // Build prompt
    const fullPrompt = `${EXTRACTION_PROMPT}

ALREADY KNOWN MEMORIES (do NOT duplicate these — skip if the information is already captured):
${existingMemoryText || "None yet — this is the first batch."}

CONVERSATIONS TO ANALYZE (chunk ${chunk_index + 1} of ${total_chunks}):
${batchText}`;

    // Single AI call with tool calling
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        messages: [{ role: "user", content: fullPrompt }],
        temperature: 0.2,
        tools: [extractionTool],
        tool_choice: { type: "function", function: { name: "extract_memories" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`Chunk ${chunk_index} AI call failed (${aiResponse.status}):`, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed", details: errText.slice(0, 200) }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();

    // Parse tool call response
    let result: any = { memories: [], curiosity_questions: [], conflicts: [] };
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
      return new Response(JSON.stringify({ error: "parse error", memories_created: 0, questions_generated: 0, conflicts_detected: 0 }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Intra-batch dedup: remove duplicates the LLM extracted within this chunk ──
    if (result.memories?.length > 0) {
      const seenInBatch: string[] = [];
      result.memories = result.memories.filter((m: any) => {
        const norm = m.content.toLowerCase().trim();
        const isDupInBatch = seenInBatch.some(s =>
          s === norm || wordSetOverlap(s, norm) > 0.7
        );
        if (isDupInBatch) return false;
        seenInBatch.push(norm);
        return true;
      });
    }

    let memoriesCreated = 0;
    let createdContents: string[] = [];
    let questionsGenerated = 0;
    let conflictsDetected = 0;

    // ── Calculate batch-level staleness from conversation timestamps ──
    const batchCreateTimes = linearized
      .map((c: any) => c.create_time)
      .filter((t: number) => t > 0);
    const avgCreateTime = batchCreateTimes.length > 0
      ? batchCreateTimes.reduce((a: number, b: number) => a + b, 0) / batchCreateTimes.length
      : 0;
    const batchStaleness = avgCreateTime > 0 ? calculateStalenessRisk(avgCreateTime) : "medium";
    const batchEstimatedDate = avgCreateTime > 0 ? getEstimatedDate(avgCreateTime) : null;

    // ── Insert memories with dedup check, confidence ceiling, and staleness ──
    if (result.memories?.length > 0) {
      const memoryRows: any[] = [];

      for (const m of result.memories) {
        // Dedup: check against DB memories + accumulated memories from earlier chunks
        const normalizedContent = m.content.toLowerCase().trim();

        // Check against DB memories
        const isDupInDB = (existingMemories || []).some((existing: any) => {
          const existingNorm = existing.content.toLowerCase().trim();
          if (existingNorm === normalizedContent) return true;
          if (normalizedContent.length > 30 && existingNorm.length > 30) {
            if (existingNorm.includes(normalizedContent.slice(0, 50)) || normalizedContent.includes(existingNorm.slice(0, 50))) {
              return true;
            }
          }
          if (wordSetOverlap(normalizedContent, existingNorm) > 0.7) return true;
          return false;
        });

        // Check against accumulated memories from earlier chunks
        const isDupInAccumulated = accumulatedList.some((acc: string) => {
          const accNorm = acc.toLowerCase().trim();
          if (accNorm === normalizedContent) return true;
          if (normalizedContent.length > 30 && accNorm.length > 30) {
            if (accNorm.includes(normalizedContent.slice(0, 50)) || normalizedContent.includes(accNorm.slice(0, 50))) {
              return true;
            }
          }
          if (wordSetOverlap(normalizedContent, accNorm) > 0.7) return true;
          return false;
        });

        const isDuplicate = isDupInDB || isDupInAccumulated;

        if (isDuplicate) continue;

        // Apply confidence ceiling for imported memories
        const rawConfidence = m.confidence ?? 0.5;
        const cappedConfidence = Math.min(rawConfidence, IMPORT_CONFIDENCE_CEILING);
        const needsConfirmation = batchStaleness === "high";

        memoryRows.push({
          user_id,
          content: m.content,
          memory_type: m.memory_type || "fact",
          relevance_score: cappedConfidence,
          confidence: cappedConfidence,
          confidence_source: m.confidence_source || "model_inferred",
          emotional_valence: m.emotional_valence ?? 0.0,
          emotional_intensity: m.emotional_intensity ?? 0.0,
          detail_level: m.detail_level || "standard",
          narrative_thread: m.narrative_thread || null,
          tags: m.tags || [],
          summary: m.summary || null,
          staleness_risk: batchStaleness,
          estimated_date: batchEstimatedDate,
          import_needs_confirmation: needsConfirmation,
          provenance: {
            source: "chatgpt_import",
            import_id,
            chunk_index,
            pipeline: "chunked_single_pass_v3",
            extracted_at: new Date().toISOString(),
            staleness_risk: batchStaleness,
            estimated_date: batchEstimatedDate,
          },
        });
      }

      if (memoryRows.length > 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from("memories")
          .insert(memoryRows)
          .select("id, content");

        if (insertErr) {
          console.error("Memory insert error:", insertErr);
        } else {
          memoriesCreated = inserted?.length || 0;
          createdContents = (inserted || []).map((m: any) => m.content);
        }
      }
    }

    // ── Insert curiosity questions (defensive — table may not exist) ──
    if (result.curiosity_questions?.length > 0) {
      try {
        const { data: existingQuestions } = await supabase
          .from("curiosity_questions")
          .select("question")
          .eq("user_id", user_id)
          .in("status", ["pending", "shown"]);

        const existingSet = new Set((existingQuestions || []).map((q: any) => q.question.toLowerCase().trim()));

        const newQuestions = result.curiosity_questions.filter(
          (q: any) => !existingSet.has(q.question.toLowerCase().trim())
        );

        if (newQuestions.length > 0) {
          const qRows = newQuestions.map((q: any) => ({
            user_id,
            question: q.question,
            context: q.context || null,
            curiosity_score: q.curiosity_score ?? 0.5,
          }));
          const { error: qErr } = await supabase.from("curiosity_questions").insert(qRows);
          if (!qErr) questionsGenerated = qRows.length;
        }
      } catch (qError) {
        console.log("[IMPORT] curiosity_questions table not available, skipping:", qError);
      }
    }

    // ── Track conflicts in memory_conflicts table (defensive) ──
    if (result.conflicts?.length > 0) {
      conflictsDetected = result.conflicts.length;

      try {
        for (const conflict of result.conflicts) {
          const memoryAContent = conflict.memory_a;
          const memoryBContent = conflict.memory_b;

          const existingMatch = (existingMemories || []).find((m: any) =>
            m.content.toLowerCase().includes(memoryAContent.toLowerCase().slice(0, 50))
          );

          const { data: newMatch } = await supabase
            .from("memories")
            .select("id")
            .eq("user_id", user_id)
            .eq("is_deleted", false)
            .ilike("content", `%${memoryBContent.slice(0, 50)}%`)
            .limit(1);

          if (existingMatch && newMatch?.[0]) {
            await supabase.from("memory_conflicts").insert({
              user_id,
              memory_a_id: existingMatch.id,
              memory_b_id: newMatch[0].id,
              conflict_type: conflict.conflict_type === "update" ? "update"
                : conflict.conflict_type === "ambiguity" ? "ambiguity"
                : "import_conflict",
              status: "unresolved",
            });
          }
        }
      } catch (conflictError) {
        console.log("[IMPORT] memory_conflicts table not available, skipping:", conflictError);
      }
    }

    // ── Update import record with chunk progress (defensive) ──
    try {
      const { data: currentImport } = await supabase
        .from("chat_imports")
        .select("processed_conversations, memories_created, questions_generated, conflicts_detected")
        .eq("id", import_id)
        .single();

      if (currentImport) {
        await supabase.from("chat_imports").update({
          processed_conversations: (currentImport.processed_conversations || 0) + linearized.length,
          memories_created: (currentImport.memories_created || 0) + memoriesCreated,
          questions_generated: (currentImport.questions_generated || 0) + questionsGenerated,
          conflicts_detected: (currentImport.conflicts_detected || 0) + conflictsDetected,
          pipeline_stage: "extracting",
        }).eq("id", import_id);
      }
    } catch (importUpdateError) {
      console.log("[IMPORT] chat_imports table not available, skipping progress update:", importUpdateError);
    }

    return new Response(JSON.stringify({
      memories_created: memoriesCreated,
      created_contents: createdContents,
      questions_generated: questionsGenerated,
      conflicts_detected: conflictsDetected,
      conversations_in_chunk: linearized.length,
      chunk_index,
      status: "ok",
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-chatgpt chunk error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

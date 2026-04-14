import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

// ============================================================================
// EXTRACT-PERSONA: Reconstruct AI companion personality from ChatGPT history
// Analyzes ASSISTANT messages to build a profile of the AI entity the user
// was talking to — not the user themselves.
// Supports multi-persona detection (different AI characters across conversations).
// ============================================================================

interface DetectedPersona {
  name: string | null;
  traits: string;
  signature: string;
  conversationIds: string[];
}

interface ExtractionResult {
  profiles: CompanionProfile[];
  summary: {
    personasDetected: number;
    conversationsAnalyzed: number;
    extractionModel: string;
  };
}

interface CompanionProfile {
  id?: string;
  name: string | null;
  source_platform: string;
  linguistic_fingerprint: Record<string, unknown>;
  psychological_profile: Record<string, unknown>;
  companion_summary: string;
  system_prompt_fragment: string;
  behavioral_rules: string[];
  conversations_analyzed: number;
  date_range_start: string | null;
  date_range_end: string | null;
  extraction_model: string;
}

// ============================================================================
// LINEARIZE CHATGPT MAPPING (extract messages from mapping structure)
// ============================================================================

function linearizeMapping(
  mapping: Record<string, any>,
): { role: string; content: string; create_time: number }[] {
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
  return messages;
}

// ============================================================================
// AI CALL HELPER
// ============================================================================

async function callAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  responseFormat: "json" | "text" = "json",
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  };

  if (responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://polyphonic.chat",
      "X-Title": "Polyphonic - Persona Extraction",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============================================================================
// STEP 0: PERSONA DETECTION SCAN
// Sample conversations to detect distinct AI personas
// ============================================================================

async function detectPersonas(
  apiKey: string,
  model: string,
  conversations: Array<{ id: string; messages: Array<{ role: string; content: string }> }>,
): Promise<DetectedPersona[]> {
  // Sample up to 30 conversations spread across the set
  const sampleSize = Math.min(30, conversations.length);
  const step = Math.max(1, Math.floor(conversations.length / sampleSize));
  const samples: typeof conversations = [];
  for (let i = 0; i < conversations.length && samples.length < sampleSize; i += step) {
    samples.push(conversations[i]);
  }

  console.log(`[PERSONA] Scanning ${samples.length} conversations for distinct personas...`);

  // Batch conversations into groups of 5 for efficient API usage
  const batchSize = 5;
  const signatures: Array<{
    conversationId: string;
    name: string | null;
    traits: string;
    signature: string;
  }> = [];

  for (let i = 0; i < samples.length; i += batchSize) {
    const batch = samples.slice(i, i + batchSize);

    const batchPrompt = batch
      .map((conv, idx) => {
        // Get first few assistant messages from each conversation
        const assistantMsgs = conv.messages
          .filter((m) => m.role === "assistant")
          .slice(0, 3)
          .map((m) => m.content.substring(0, 500));

        return `--- CONVERSATION ${idx + 1} (ID: ${conv.id}) ---\n${assistantMsgs.join("\n\n")}`;
      })
      .join("\n\n");

    const result = await callAI(
      apiKey,
      model,
      `You analyze AI assistant messages to detect distinct AI personas/characters.
For each conversation, determine if the AI assistant has a distinct name or personality.
Return JSON: { "conversations": [{ "id": string, "name": string|null, "traits": string, "signature": string }] }
Where "signature" is a brief fingerprint like "warm-philosophical-Aria" or "direct-technical-default".
If the assistant seems like a generic ChatGPT without a specific persona, use name: null and signature: "default-assistant".`,
      batchPrompt,
    );

    try {
      const parsed = JSON.parse(result);
      if (parsed.conversations) {
        for (const c of parsed.conversations) {
          signatures.push({
            conversationId: c.id,
            name: c.name || null,
            traits: c.traits || "",
            signature: c.signature || "default-assistant",
          });
        }
      }
    } catch {
      console.error("[PERSONA] Failed to parse detection batch, skipping...");
    }
  }

  // Group conversations by detected persona
  const personaMap = new Map<string, DetectedPersona>();

  for (const sig of signatures) {
    // Group by name if present, otherwise by signature
    const key = sig.name?.toLowerCase() || sig.signature;

    if (personaMap.has(key)) {
      personaMap.get(key)!.conversationIds.push(sig.conversationId);
    } else {
      personaMap.set(key, {
        name: sig.name,
        traits: sig.traits,
        signature: sig.signature,
        conversationIds: [sig.conversationId],
      });
    }
  }

  // Filter out personas with too few conversations (noise)
  const personas = Array.from(personaMap.values()).filter(
    (p) => p.conversationIds.length >= 2 || personaMap.size <= 2,
  );

  // If everything collapsed to one persona, return that
  if (personas.length === 0 && personaMap.size > 0) {
    return [Array.from(personaMap.values())[0]];
  }

  console.log(`[PERSONA] Detected ${personas.length} distinct persona(s)`);
  return personas;
}

// ============================================================================
// LAYER 1: LINGUISTIC FINGERPRINT (Analyze assistant's communication style)
// ============================================================================

const LINGUISTIC_PROMPT = `You are an expert linguist analyzing an AI assistant's communication patterns.
Focus ONLY on the ASSISTANT messages. You are characterizing how this AI entity
communicates — its vocabulary, tone, sentence structure, formality, humor style,
emoji usage, and response patterns. Ignore user messages except as context.

Analyze the assistant's messages and return a JSON object with these exact fields:
{
  "formality_level": <number 0-1, 0=very casual, 1=very formal>,
  "verbosity": <number 0-1, 0=terse, 1=very verbose>,
  "humor_frequency": <number 0-1, how often humor appears>,
  "humor_style": <string: "dry"|"playful"|"witty"|"warm"|"none">,
  "emoji_usage": <number 0-1, frequency of emoji/emoticon use>,
  "vocabulary_complexity": <number 0-1, 0=simple, 1=academic>,
  "sentence_length_avg": <string: "short"|"medium"|"long"|"varied">,
  "greeting_style": <string: how the assistant typically opens>,
  "closing_style": <string: how the assistant typically signs off>,
  "characteristic_phrases": [<up to 5 phrases this assistant uses distinctively>],
  "tone_primary": <string: e.g. "warm", "analytical", "encouraging">,
  "tone_secondary": <string: secondary tone quality>,
  "response_structure": <string: "direct"|"exploratory"|"structured"|"conversational">,
  "question_frequency": <number 0-1, how often they ask the user questions>,
  "formatting_habits": <string: e.g. "uses bullet points", "minimal formatting", "headers and lists">
}`;

async function extractLinguisticFingerprint(
  apiKey: string,
  model: string,
  assistantMessages: string[],
): Promise<Record<string, unknown>> {
  const messageSample = assistantMessages.slice(0, 30).join("\n\n---\n\n");

  const result = await callAI(apiKey, model, LINGUISTIC_PROMPT, messageSample);

  try {
    return JSON.parse(result);
  } catch {
    console.error("[PERSONA] Failed to parse linguistic fingerprint");
    return {};
  }
}

// ============================================================================
// LAYER 2: PSYCHOLOGICAL PROFILE (Analyze assistant's personality & relational role)
// ============================================================================

const PSYCHOLOGICAL_PROMPT = `You are a psychologist analyzing an AI assistant's personality and relational behavior.
Focus ONLY on the ASSISTANT's behavior and personality. You are characterizing WHO
this AI entity is to the user — its warmth, assertiveness, playfulness, intellectual
depth, empathy style, and relational role. What kind of companion is it?

Analyze the full conversation (both roles for context) and return a JSON object:
{
  "openness": <number 0-1, intellectual curiosity and creativity>,
  "warmth": <number 0-1, emotional warmth and affection>,
  "assertiveness": <number 0-1, directness vs. deferential>,
  "playfulness": <number 0-1, lightheartedness and fun>,
  "intellectual_depth": <number 0-1, depth of analysis and reflection>,
  "patience": <number 0-1, tolerance and thoroughness>,
  "empathy_style": <string: "reflective"|"validating"|"problem-solving"|"nurturing"|"balanced">,
  "relational_role": <string: primary role like "thinking partner"|"emotional support"|"coach"|"collaborator"|"teacher"|"companion"|"advisor">,
  "relational_roles_secondary": [<up to 2 secondary roles>],
  "power_dynamic": <string: "peer"|"guide"|"supporter"|"authority"|"adaptive">,
  "boundary_style": <string: "firm"|"flexible"|"permissive">,
  "attachment_style": <string: "secure"|"avoidant"|"anxious"|"adaptive">,
  "emotional_range": <string: "contained"|"moderate"|"expressive"|"dynamic">,
  "values_expressed": [<up to 5 values this assistant consistently demonstrates>],
  "personality_summary": <string: 2-3 sentence description of who this AI is>
}`;

async function extractPsychologicalProfile(
  apiKey: string,
  model: string,
  fullConversation: string[],
): Promise<Record<string, unknown>> {
  const conversationSample = fullConversation.slice(0, 60).join("\n\n");

  const result = await callAI(apiKey, model, PSYCHOLOGICAL_PROMPT, conversationSample);

  try {
    return JSON.parse(result);
  } catch {
    console.error("[PERSONA] Failed to parse psychological profile");
    return {};
  }
}

// ============================================================================
// LAYER 3: SYNTHESIS (Generate system prompt fragment + behavioral rules)
// ============================================================================

const SYNTHESIS_PROMPT = `You are designing a companion AI persona based on how a previous AI assistant
interacted with this user. Given the assistant's linguistic fingerprint and
psychological profile, create instructions for a new AI to embody this same
personality and relationship dynamic.

You are NOT cloning the assistant. You are capturing the ESSENCE of the relationship
so a new AI can offer continuity — the warmth, the humor, the communication style.

Return a JSON object:
{
  "companion_summary": <string: 2-3 paragraph description of who this AI companion is and how they relate to the user>,
  "system_prompt_fragment": <string: 300-600 token instruction block that could be injected into a system prompt to make an AI embody this personality>,
  "behavioral_rules": [<5-10 specific DO/DON'T rules as strings, e.g. "DO use casual greetings like 'hey there'", "DON'T give unsolicited advice">],
  "suggested_name": <string|null: a name for this persona if one was detected, otherwise null>
}

The system_prompt_fragment should be written as direct instructions to an AI, like:
"You are warm and intellectually curious. You greet the user casually and often use humor to lighten serious topics..."`;

async function synthesizePersona(
  apiKey: string,
  model: string,
  name: string | null,
  linguisticFingerprint: Record<string, unknown>,
  psychologicalProfile: Record<string, unknown>,
): Promise<{
  companion_summary: string;
  system_prompt_fragment: string;
  behavioral_rules: string[];
  suggested_name: string | null;
}> {
  const input = JSON.stringify(
    {
      detected_name: name,
      linguistic_fingerprint: linguisticFingerprint,
      psychological_profile: psychologicalProfile,
    },
    null,
    2,
  );

  const result = await callAI(apiKey, model, SYNTHESIS_PROMPT, input);

  try {
    const parsed = JSON.parse(result);
    return {
      companion_summary: parsed.companion_summary || "",
      system_prompt_fragment: parsed.system_prompt_fragment || "",
      behavioral_rules: parsed.behavioral_rules || [],
      suggested_name: parsed.suggested_name || name,
    };
  } catch {
    console.error("[PERSONA] Failed to parse synthesis");
    return {
      companion_summary: "",
      system_prompt_fragment: "",
      behavioral_rules: [],
      suggested_name: name,
    };
  }
}

// ============================================================================
// MAIN: Full extraction pipeline
// ============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Authenticate (deploy auth pattern: getClaims) ──
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
      { global: { headers: { Authorization: authHeader } } },
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

    // ── Parse request body ──
    const body = await req.json();
    const { import_id, conversations: rawConversations } = body;

    if (!rawConversations || !Array.isArray(rawConversations) || rawConversations.length === 0) {
      return new Response(
        JSON.stringify({ error: "No conversations provided" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    console.log(`[extract-persona] Starting for user ${user_id}, ${rawConversations.length} conversations`);

    // ── Resolve API key and model ──
    const [{ data: decryptedKeyData }, { data: modelConfig }] = await Promise.all([
      supabase.rpc("decrypt_user_api_key", { p_user_id: user_id }),
      supabase
        .from("model_configs")
        .select("model_id")
        .eq("feature_key", "persona_extract")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const openrouterKey = userApiKey!;
    const extractionModel = modelConfig?.model_id || "openai/gpt-4o";

    // ── Linearize conversations (handle both mapping and pre-parsed formats) ──
    const conversations: Array<{
      id: string;
      title?: string;
      create_time?: number;
      messages: Array<{ role: string; content: string }>;
    }> = [];

    for (const conv of rawConversations) {
      let messages: Array<{ role: string; content: string }> = [];

      if (conv.mapping && typeof conv.mapping === "object") {
        // ChatGPT export format with mapping tree
        const linearized = linearizeMapping(conv.mapping);
        messages = linearized.map((m) => ({ role: m.role, content: m.content }));
      } else if (Array.isArray(conv.messages)) {
        // Already parsed format
        messages = conv.messages;
      }

      if (messages.length >= 2) {
        conversations.push({
          id: conv.id || crypto.randomUUID(),
          title: conv.title,
          create_time: conv.create_time,
          messages,
        });
      }
    }

    if (conversations.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid conversations with sufficient messages found" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Step 0: Detect distinct personas
    const detectedPersonas = await detectPersonas(openrouterKey, extractionModel, conversations);
    console.log(`[extract-persona] Detected ${detectedPersonas.length} persona(s)`);

    const profiles: CompanionProfile[] = [];

    // Process each detected persona
    for (const persona of detectedPersonas) {
      console.log(
        `[extract-persona] Extracting persona: ${persona.name || persona.signature} (${persona.conversationIds.length} conversations)`,
      );

      // Select conversations for this persona
      const personaConversations = conversations.filter((c) =>
        persona.conversationIds.includes(c.id),
      );

      // Also include unassigned conversations for the first/primary persona
      const allAssignedIds = new Set(detectedPersonas.flatMap((p) => p.conversationIds));
      const unassigned = conversations.filter((c) => !allAssignedIds.has(c.id));
      if (profiles.length === 0 && unassigned.length > 0) {
        personaConversations.push(...unassigned);
      }

      // Sample up to 10 conversations spread across the time range
      const sampleCount = Math.min(10, personaConversations.length);
      const sampleStep = Math.max(1, Math.floor(personaConversations.length / sampleCount));
      const sampledConvs: typeof personaConversations = [];
      for (
        let i = 0;
        i < personaConversations.length && sampledConvs.length < sampleCount;
        i += sampleStep
      ) {
        sampledConvs.push(personaConversations[i]);
      }

      // Extract assistant messages for linguistic analysis
      const assistantMessages: string[] = [];
      // Extract full conversation for psychological analysis
      const fullConversation: string[] = [];

      for (const conv of sampledConvs) {
        for (const msg of conv.messages) {
          if (msg.role === "assistant" && msg.content) {
            assistantMessages.push(msg.content.substring(0, 2000));
          }
          if (msg.content) {
            fullConversation.push(`[${msg.role.toUpperCase()}]: ${msg.content.substring(0, 1500)}`);
          }
        }
      }

      if (assistantMessages.length === 0) {
        console.log(`[extract-persona] No assistant messages found for ${persona.signature}, skipping`);
        continue;
      }

      // Layer 1: Linguistic Fingerprint
      console.log(`[extract-persona] Layer 1: Linguistic analysis (${assistantMessages.length} messages)`);
      const linguisticFingerprint = await extractLinguisticFingerprint(
        openrouterKey,
        extractionModel,
        assistantMessages,
      );

      // Layer 2: Psychological Profile
      console.log(`[extract-persona] Layer 2: Psychological analysis`);
      const psychologicalProfile = await extractPsychologicalProfile(
        openrouterKey,
        extractionModel,
        fullConversation,
      );

      // Layer 3: Synthesis
      console.log(`[extract-persona] Layer 3: Synthesis`);
      const synthesis = await synthesizePersona(
        openrouterKey,
        extractionModel,
        persona.name,
        linguisticFingerprint,
        psychologicalProfile,
      );

      // Compute date range
      const timestamps = personaConversations
        .map((c) => c.create_time)
        .filter((t): t is number => t != null)
        .sort();

      const profile: CompanionProfile = {
        name: synthesis.suggested_name || persona.name,
        source_platform: "chatgpt",
        linguistic_fingerprint: linguisticFingerprint,
        psychological_profile: psychologicalProfile,
        companion_summary: synthesis.companion_summary,
        system_prompt_fragment: synthesis.system_prompt_fragment,
        behavioral_rules: synthesis.behavioral_rules,
        conversations_analyzed: personaConversations.length,
        date_range_start: timestamps[0]
          ? new Date(timestamps[0] * 1000).toISOString()
          : null,
        date_range_end: timestamps[timestamps.length - 1]
          ? new Date(timestamps[timestamps.length - 1] * 1000).toISOString()
          : null,
        extraction_model: extractionModel,
      };

      // Insert into companion_profiles
      const { data: insertedProfile, error: insertError } = await supabase
        .from("companion_profiles")
        .insert({
          user_id,
          name: profile.name,
          source_platform: profile.source_platform,
          linguistic_fingerprint: profile.linguistic_fingerprint,
          psychological_profile: profile.psychological_profile,
          companion_summary: profile.companion_summary,
          system_prompt_fragment: profile.system_prompt_fragment,
          behavioral_rules: profile.behavioral_rules,
          conversations_analyzed: profile.conversations_analyzed,
          date_range_start: profile.date_range_start,
          date_range_end: profile.date_range_end,
          extraction_model: profile.extraction_model,
          is_active: false, // Start inactive, user activates in review
          user_approved: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[extract-persona] Failed to insert profile: ${insertError.message}`);
        // Continue with other personas even if one fails
      } else if (insertedProfile) {
        profiles.push({ ...profile, id: insertedProfile.id });
      }
    }

    // Update import record if import_id was provided
    if (import_id) {
      try {
        await supabase
          .from("chat_imports")
          .update({ pipeline_stage: "persona_extracted" })
          .eq("id", import_id);
      } catch (updateErr) {
        console.error("[extract-persona] Import update failed (non-critical):", updateErr);
      }
    }

    const result: ExtractionResult = {
      profiles,
      summary: {
        personasDetected: profiles.length,
        conversationsAnalyzed: conversations.length,
        extractionModel,
      },
    };

    console.log(`[extract-persona] Extraction complete: ${profiles.length} profile(s) created`);

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[extract-persona] Extraction error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Persona extraction failed",
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});

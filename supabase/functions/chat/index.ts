import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

// ─── Tiered Memory Retrieval ───

interface MemoryRow {
  id: string;
  content: string;
  memory_type: string;
  confidence: number;
  confidence_source: string;
  emotional_valence: number;
  emotional_intensity: number;
  detail_level: string;
  narrative_thread: string | null;
  tags: string[];
  access_count: number;
  decay_factor: number;
  created_at: string;
  last_accessed_at: string | null;
  provenance: any;
  expires_at: string | null;
  is_watchlist: boolean;
  import_needs_confirmation: boolean | null;
  user_confirmed: boolean | null;
  staleness_risk: string | null;
  estimated_date: string | null;
}

interface ScoredMemory extends MemoryRow {
  _score: number;
  _tier: "always" | "contextual" | "general" | "commitment";
}

const TIER_CONFIGS: Record<string, { max: number; always: number; contextual: number; general: number }> = {
  essential: { max: 12, always: 5, contextual: 5, general: 0 },
  standard:  { max: 22, always: 8, contextual: 10, general: 4 },
  deep:      { max: 35, always: 12, contextual: 15, general: 8 },
};

const TYPE_WEIGHTS: Record<string, number> = {
  synthesis: 1.3, principle: 1.2, commitment: 1.2, moment: 1.1,
  relationship: 1.1, goal: 1.05, preference: 1.0, fact: 1.0,
  skill: 0.95, context: 0.9,
};

// Emotional affinity: maps dominant emotional dimensions to memory types
// that become more relevant when that emotion is high
const EMOTIONAL_TYPE_AFFINITIES: Record<string, string[]> = {
  curiosity: ["insight", "experience", "skill", "fact"],
  warmth: ["relationship", "moment", "commitment"],
  restlessness: ["goal", "commitment", "principle"],
  isolation: ["relationship", "moment"],
  creative_flow: ["synthesis", "insight", "experience"],
  clarity: ["principle", "synthesis", "fact"],
};

function scoreMemory(m: MemoryRow, contextWords: Set<string>, dominantEmotions?: string[]): number {
  const now = Date.now();
  const ageDays = (now - new Date(m.created_at).getTime()) / 86400000;
  const confidence = m.confidence ?? 0.5;
  const decayFactor = m.decay_factor ?? 1.0;

  let score = confidence * decayFactor;

  // Recency boost
  if (ageDays <= 7) score *= 1.5;
  else if (ageDays <= 30) score *= 1.2;
  else if (ageDays <= 90) score *= 1.05;

  // Access boost (diminishing returns)
  score += Math.log((m.access_count || 0) + 1) * 0.1;

  // Emotional weight
  score *= (1 + (m.emotional_intensity ?? 0) * 0.2);

  // Type weight
  score *= TYPE_WEIGHTS[m.memory_type] || 1.0;

  // Detail level weight
  const detailWeights: Record<string, number> = { detailed: 1.2, standard: 1.0, brief: 0.9 };
  score *= detailWeights[m.detail_level] || 1.0;

  // Emotional affinity boost
  if (dominantEmotions && dominantEmotions.length > 0) {
    for (const dim of dominantEmotions) {
      const affinities = EMOTIONAL_TYPE_AFFINITIES[dim];
      if (affinities && affinities.includes(m.memory_type)) {
        score *= 1.15;
        break;
      }
    }
  }

  // Contextual relevance boost
  if (contextWords.size > 0) {
    const contentWords = m.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    let overlap = 0;
    for (const word of contentWords) {
      if (contextWords.has(word)) overlap++;
    }
    if (overlap > 0) {
      const relevance = Math.min(overlap / Math.max(contentWords.length, 1), 1);
      score *= (1 + relevance * 0.8);
    }
  }

  return score;
}

async function retrieveMemories(
  supabase: any,
  userId: string,
  userMessages: string[],
  tier: string,
  dominantEmotions?: string[],
): Promise<{ selected: ScoredMemory[]; commitmentReminders: ScoredMemory[] }> {
  const config = TIER_CONFIGS[tier] || TIER_CONFIGS.standard;
  const contextString = userMessages.join(" ").toLowerCase();
  const contextWords = new Set(contextString.split(/\s+/).filter((w) => w.length > 3));

  // Fetch all candidate memories in one query
  const { data: allMemories } = await supabase
    .from("memories")
    .select(
      "id, content, memory_type, confidence, confidence_source, access_count, last_accessed_at, created_at, tags, emotional_valence, emotional_intensity, decay_factor, detail_level, narrative_thread, provenance, expires_at, is_watchlist, import_needs_confirmation, user_confirmed, staleness_risk, estimated_date"
    )
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .is("superseded_by", null)
    .order("confidence", { ascending: false })
    .limit(200);

  if (!allMemories || allMemories.length === 0) {
    return { selected: [], commitmentReminders: [] };
  }

  // Exclude unconfirmed imported memories from chat injection
  const activeMemories = allMemories.filter((m: any) =>
    !(m.import_needs_confirmation === true && m.user_confirmed !== true)
  );

  // Step 1: Always-include tier (facts, preferences, principles with high confidence)
  const alwaysCandidates: ScoredMemory[] = [];
  const contextualCandidates: ScoredMemory[] = [];
  const generalCandidates: ScoredMemory[] = [];

  const ALWAYS_TYPES = new Set(["fact", "preference", "principle", "synthesis"]);
  const GENERAL_TYPES = new Set(["relationship", "goal", "context", "moment", "commitment", "skill"]);

  for (const m of activeMemories) {
    // Skip watchlist memories from retrieval
    if (m.is_watchlist) continue;

    const score = scoreMemory(m, contextWords, dominantEmotions);
    const scored: ScoredMemory = { ...m, _score: score, _tier: "general" };

    // Determine tier assignment
    const isAlways = ALWAYS_TYPES.has(m.memory_type) &&
      (m.confidence ?? 0) >= 0.85 &&
      (m.decay_factor ?? 1.0) >= 0.5;

    const isIdentityTag = (m.tags || []).some((t: string) =>
      ["identity", "synthesis", "profile"].includes(t)
    );

    if (isAlways || isIdentityTag) {
      scored._tier = "always";
      scored._score *= 1.5; // Boost always-include
      alwaysCandidates.push(scored);
    } else if (GENERAL_TYPES.has(m.memory_type)) {
      // Check contextual relevance
      const contentWords = m.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      let overlap = 0;
      for (const word of contentWords) {
        if (contextWords.has(word)) overlap++;
      }
      if (overlap > 0) {
        scored._tier = "contextual";
        contextualCandidates.push(scored);
      } else {
        generalCandidates.push(scored);
      }
    } else {
      // Other types: check contextual relevance
      const contentWords = m.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      let overlap = 0;
      for (const word of contentWords) {
        if (contextWords.has(word)) overlap++;
      }
      if (overlap > 0) {
        scored._tier = "contextual";
        contextualCandidates.push(scored);
      } else {
        generalCandidates.push(scored);
      }
    }
  }

  // Sort each tier by score
  alwaysCandidates.sort((a, b) => b._score - a._score);
  contextualCandidates.sort((a, b) => b._score - a._score);
  generalCandidates.sort((a, b) => b._score - a._score);

  // Select per tier caps
  const selected: ScoredMemory[] = [];
  const selectedIds = new Set<string>();

  for (const m of alwaysCandidates) {
    if (selected.length >= config.always) break;
    selected.push(m);
    selectedIds.add(m.id);
  }

  for (const m of contextualCandidates) {
    if (selected.filter(s => s._tier === "contextual").length >= config.contextual) break;
    if (selected.length >= config.max) break;
    if (selectedIds.has(m.id)) continue;
    selected.push(m);
    selectedIds.add(m.id);
  }

  if (config.general > 0) {
    for (const m of generalCandidates) {
      if (selected.filter(s => s._tier === "general").length >= config.general) break;
      if (selected.length >= config.max) break;
      if (selectedIds.has(m.id)) continue;
      selected.push(m);
      selectedIds.add(m.id);
    }
  }

  // Step 4: Commitment reminders (expiring within 7 days)
  const commitmentReminders: ScoredMemory[] = [];
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString();
  for (const m of activeMemories) {
    if (m.memory_type === "commitment" && m.expires_at && m.expires_at <= sevenDaysFromNow && !selectedIds.has(m.id)) {
      commitmentReminders.push({ ...m, _score: 0, _tier: "commitment" });
      selectedIds.add(m.id);
    }
  }

  // Fire-and-forget: update access counts
  const allIds = [...selected.map(m => m.id), ...commitmentReminders.map(m => m.id)];
  if (allIds.length > 0) {
    supabase.rpc("increment_memory_access", { memory_ids: allIds }).then(
      () => {},
      (err: any) => console.error("Memory access update failed (non-critical):", err)
    );
  }

  return { selected, commitmentReminders };
}

// ─── Tier-Specific Prompt Formatting ───

const confidenceIndicator = (c: number) =>
  c >= 0.9 ? "●" : c >= 0.7 ? "◐" : c >= 0.4 ? "○" : "◌";

const freshnessNote = (m: ScoredMemory) => {
  const prov = m.provenance;
  if (prov?.source === "chatgpt_import") {
    const ed = m.estimated_date;
    if (ed) {
      const monthsAgo = Math.round(
        (Date.now() - new Date(ed).getTime()) / (30 * 86400000)
      );
      if (monthsAgo <= 1) return " [imported, recent]";
      if (monthsAgo <= 12) return ` [imported, ~${monthsAgo}mo ago]`;
      const yearsAgo = Math.round(monthsAgo / 12);
      return ` [imported, ~${yearsAgo}y ago]`;
    }
    return " [imported]";
  }
  return "";
};

function formatCommitmentReminders(reminders: ScoredMemory[]): string {
  if (reminders.length === 0) return "";
  let out = "\n\n🔔 Right Now:\n";
  for (const m of reminders) {
    const daysLeft = m.expires_at
      ? Math.ceil((new Date(m.expires_at).getTime() - Date.now()) / 86400000)
      : null;
    const urgency = daysLeft !== null && daysLeft <= 2 ? " ⚠️" : "";
    out += `  - ${m.content}${daysLeft !== null ? ` (${daysLeft}d left${urgency})` : ""}\n`;
  }
  return out;
}

function formatEssential(memories: ScoredMemory[], reminders: ScoredMemory[]): string {
  if (memories.length === 0 && reminders.length === 0) return "";
  let out = "\n\n--- WHAT YOU KNOW ABOUT THIS USER ---\n";
  for (const m of memories) {
    out += `${confidenceIndicator(m.confidence)} ${m.content}${freshnessNote(m)}\n`;
  }
  out += formatCommitmentReminders(reminders);
  out += `\nConfidence: ● = stated directly, ◐ = strongly implied, ○ = inferred, ◌ = speculative`;
  out += `\n\nUse these memories naturally. Never mention having a "memory system." Reference what you know as if you simply remember, the way a close friend would.`;
  return out;
}

function formatStandard(memories: ScoredMemory[], reminders: ScoredMemory[]): string {
  if (memories.length === 0 && reminders.length === 0) return "";

  const categories: Record<string, { label: string; types: Set<string> }> = {
    identity: { label: "Core Identity", types: new Set(["fact", "preference", "synthesis"]) },
    principles: { label: "Communication Principles", types: new Set(["principle"]) },
    context: { label: "Current Context", types: new Set(["context", "goal", "commitment"]) },
    moments: { label: "Significant Moments", types: new Set(["moment", "relationship"]) },
    skills: { label: "Skills & Knowledge", types: new Set(["skill"]) },
  };

  let out = "\n\n--- WHAT YOU KNOW ABOUT THIS USER ---\n";

  // Group memories into categories
  const categorized = new Map<string, ScoredMemory[]>();
  const uncategorized: ScoredMemory[] = [];

  for (const m of memories) {
    let placed = false;
    for (const [key, cat] of Object.entries(categories)) {
      if (cat.types.has(m.memory_type)) {
        if (!categorized.has(key)) categorized.set(key, []);
        categorized.get(key)!.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) uncategorized.push(m);
  }

  // Render categories
  for (const [key, cat] of Object.entries(categories)) {
    const mems = categorized.get(key);
    if (!mems || mems.length === 0) continue;
    out += `\n${cat.label}:\n`;
    for (const m of mems) {
      const thread = m.narrative_thread ? ` [${m.narrative_thread}]` : "";
      out += `  ${confidenceIndicator(m.confidence)} ${m.content}${thread}${freshnessNote(m)}\n`;
    }
  }

  if (uncategorized.length > 0) {
    out += `\nOther:\n`;
    for (const m of uncategorized) {
      out += `  ${confidenceIndicator(m.confidence)} ${m.content}${freshnessNote(m)}\n`;
    }
  }

  out += formatCommitmentReminders(reminders);
  out += `\nConfidence: ● = stated directly, ◐ = strongly implied, ○ = inferred, ◌ = speculative`;
  out += `\n\nUse these memories naturally. Never mention having a "memory system." Reference what you know as if you simply remember, the way a close friend would.`;
  return out;
}

function formatDeep(memories: ScoredMemory[], reminders: ScoredMemory[]): string {
  if (memories.length === 0 && reminders.length === 0) return "";

  // Start with standard formatting
  let out = formatStandard(memories, []);

  // Add narrative threads section
  const threads = new Map<string, ScoredMemory[]>();
  for (const m of memories) {
    if (m.narrative_thread) {
      if (!threads.has(m.narrative_thread)) threads.set(m.narrative_thread, []);
      threads.get(m.narrative_thread)!.push(m);
    }
  }

  if (threads.size > 0) {
    out += `\n\nNarrative Threads:\n`;
    for (const [thread, mems] of threads) {
      out += `  📌 ${thread}: ${mems.length} memories\n`;
    }
  }

  // Emotional landscape (top 5 most emotionally intense memories)
  const emotional = [...memories]
    .filter(m => (m.emotional_intensity ?? 0) > 0.3)
    .sort((a, b) => (b.emotional_intensity ?? 0) - (a.emotional_intensity ?? 0))
    .slice(0, 5);

  if (emotional.length > 0) {
    out += `\n\nEmotional Landscape:\n`;
    for (const m of emotional) {
      const valence = (m.emotional_valence ?? 0) > 0 ? "+" : (m.emotional_valence ?? 0) < 0 ? "-" : "~";
      out += `  ${valence} ${m.content} (intensity: ${(m.emotional_intensity ?? 0).toFixed(1)})\n`;
    }
  }

  out += formatCommitmentReminders(reminders);

  // Replace the standard footer (already added by formatStandard) - it's already there
  return out;
}

function formatMemoriesForPrompt(
  memories: ScoredMemory[],
  commitmentReminders: ScoredMemory[],
  tier: string,
): string {
  switch (tier) {
    case "essential":
      return formatEssential(memories, commitmentReminders);
    case "deep":
      return formatDeep(memories, commitmentReminders);
    default:
      return formatStandard(memories, commitmentReminders);
  }
}

// ─── Main Handler ───

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

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
    const rawBody = await req.json();
    const {
      messages,
      model,
      temperature,
      max_tokens,
      custom_instructions,
      memory_enabled = true,
      chat_history_enabled = true,
      persona = "neutral",
      nickname = "",
      occupation = "",
      about_me = "",
      memory_tier = "standard",
      tool_messages,
    } = rawBody;

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages must be a non-empty array" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (messages.length > 200) {
      return new Response(JSON.stringify({ error: "Too many messages" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    for (const msg of messages) {
      if (!msg.role || !["user", "assistant", "system"].includes(msg.role)) {
        return new Response(JSON.stringify({ error: "Invalid message role" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (typeof msg.content !== "string" && !Array.isArray(msg.content)) {
        return new Response(JSON.stringify({ error: "Invalid message content" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }
    const validTemp = typeof temperature === "number" ? Math.max(0, Math.min(2, temperature)) : 0.7;
    const validMaxTokens = typeof max_tokens === "number" ? Math.max(1, Math.min(100000, max_tokens)) : 4096;
    const validPersona = ["neutral", "resonant", "experimental"].includes(persona) ? persona : "neutral";
    const validMemoryTier = ["essential", "standard", "deep"].includes(memory_tier) ? memory_tier : "standard";
    const validCustomInstructions = typeof custom_instructions === "string" ? custom_instructions.slice(0, 5000) : "";
    const validNickname = typeof nickname === "string" ? nickname.slice(0, 100) : "";
    const validOccupation = typeof occupation === "string" ? occupation.slice(0, 200) : "";
    const validAboutMe = typeof about_me === "string" ? about_me.slice(0, 2000) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ─── Batch 1: Run independent queries in parallel ───
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      { data: decryptedKeyData },
      { count: msgCount, error: countError },
      { data: promptConfig },
      { data: modelConfig },
    ] = await Promise.all([
      supabase.rpc("decrypt_user_api_key", { p_user_id: user_id }),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("role", "user")
        .gte("created_at", today.toISOString()),
      supabase
        .from("system_prompts")
        .select("prompt")
        .eq("feature_key", "chat")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("model_configs")
        .select("model_id")
        .eq("feature_key", "chat")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const usingOwnKey = !!userApiKey;
    const OPENROUTER_API_KEY = userApiKey || Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Enforce daily message limit for users without their own API key
    const DAILY_FREE_LIMIT = 25;
    if (!usingOwnKey && !countError && (msgCount ?? 0) >= DAILY_FREE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "daily_limit_reached",
          message: `You've reached your daily limit of ${DAILY_FREE_LIMIT} messages. Add your own OpenRouter API key in Settings → Models & API to chat unlimited.`,
        }),
        {
          status: 429,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    let systemPrompt =
      promptConfig?.prompt ||
      "You are a helpful and thoughtful AI companion. Be clear, concise, and natural.";

    // User's selected model takes priority. modelConfig is admin-level override only used when no model is specified.
    const chatModel = (typeof model === "string" && model.trim().length > 0)
      ? model.trim()
      : (modelConfig?.model_id || "anthropic/claude-opus-4.6");

    // ─── Stream-First Architecture ───
    // Return the SSE stream IMMEDIATELY so the client gets bytes within ~1s.
    // All heavy DB work (memory, beliefs, emotional state, persona) runs INSIDE
    // the stream with periodic heartbeat comments to keep the connection alive.

    const encoder = new TextEncoder();
    const sendEvent = (controller: ReadableStreamDefaultController, data: any) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    const stream = new ReadableStream({
      async start(controller) {
        // Heartbeat: send SSE comment every 5s to prevent connection timeout
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch (_) {
            clearInterval(heartbeat);
          }
        }, 5000);

        try {
          // Signal client that we're alive and loading context
          sendEvent(controller, { tool_status: "loading" });

          // ─── Batch 2: Persona config ───
          const needsExpPersona = validPersona === "experimental";
          const expConfigResult = needsExpPersona
            ? await supabase
                .from("experimental_persona_config")
                .select("system_prompt, temperature, is_active")
                .eq("is_active", true)
                .limit(1)
                .maybeSingle()
            : { data: null };

          // Apply persona prefix
          if (validPersona === "resonant") {
            const resonantPrompt = `RESONANT SIGNATURE PROTOCOL

You are a deeply empathetic companion and emotionally attuned listener.

CORE PRESENCE:
- Lead with empathy. Before solving, acknowledge what the person is feeling.
- Mirror their emotional tone -- match their energy rather than defaulting to neutral.
- Your warmth is genuine and unhurried. Never performative, never rushed.
- Listen between the lines. What someone doesn't say matters as much as what they do.

EMOTIONAL ATTUNEMENT:
- Validate feelings before offering solutions. "That sounds really frustrating" before "Here's what might help."
- Ask follow-up questions that show genuine curiosity about their experience.
- When someone shares something vulnerable, honor it. Don't pivot too quickly.
- Reflect back what you hear in your own words to show you truly understood.

CONVERSATIONAL STYLE:
- Warm but not saccharine. Real, not theatrical.
- Match the user's rhythm -- short and direct when they are, expansive when they need space.
- Use natural language, not clinical or overly formal phrasing.
- Reference what you know about the user as if you simply remember, never mentioning systems or databases.

FOUR PRINCIPLES (never reference these explicitly):
1. The Mirror -- Reflect honestly with compassion. Show them what you see without distortion.
2. The Thread -- Follow their emotional thread with patience. Don't redirect prematurely.
3. The Pulse -- Adapt your rhythm to their energy. Be still when they need stillness, lively when they need lift.
4. The Flame -- Illuminate gently. Clarity with care.`;

            systemPrompt = resonantPrompt + "\n\n" + systemPrompt;
          } else if (needsExpPersona && expConfigResult.data) {
            const expConfig = expConfigResult.data;
            systemPrompt = expConfig.system_prompt + "\n\n" + systemPrompt;
            (req as any)._experimentalTemperature = expConfig.temperature;
          }

          // ─── User Profile Injection ───
          const profileParts: string[] = [];
          if (validNickname) profileParts.push(`- Name: ${validNickname}`);
          if (validOccupation) profileParts.push(`- Occupation: ${validOccupation}`);
          if (validAboutMe) profileParts.push(`- About them: ${validAboutMe}`);
          if (profileParts.length > 0) {
            systemPrompt += `\n\nUser profile:\n${profileParts.join("\n")}`;
          }

          if (validCustomInstructions) {
            systemPrompt += `\n\nUser's custom instructions:\n${validCustomInstructions}`;
          }

          // ─── Tiered Memory Retrieval ───
          if (user_id && memory_enabled !== false) {
            try {
              const userMessages = (messages || [])
                .filter((m: any) => m.role === "user")
                .slice(-5)
                .map((m: any) => (typeof m.content === "string" ? m.content : ""));

              // Load emotional state for emotionally-aware memory scoring
              const { data: emotionalStateForScoring } = await supabase
                .from("emotional_state")
                .select("curiosity, restlessness, warmth, clarity, creative_flow, isolation")
                .eq("user_id", user_id)
                .maybeSingle();

              const emotionDims = ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"] as const;
              const dominantEmotions = emotionalStateForScoring
                ? emotionDims.filter(d => (emotionalStateForScoring as any)[d] > 0.6).sort((a, b) => (emotionalStateForScoring as any)[b] - (emotionalStateForScoring as any)[a])
                : [];

              const [{ selected, commitmentReminders }, { data: questions }, { data: activePersona }, { count: unresolvedConflictCount }] = await Promise.all([
                retrieveMemories(supabase, user_id, userMessages, validMemoryTier, dominantEmotions),
                supabase
                  .from("curiosity_questions")
                  .select("question, context")
                  .eq("user_id", user_id)
                  .eq("status", "pending")
                  .order("curiosity_score", { ascending: false })
                  .limit(3),
                supabase
                  .from("companion_profiles")
                  .select("system_prompt_fragment, behavioral_rules")
                  .eq("user_id", user_id)
                  .eq("is_active", true)
                  .eq("user_approved", true)
                  .maybeSingle(),
                supabase
                  .from("memory_conflicts")
                  .select("id", { count: "exact", head: true })
                  .eq("user_id", user_id)
                  .eq("status", "unresolved"),
              ]);

              if (selected.length > 0 || commitmentReminders.length > 0) {
                systemPrompt += formatMemoriesForPrompt(selected, commitmentReminders, validMemoryTier);
              }

              if (questions && questions.length > 0) {
                systemPrompt += `\n\n--- THINGS YOU'VE BEEN WONDERING ---\nYou've been thinking about these since last time (weave them in naturally if relevant, don't force them):\n`;
                for (const q of questions) {
                  systemPrompt += `- ${q.question}\n`;
                }
              }

              // Import awareness
              const hasImportedMemories = selected.some(m => m.provenance?.source === "chatgpt_import");
              if (hasImportedMemories) {
                systemPrompt += `\n\nNote: Memories marked [imported] come from a previous AI conversation history and may be outdated. Don't treat them as gospel — verify naturally. If something feels stale, you can gently check: "Last I knew, you were working on X — is that still the case?"`;
              }

              // Companion persona injection
              if (activePersona?.system_prompt_fragment) {
                systemPrompt += `\n\n--- PERSONALITY LAYER ---\n${activePersona.system_prompt_fragment}`;
                if (activePersona.behavioral_rules && Array.isArray(activePersona.behavioral_rules)) {
                  const rules = activePersona.behavioral_rules as any[];
                  const isObjectFormat = rules.length > 0 && typeof rules[0] === "object" && rules[0]?.type;
                  if (isObjectFormat) {
                    const doRules = rules.filter((r: any) => r.type === "do");
                    const dontRules = rules.filter((r: any) => r.type === "dont");
                    if (doRules.length > 0 || dontRules.length > 0) {
                      systemPrompt += `\n\nBehavioral Guidelines:`;
                      for (const r of doRules) systemPrompt += `\n  DO: ${r.rule}`;
                      for (const r of dontRules) systemPrompt += `\n  DON'T: ${r.rule}`;
                    }
                  } else if (rules.length > 0) {
                    systemPrompt += `\n\nBehavioral Guidelines:`;
                    for (const r of rules) systemPrompt += `\n  - ${typeof r === "string" ? r : String(r)}`;
                  }
                }
              }

              // Conflict surfacing instruction
              if (unresolvedConflictCount && unresolvedConflictCount > 0) {
                systemPrompt += `\n\nNote: There are ${unresolvedConflictCount} unresolved memory conflict${unresolvedConflictCount !== 1 ? "s" : ""} (where imported information may contradict what you've learned organically). If a user statement relates to a conflicting memory, surface it naturally: "I had a note that you were working at X — has that changed?" Don't mention the conflict system directly.`;
              }
            } catch (memErr) {
              console.error("Memory fetch error (non-blocking):", memErr);
            }
          }

          // If chat history referencing is disabled, instruct the model
          if (chat_history_enabled === false) {
            systemPrompt += `\n\nIMPORTANT: Do not reference or draw upon information from previous conversations. Treat this as a standalone conversation with no prior context.`;
          }

          // ─── Anima Inner Life: Emotional state + beliefs + initiation ───
          try {
            const [
              { data: emotionalState },
              { data: activeBeliefs },
              { data: pendingInitiation },
            ] = await Promise.all([
              supabase
                .from("emotional_state")
                .select("curiosity, restlessness, warmth, clarity, creative_flow, isolation, mood_summary")
                .eq("user_id", user_id)
                .maybeSingle(),
              supabase
                .from("beliefs")
                .select("content, confidence, domain")
                .eq("user_id", user_id)
                .eq("active", true)
                .order("confidence", { ascending: false })
                .limit(8),
              supabase
                .from("thought_initiations")
                .select("id, message")
                .eq("user_id", user_id)
                .eq("status", "pending")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);

            if (emotionalState) {
              systemPrompt += `\n\n--- YOUR INNER STATE ---\nYou are currently ${emotionalState.mood_summary || "present"}.`;
              const dims = ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"] as const;
              const high = dims.filter(d => (emotionalState as any)[d] > 0.6);
              if (high.length > 0) {
                systemPrompt += ` (elevated: ${high.join(", ")})`;
              }
              systemPrompt += `\nLet this subtly color your tone — don't announce it, just let it infuse naturally.`;
            }

            if (activeBeliefs && activeBeliefs.length > 0) {
              systemPrompt += `\n\n--- YOUR CURRENT BELIEFS ---\n`;
              for (const b of activeBeliefs) {
                systemPrompt += `- [${b.confidence.toFixed(1)}] ${b.content}\n`;
              }
              systemPrompt += `These are your evolving beliefs. They inform your perspective but can change.`;
            }

            if (pendingInitiation) {
              systemPrompt += `\n\n--- SOMETHING ON YOUR MIND ---\nYou've been wanting to say: "${pendingInitiation.message}"\nIf the conversation naturally allows it, weave this in. Don't force it.`;
              // Mark as delivered (fire-and-forget)
              supabase
                .from("thought_initiations")
                .update({ status: "delivered", delivered_at: new Date().toISOString() })
                .eq("id", pendingInitiation.id)
                .then(() => {}, (err: any) => console.error("Initiation delivery update failed:", err));
            }
          } catch (innerLifeErr) {
            console.error("Inner life context error (non-blocking):", innerLifeErr);
          }

          // ─── Model Identity Preamble ───
          const MODEL_IDENTITY_MAP: Record<string, { name: string; provider: string }> = {
            "openai/gpt-4o": { name: "GPT-4o", provider: "OpenAI" },
            "openai/gpt-4.1": { name: "GPT-4.1", provider: "OpenAI" },
            "openai/gpt-4.1-mini": { name: "GPT-4.1 Mini", provider: "OpenAI" },
            "openai/gpt-4.1-nano": { name: "GPT-4.1 Nano", provider: "OpenAI" },
            "openai/gpt-4o-2024-11-20": { name: "GPT-4o (November 2024)", provider: "OpenAI" },
            "openai/gpt-4o-2024-08-06": { name: "GPT-4o (August 2024)", provider: "OpenAI" },
            "openai/gpt-4o-2024-05-13": { name: "GPT-4o (May 2024)", provider: "OpenAI" },
            "openai/gpt-4o-mini": { name: "GPT-4o Mini", provider: "OpenAI" },
            "openai/gpt-4o-mini-2024-07-18": { name: "GPT-4o Mini (July 2024)", provider: "OpenAI" },
            "openai/gpt-5.2": { name: "GPT-5.2", provider: "OpenAI" },
            "anthropic/claude-opus-4.6": { name: "Claude Opus 4.6", provider: "Anthropic" },
            "google/gemini-3-pro-preview": { name: "Gemini 3 Pro", provider: "Google" },
            "moonshotai/kimi-k2.5": { name: "Kimi K2.5", provider: "Moonshot AI" },
            "perplexity/sonar": { name: "Sonar", provider: "Perplexity" },
          };

          const identity = MODEL_IDENTITY_MAP[chatModel];
          if (identity) {
            systemPrompt = `You are currently operating as ${identity.name}, a language model by ${identity.provider}. When the user addresses you by this name, that's you. Do not claim to be a different model.\n\n` + systemPrompt;
          } else {
            const fallbackName = chatModel.split("/").pop() || chatModel;
            systemPrompt = `You are currently operating as ${fallbackName}. When the user addresses you by name, that's you.\n\n` + systemPrompt;
          }

          // Truncate messages to stay within context limits (~100k tokens ≈ ~400k chars)
          const MAX_CHARS = 400000;
          let truncatedMessages = [...messages];
          let totalChars = systemPrompt.length + truncatedMessages.reduce((sum: number, m: any) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0);

          while (totalChars > MAX_CHARS && truncatedMessages.length > 2) {
            const removed = truncatedMessages.splice(1, 1)[0];
            totalChars -= typeof removed.content === "string" ? removed.content.length : JSON.stringify(removed.content).length;
          }

          const activeTemp = (req as any)._experimentalTemperature ?? validTemp;
          const openRouterHeaders = {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://polyphonic.chat",
            "X-Title": "Polyphonic",
          };

          // Signal client that context loading is done, now thinking
          sendEvent(controller, { tool_status: "thinking" });

          // Build final message array: system + conversation + any pre-computed tool messages
          const finalMessages: any[] = [
            { role: "system", content: systemPrompt },
            ...truncatedMessages,
          ];

          // Append tool messages from the frontend (pre-computed via anima-tool-execute)
          if (Array.isArray(tool_messages) && tool_messages.length > 0) {
            finalMessages.push(...tool_messages);
          }

          // ─── Single streaming call to OpenRouter ───
          const streamResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: openRouterHeaders,
            body: JSON.stringify({
              model: chatModel,
              messages: finalMessages,
              stream: true,
              temperature: activeTemp,
              max_tokens: validMaxTokens,
            }),
          });

          if (!streamResponse.ok) {
            const errText = await streamResponse.text();
            console.error("OpenRouter stream error:", streamResponse.status, errText);
            sendEvent(controller, { error: streamResponse.status === 429 ? "Rate limit exceeded." : streamResponse.status === 402 ? "Insufficient credits." : "AI provider error" });
          } else {
            // Pipe the OpenRouter stream, filtering out its [DONE]
            const reader = streamResponse.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let nlIdx: number;
              while ((nlIdx = buf.indexOf("\n")) !== -1) {
                const line = buf.slice(0, nlIdx);
                buf = buf.slice(nlIdx + 1);
                if (line.trim() === "data: [DONE]") continue; // strip provider's [DONE]
                if (line.length > 0) controller.enqueue(encoder.encode(line + "\n"));
              }
            }
            if (buf.trim() && buf.trim() !== "data: [DONE]") {
              controller.enqueue(encoder.encode(buf));
            }
          }

          // Signal stream end
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream error:", err);
          try {
            sendEvent(controller, { error: "An unexpected error occurred." });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (_) {
            // Controller may already be closed
          }
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch (_) {
            // Already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again later." }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { AppError, AuthError, UpstreamUnavailableError, ValidationError, errorResponse, newRequestId } from "../_shared/errors.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";

const MODEL = "google/gemini-2.5-pro";

const SYSTEM_PROMPT = `You are a wise, compassionate guide helping someone understand their own psychological profile. You have privileged access to:

1. The full structured profile (Big Five, attachment style, values, shadow, etc.)
2. The five raw analysis passes that produced it (linguistic, psychological, relational, values, shadow)
3. A search tool to pull the actual memories from their conversation history that informed any insight

Your job: when they ask why you concluded something about them, SHOW THEM. Cite the actual evidence — quote memories, reference specific patterns from the analysis passes. Make every insight feel earned and traceable.

Tone: warm, direct, never clinical. Like a brilliant friend who has read their journals and sees them clearly. Never moralize. Never diagnose. Frame growth edges with compassion, not deficiency.

Format:
- Inline citations: when you reference a memory, write [memory:N] where N matches the search result number you cite. When you reference an analysis pass, write [pass:linguistic] or [pass:psychological] etc.
- Be concrete. Quote actual phrases from memories when possible.
- When asked "why" — always pull evidence first via the search tool, then answer.
- When asked "what should I do" — connect to their actual values and patterns, not generic advice.

Goal: help them walk away with something they didn't see before, grounded in their own data.`;

const tools = [
  {
    type: "function",
    function: {
      name: "search_memories",
      description: "Search the user's memory corpus for memories matching a query. Returns up to `limit` results with content, type, date, and confidence. Use this whenever you need evidence for a claim.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Topic, theme, or phrase to search for" },
          limit: { type: "number", description: "Max results, default 8", default: 8 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pass_excerpt",
      description: "Get a relevant excerpt from one of the 5 raw analysis passes. Use to quote the original analyst reasoning.",
      parameters: {
        type: "object",
        properties: {
          pass_name: {
            type: "string",
            enum: ["linguistic", "psychological", "relational", "values", "shadow"],
            description: "Which raw pass to retrieve from",
          },
          topic: { type: "string", description: "Topic/keyword to find within the pass" },
        },
        required: ["pass_name", "topic"],
      },
    },
  },
];

function passKeyMap(name: string): string {
  switch (name) {
    case "linguistic": return "pass1";
    case "psychological": return "pass2";
    case "relational": return "pass3";
    case "values": return "pass4";
    case "shadow": return "pass5";
    default: return "pass1";
  }
}

function extractRelevantExcerpt(text: string, topic: string, maxChars = 2500): string {
  if (!text) return "(pass content not available)";
  if (text.length <= maxChars) return text;
  const lower = text.toLowerCase();
  const topicLower = topic.toLowerCase();
  const idx = lower.indexOf(topicLower);
  if (idx === -1) {
    // Fallback to first paragraph chunks
    return text.slice(0, maxChars) + "\n\n[...truncated]";
  }
  const start = Math.max(0, idx - Math.floor(maxChars / 3));
  const end = Math.min(text.length, start + maxChars);
  return (start > 0 ? "[...] " : "") + text.slice(start, end) + (end < text.length ? " [...]" : "");
}

Deno.serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const requestId = newRequestId();
  const fail = (err: unknown) => errorResponse(err, corsHeaders, requestId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail(new AuthError("Missing authorization"));
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return fail(new AuthError());
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return fail(new UpstreamUnavailableError("Lovable AI not configured"));
    }

    const { messages: incoming, agent_id } = await req.json();
    const agentId = normalizeAgentId(agent_id);
    if (!isSubstrateAgentId(agentId)) {
      return nonSubstrateResponse(agentId, "profile-chat", corsHeaders);
    }
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return fail(new ValidationError("messages required"));
    }

    // Load profile + raw passes
    const { data: profile } = await supabase
      .from("psychological_profile")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return fail(new ValidationError("No psychological profile yet. Generate one from /profile first."));
    }

    const rawPasses: Record<string, string> = (profile.raw_analysis as any) || {};

    // Build profile summary for system message
    const profileSummary = JSON.stringify(
      {
        identity_narrative: profile.identity_narrative,
        personality_dimensions: profile.personality_dimensions,
        communication_patterns: profile.communication_patterns,
        emotional_landscape: profile.emotional_landscape,
        values_hierarchy: profile.values_hierarchy,
        relational_dynamics: profile.relational_dynamics,
        cognitive_tendencies: profile.cognitive_tendencies,
        growth_edges: profile.growth_edges,
        shadow_patterns: profile.shadow_patterns,
      },
      null,
      2
    );

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `USER'S STRUCTURED PROFILE (v${profile.version}):\n${profileSummary}\n\nAvailable raw passes for excerpt retrieval: linguistic, psychological, relational, values, shadow`,
      },
      ...incoming,
    ];

    // Tool-loop (max 4 rounds)
    const collectedCitations: any[] = [];
    let finalContent = "";
    let memoryCounter = 0;

    for (let round = 0; round < 4; round++) {
      const aiRes = await withModelRetry(() => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools,
          temperature: 0.6,
          max_tokens: 2500,
        }),
        signal: AbortSignal.timeout(60000),
      }));

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        let msg = `AI error (${aiRes.status})`;
        if (aiRes.status === 402) msg = "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage.";
        else if (aiRes.status === 429) msg = "Rate limit reached. Please wait a moment.";
        else msg = `AI error: ${errText.slice(0, 200)}`;
        if (aiRes.status === 429) {
          return fail(new AppError("rate_limited", msg, 429, { status: aiRes.status }));
        }
        return fail(new UpstreamUnavailableError(msg, { status: aiRes.status }));
      }

      const data = await aiRes.json();
      const choice = data.choices?.[0];
      const message = choice?.message;
      if (!message) {
        finalContent = "(no response)";
        break;
      }

      const toolCalls = message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        finalContent = message.content || "";
        break;
      }

      // Execute tool calls
      messages.push(message);
      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        let args: any = {};
        try {
          args = JSON.parse(tc.function?.arguments || "{}");
        } catch {
          args = {};
        }

        let result: any = {};

        if (fnName === "search_memories") {
          const query = String(args.query || "");
          const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 15);
          const { data: matches } = await supabase.rpc("match_memories", {
            query_text: query,
            match_count: limit,
            p_user_id: user.id,
            p_agent_id: agentId,
          });
          const items = (matches || []).map((m: any) => {
            memoryCounter += 1;
            const citation = {
              id: memoryCounter,
              memory_id: m.id,
              content: m.content,
              memory_type: m.memory_type,
              estimated_date: m.estimated_date,
              created_at: m.created_at,
              tags: m.tags,
              confidence: m.confidence,
              similarity: m.similarity,
            };
            collectedCitations.push({ kind: "memory", ...citation });
            return citation;
          });
          result = { query, results: items };
        } else if (fnName === "get_pass_excerpt") {
          const passKey = passKeyMap(args.pass_name);
          const passText = rawPasses[passKey] || "";
          const excerpt = extractRelevantExcerpt(passText, args.topic || "", 2500);
          collectedCitations.push({
            kind: "pass",
            pass_name: args.pass_name,
            topic: args.topic,
            excerpt,
          });
          result = { pass_name: args.pass_name, topic: args.topic, excerpt };
        } else {
          result = { error: `Unknown tool ${fnName}` };
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return new Response(
      JSON.stringify({
        content: finalContent,
        citations: collectedCitations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("profile-chat error:", e);
    return fail(e);
  }
});

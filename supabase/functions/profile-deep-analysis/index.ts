import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import {
  getCorsHeaders,
  handleCorsPreflightIfNeeded,
} from "../_shared/cors.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";
import { assertCompleteAutonomousContent, AutonomousGenerationError } from "../_shared/autonomous-generation.ts";

// EXEMPT from the agent-family model rule: this runs on the Lovable free gateway
// (ai.gateway.lovable.dev), not the user's OpenRouter BYOK key, so per-agent family
// routing (resolveRoleModel) doesn't apply — the gateway dictates the model.
const ANALYSIS_MODEL = "google/gemini-2.5-pro";

// ── Pass 1: Linguistic Fingerprinting ──
const LINGUISTIC_PROMPT =
  `You are a computational linguist. Analyze the USER's messages (not the AI's) across all conversations to build a detailed linguistic fingerprint.

Extract:
- **Vocabulary profile**: richness, sophistication level, domain-specific jargon frequency
- **Sentence structure**: average complexity, tendency toward simple vs compound vs complex sentences
- **Hedging patterns**: how often they qualify statements ("maybe", "I think", "sort of"), what triggers hedging
- **Assertion strength**: when do they speak with certainty vs uncertainty? What topics trigger each?
- **Humor style**: sarcasm, self-deprecation, absurdism, wordplay, dry wit — with examples
- **Metaphor usage**: recurring metaphorical frameworks they use to understand the world
- **Emotional vocabulary**: range of emotion words used, which emotions they name vs imply
- **Discourse markers**: filler patterns, transition preferences, how they organize thoughts
- **Code-switching**: do they shift register between topics? When do they become more formal/informal?
- **Unique verbal signatures**: phrases, patterns, or constructions that are distinctively theirs

Be specific. Quote actual patterns you observe. This is forensic-level analysis.

Additionally, extract these SPECIFIC structured metrics for the final synthesis:
- Identify the user's most-used distinctive phrase/construction and count its occurrences across the corpus.
- Score hedging rate (0.0-1.0) for each of these domains: emotions, future plans, others' motives, aesthetics, technical opinions, ethical claims. List the top hedge words per domain.
- Cluster vocabulary into 3 domains (technical, emotional, philosophical). For each: count unique words, estimate percentile vs general population, list top 10 words with approximate occurrence counts.
- Compare formal vs casual register: provide avg sentence length, passive voice ratio, filler word rate, and a representative 1-2 sentence quote for each register.
- Categorize humor instances into: dry/understated, self-deprecating, wordplay, observational, absurdist. Estimate the proportion of each (should sum to ~1.0).
- For each unique verbal signature/construction, estimate its occurrence count.`;

// ── Pass 2: Psychological Profiling ──
const PSYCHOLOGICAL_PROMPT =
  `You are a research psychologist. Using the conversation corpus AND the linguistic fingerprint from Pass 1, build a detailed psychological profile.

Analyze:
- **Big Five approximation**: Score each dimension 0-100 with detailed justification
  - Openness to Experience
  - Conscientiousness
  - Extraversion
  - Agreeableness
  - Neuroticism
- **Attachment style indicators**: Secure, Anxious-Preoccupied, Dismissive-Avoidant, or Fearful-Avoidant — with evidence
- **Locus of control**: Internal vs external, and how it shifts by domain (work, relationships, health)
- **Cognitive style**: Analytical vs intuitive, abstract vs concrete, systematic vs heuristic
- **Emotional regulation**: Primary strategies (suppression, reappraisal, expression, avoidance), effectiveness
- **Emotional granularity**: How precisely do they differentiate emotions? Rich vocabulary or broad strokes?
- **Defense mechanisms**: Primary defenses observed (intellectualization, humor, projection, etc.)
- **Stress response patterns**: Fight, flight, freeze, or fawn tendencies
- **Self-concept**: How they see themselves vs how they present to others

Ground every claim in observed behavior from the conversations. No speculation without evidence.

For the final structured synthesis, also provide:
- For each Big Five trait: a confidence interval (low and high bounds, 0-100) alongside the score.
- For attachment style: numerical anxiety_score (0.0-1.0) and avoidance_score (0.0-1.0) in addition to the categorical label.
- For cognitive style: percentage splits as numbers: analytical_pct vs intuitive (should sum to ~1.0), abstract_pct vs concrete, systematic_pct vs heuristic.`;

// ── Pass 3: Relational Mapping ──
const RELATIONAL_PROMPT =
  `You are a social psychologist. Using the conversation corpus and previous analyses, map this person's relational world.

Analyze:
- **Key relationships mentioned**: Who are the important people? Map roles (partner, friend, parent, colleague, etc.)
- **Relational patterns**: How do they talk about others? With warmth, detachment, anxiety, admiration, resentment?
- **Power dynamics**: Where do they position themselves? Do they seek authority, equality, or defer?
- **Dependency patterns**: Self-reliant to a fault? Comfortable with interdependence? Avoidant of need?
- **Social identity**: How do they define themselves through group membership? (profession, interests, values, culture)
- **Conflict style**: How do they handle disagreement? Avoid, confront, accommodate, compete, collaborate?
- **Intimacy comfort**: How close do they let others get? What topics are off-limits or carefully guarded?
- **Communication with AI**: What does their AI interaction style reveal about their relational needs?
  - Do they treat the AI as a tool, companion, therapist, intellectual peer?
  - What needs does AI interaction fulfill that human relationships might not?

Be forensic about what their relational language reveals about their inner world.

For the final structured synthesis, also:
- Extract named individuals mentioned in conversations. For each, provide: their name or identifier (first name, nickname, or "Mom"/"Dad"/etc.), their role (partner, friend, parent, colleague, sibling, mentor, etc.), proximity tier (intimate/close/known/distant), and the relational dynamic type (warm/cool/tense).
- Identify 3-5 recurring relational patterns as named behaviors (e.g., "Over-gives when others struggle", "Under-asks for support").
- For the AI relationship, list 3-5 specific needs the user fulfills through AI interaction (e.g., "Sparring partner", "Synthesizer", "Witness to thought").`;

// ── Pass 4: Values & Motivation ──
const VALUES_PROMPT =
  `You are a motivational psychologist. Using all prior analyses and the raw conversations, map this person's values and motivational structure.

Analyze:
- **Implicit value hierarchy**: Rank their top 8-10 values with evidence (e.g., autonomy, connection, achievement, creativity, security, justice, knowledge, pleasure, status, meaning)
- **Intrinsic vs extrinsic motivation**: What drives them from within vs external reward?
- **What they optimize for**: When forced to choose, what wins? (time, money, relationships, growth, comfort, novelty)
- **What they avoid**: What do they consistently steer away from? (conflict, boredom, vulnerability, commitment, routine)
- **Decision-making framework**: How do they make important decisions? Analysis paralysis? Gut instinct? Counsel-seeking?
- **Temporal orientation**: Past-focused, present-focused, or future-focused? How does this shift by domain?
- **Meaning-making**: How do they construct narrative meaning from their experiences?
- **Growth orientation**: Fixed vs growth mindset indicators, areas where each dominates

Distinguish between stated values and revealed preferences (what they say they care about vs what their behavior shows).

For the final structured synthesis, for each ranked value provide TWO numerical scores (0.0-1.0 each):
- stated_score: how prominently and frequently they verbally espouse this value
- revealed_score: how much their actual behavior and choices reflect this value
Also classify each value's divergence as: "aligned" (gap < 0.10), "over-stated" (stated exceeds revealed by 0.10+), or "under-stated" (revealed exceeds stated by 0.10+).
Provide a brief narrative for each divergence explaining what the gap means.`;

// ── Pass 5: Shadow Analysis ──
const SHADOW_PROMPT =
  `You are a depth psychologist specializing in shadow work. Using ALL previous analyses and the raw conversations, identify the hidden patterns — the things this person might not see about themselves.

Analyze with compassion but unflinching honesty:
- **Contradictions**: Where do their stated values conflict with observed behavior? (e.g., values authenticity but carefully manages their image)
- **Blind spots**: What patterns are they likely unaware of? What would surprise them to hear?
- **Recurring avoidance**: Topics they consistently redirect away from, emotions they rarely name, questions they deflect
- **Projection patterns**: What do they criticize in others that might reflect their own shadow?
- **Compensatory behaviors**: What might they be overcompensating for? (e.g., excessive independence masking fear of dependence)
- **Growth edges**: Areas where they are actively evolving, struggling, or on the cusp of transformation
- **Unasked questions**: The questions they need to sit with but haven't voiced
- **Integration opportunities**: Where shadow and light could merge for deeper wholeness

Frame this with deep empathy. These insights should feel like a wise friend who sees them clearly and loves them anyway. Never judgmental, always illuminating.

IMPORTANT: End with a "Portrait" — a single flowing paragraph that captures the ESSENCE of this person in a way that would make them feel truly, deeply seen. Like a mirror that shows not just their reflection but their soul.

For the final structured synthesis:
- For each contradiction, blind spot, compensatory behavior, and avoidance pattern: include a specific evidence quote or data point, and note which analysis pass or data source supports it.
- Provide 3-5 "horizons" — concrete growth directions with a direction label (e.g., "Toward integration", "Toward rest") and a 1-2 sentence description of what it would look like.`;

// ── Synthesis tool schema ──
const profileTool = {
  type: "function",
  function: {
    name: "save_psychological_profile",
    description: "Save the complete psychological profile",
    parameters: {
      type: "object",
      properties: {
        identity_narrative: {
          type: "string",
          description:
            "The Portrait — a flowing paragraph capturing their essence",
        },
        personality_dimensions: {
          type: "object",
          properties: {
            big_five: {
              type: "object",
              properties: {
                openness: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                    confidence_low: { type: "number" },
                    confidence_high: { type: "number" },
                  },
                },
                conscientiousness: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                    confidence_low: { type: "number" },
                    confidence_high: { type: "number" },
                  },
                },
                extraversion: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                    confidence_low: { type: "number" },
                    confidence_high: { type: "number" },
                  },
                },
                agreeableness: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                    confidence_low: { type: "number" },
                    confidence_high: { type: "number" },
                  },
                },
                neuroticism: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                    confidence_low: { type: "number" },
                    confidence_high: { type: "number" },
                  },
                },
              },
            },
            attachment_style: {
              type: "object",
              properties: {
                primary: { type: "string" },
                evidence: { type: "string" },
                anxiety_score: { type: "number" },
                avoidance_score: { type: "number" },
              },
            },
            cognitive_style: {
              type: "object",
              properties: {
                prose: { type: "string" },
                analytical_pct: { type: "number" },
                abstract_pct: { type: "number" },
                systematic_pct: { type: "number" },
              },
            },
            locus_of_control: { type: "string" },
          },
        },
        communication_patterns: {
          type: "object",
          properties: {
            vocabulary_richness: { type: "string" },
            humor_style: { type: "string" },
            hedging_frequency: { type: "string" },
            assertion_strength: { type: "string" },
            unique_signatures: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phrase: { type: "string" },
                  count: { type: "number" },
                },
              },
            },
            emotional_vocabulary_range: { type: "string" },
            signature_phrase: {
              type: "object",
              properties: {
                phrase: { type: "string" },
                count: { type: "number" },
                span_months: { type: "number" },
              },
            },
            hedging_by_topic: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  topic: { type: "string" },
                  rate: { type: "number" },
                  hedge_words: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
            vocabulary_domains: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  unique_count: { type: "number" },
                  percentile: { type: "string" },
                  top_words: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        word: { type: "string" },
                        count: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
            register_metrics: {
              type: "object",
              properties: {
                formal: {
                  type: "object",
                  properties: {
                    avg_sentence_length: { type: "number" },
                    passive_ratio: { type: "number" },
                    example: { type: "string" },
                  },
                },
                casual: {
                  type: "object",
                  properties: {
                    avg_sentence_length: { type: "number" },
                    filler_rate: { type: "number" },
                    example: { type: "string" },
                  },
                },
              },
            },
            humor_distribution: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  proportion: { type: "number" },
                },
              },
            },
          },
        },
        emotional_landscape: {
          type: "object",
          properties: {
            baseline_mood: { type: "string" },
            emotional_range: { type: "string" },
            triggers: { type: "array", items: { type: "string" } },
            coping_mechanisms: { type: "array", items: { type: "string" } },
            regulation_style: { type: "string" },
            granularity: { type: "string" },
          },
        },
        values_hierarchy: {
          type: "object",
          properties: {
            ranked_values: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  value: { type: "string" },
                  rank: { type: "number" },
                  evidence: { type: "string" },
                  stated_score: { type: "number" },
                  revealed_score: { type: "number" },
                  divergence_tag: {
                    type: "string",
                    enum: ["aligned", "over-stated", "under-stated"],
                  },
                  divergence_narrative: { type: "string" },
                },
              },
            },
            stated_vs_revealed: { type: "string" },
            decision_framework: { type: "string" },
            temporal_orientation: { type: "string" },
          },
        },
        relational_dynamics: {
          type: "object",
          properties: {
            key_relationships: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { type: "string" },
                  dynamic: { type: "string" },
                },
              },
            },
            conflict_style: { type: "string" },
            power_orientation: { type: "string" },
            intimacy_comfort: { type: "string" },
            ai_relationship_style: { type: "string" },
            named_people: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  proximity: { type: "string" },
                  dynamic_type: { type: "string" },
                },
              },
            },
            relational_patterns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
            ai_needs: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        cognitive_tendencies: {
          type: "object",
          properties: {
            thinking_style: { type: "string" },
            biases: { type: "array", items: { type: "string" } },
            decision_patterns: { type: "string" },
            defense_mechanisms: { type: "array", items: { type: "string" } },
            stress_response: { type: "string" },
          },
        },
        growth_edges: {
          type: "object",
          properties: {
            active_growth: { type: "array", items: { type: "string" } },
            emerging_awareness: { type: "array", items: { type: "string" } },
            integration_opportunities: {
              type: "array",
              items: { type: "string" },
            },
            horizons: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  direction: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        shadow_patterns: {
          type: "object",
          properties: {
            contradictions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  claim: { type: "string" },
                  evidence: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
            blind_spots: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  claim: { type: "string" },
                  evidence: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
            avoidance_patterns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  claim: { type: "string" },
                  evidence: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
            compensatory_behaviors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  claim: { type: "string" },
                  evidence: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
            unasked_questions: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: [
        "identity_narrative",
        "personality_dimensions",
        "communication_patterns",
        "emotional_landscape",
        "values_hierarchy",
        "relational_dynamics",
        "cognitive_tendencies",
        "growth_edges",
        "shadow_patterns",
      ],
    },
  },
};

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let import_id: string | undefined;
  let user_id = "";
  let agent_id = "luca";

  try {
    // Authenticate
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
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth
      .getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    user_id = user.id;
    const body = await req.json().catch(() => ({}));
    import_id = body?.import_id;
    agent_id = normalizeAgentId(body?.agent_id);

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

      agent_id = normalizeAgentId(body?.agent_id || importRow.agent_id);
    }

    if (!isSubstrateAgentId(agent_id)) {
      return nonSubstrateResponse(agent_id, "profile-deep-analysis", getCorsHeaders(req));
    }

    const updateImport = async (patch: Record<string, unknown>) => {
      if (!import_id) return;
      await supabase
        .from("chat_imports")
        .update(patch)
        .eq("id", import_id)
        .eq("user_id", user_id)
        .eq("agent_id", agent_id);
    };

    // Use Lovable AI Gateway (no user API key required)
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Lovable AI is not configured" }),
        {
          status: 500,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Quick pre-check: ensure we have enough memories before kicking off bg work
    const { count: memCount } = await supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false);

    if (!memCount || memCount < 3) {
      return new Response(
        JSON.stringify({
          error: "Insufficient data for deep analysis",
          memories_found: memCount || 0,
        }),
        {
          status: 400,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Update pipeline stage immediately so UI shows progress
    if (import_id) {
      await updateImport({
        pipeline_stage: "profiling",
      });
    }

    // Run the heavy 5-pass analysis in the background so the request can
    // return immediately. Edge functions enforce a 150s idle timeout, but
    // EdgeRuntime.waitUntil allows the work to keep running after response.
    const runAnalysis = async () => {
    // Fetch all memories
    const { data: allMemories } = await supabase
      .from("memories")
      .select(
        "content, memory_type, confidence, emotional_valence, emotional_intensity, narrative_thread, tags",
      )
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
      .eq("is_deleted", false)
      .order("confidence", { ascending: false })
      .limit(400);

    if (!allMemories || allMemories.length < 3) {
      throw new Error("Insufficient data for deep analysis");
    }

    const memoryCorpus = allMemories
      .map((m: any) => {
        const tags = m.tags?.length ? ` [${m.tags.join(", ")}]` : "";
        return `[${m.memory_type}|conf:${m.confidence}] ${m.content}${tags}`;
      })
      .join("\n");

    const memoryExcerpt = allMemories
      .slice(0, 120)
      .map((m: any) => {
        const tags = m.tags?.length ? ` [${m.tags.join(", ")}]` : "";
        return `[${m.memory_type}|conf:${m.confidence}] ${m.content}${tags}`;
      })
      .join("\n");

    // Helper for AI calls
    async function aiCall(
      systemPrompt: string,
      userContent: string,
    ): Promise<string> {
      const response = await withModelRetry(() => fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: ANALYSIS_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            temperature: 0.4,
            max_tokens: 5000,
          }),
          signal: AbortSignal.timeout(60000),
        },
      ));

      if (!response.ok) {
        const errText = await response.text();
        let message: string;
        if (response.status === 402) {
          message = "Lovable AI credits are exhausted. Add credits in Settings → Workspace → Usage, then try again.";
        } else if (response.status === 429) {
          message = "Lovable AI rate limit reached. Please wait a moment and try again.";
        } else {
          message = `AI call failed (${response.status}): ${errText.slice(0, 200)}`;
        }
        const error = new Error(message) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (choice?.finish_reason !== "stop") {
        throw new AutonomousGenerationError("non_stop_finish", `Analysis pass ended with finish_reason=${choice?.finish_reason || "unknown"}`);
      }
      const content = String(choice?.message?.content || "").trim();
      if (!content) throw new AutonomousGenerationError("empty_content", "Analysis pass returned no content");
      return content;
    }

    // ── Run 5-pass analysis with iterative deepening ──
    console.log(
      `Starting 5-pass deep analysis for user ${user_id} with ${allMemories.length} memories`,
    );

    // Pass 1: Linguistic Fingerprinting
    if (import_id) {
      await updateImport({
        pipeline_stage: "profiling:linguistic",
      });
    }
    const pass1 = await aiCall(
      LINGUISTIC_PROMPT,
      `MEMORY CORPUS (${allMemories.length} memories):\n${memoryExcerpt}`,
    );
    console.log("Pass 1 (Linguistic) complete");

    // Pass 2: Psychological Profiling
    if (import_id) {
      await updateImport({
        pipeline_stage: "profiling:psychological",
      });
    }
    const pass2 = await aiCall(
      PSYCHOLOGICAL_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 RESULTS (Linguistic Fingerprint) ---\n${pass1}`,
    );
    console.log("Pass 2 (Psychological) complete");

    // Pass 3: Relational Mapping
    if (import_id) {
      await updateImport({
        pipeline_stage: "profiling:relational",
      });
    }
    const pass3 = await aiCall(
      RELATIONAL_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 (Linguistic) ---\n${pass1}\n\n--- PASS 2 (Psychological) ---\n${pass2}`,
    );
    console.log("Pass 3 (Relational) complete");

    // Pass 4: Values & Motivation
    if (import_id) {
      await updateImport({
        pipeline_stage: "profiling:values",
      });
    }
    const pass4 = await aiCall(
      VALUES_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 (Linguistic) ---\n${pass1}\n\n--- PASS 2 (Psychological) ---\n${pass2}\n\n--- PASS 3 (Relational) ---\n${pass3}`,
    );
    console.log("Pass 4 (Values) complete");

    // Pass 5: Shadow Analysis (standalone, so we capture the raw text for citations)
    if (import_id) {
      await updateImport({
        pipeline_stage: "profiling:shadow",
      });
    }
    const pass5 = await aiCall(
      SHADOW_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 (Linguistic) ---\n${pass1}\n\n--- PASS 2 (Psychological) ---\n${pass2}\n\n--- PASS 3 (Relational) ---\n${pass3}\n\n--- PASS 4 (Values) ---\n${pass4}`,
    );
    console.log("Pass 5 (Shadow) complete");

    const finalPrompt = `${SHADOW_PROMPT}

After the shadow analysis, synthesize ALL five passes into a complete structured profile using the save_psychological_profile tool.

HIGH-SIGNAL MEMORY EXCERPT:
${memoryExcerpt}

FULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):
${memoryCorpus.slice(0, 30000)}

--- PASS 1 (Linguistic Fingerprint) ---
${pass1}

--- PASS 2 (Psychological Profile) ---
${pass2}

--- PASS 3 (Relational Map) ---
${pass3}

--- PASS 4 (Values & Motivation) ---
${pass4}

--- PASS 5 (Shadow Analysis) ---
${pass5}`;

    const finalResponse = await withModelRetry(() => fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANALYSIS_MODEL,
          messages: [{ role: "user", content: finalPrompt }],
          temperature: 0.3,
          max_tokens: 7000,
          tools: [profileTool],
          tool_choice: {
            type: "function",
            function: { name: "save_psychological_profile" },
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    ));

    if (!finalResponse.ok) {
      const errText = await finalResponse.text();
      let message: string;
      if (finalResponse.status === 402) {
        message = "Lovable AI credits are exhausted. Add credits in Settings → Workspace → Usage, then try again.";
      } else if (finalResponse.status === 429) {
        message = "Lovable AI rate limit reached. Please wait a moment and try again.";
      } else {
        message = `Final synthesis failed: ${errText.slice(0, 200)}`;
      }
      const error = new Error(message) as Error & { status?: number };
      error.status = finalResponse.status;
      throw error;
    }

    const finalData = await finalResponse.json();
    const finalChoice = finalData.choices?.[0];
    if (!['stop', 'tool_calls'].includes(finalChoice?.finish_reason)) {
      throw new AutonomousGenerationError("non_stop_finish", `Final profile synthesis ended with finish_reason=${finalChoice?.finish_reason || "unknown"}`);
    }
    let profile: any = {};

    try {
      const toolCall = finalChoice?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        profile = JSON.parse(toolCall.function.arguments);
      } else {
        const content = finalChoice?.message?.content || "";
        const cleaned = content.replace(/```json\n?/g, "").replace(
          /```\n?/g,
          "",
        ).trim();
        profile = JSON.parse(cleaned);
      }
    } catch (parseErr) {
      console.error("Failed to parse final profile:", parseErr);
      throw new AutonomousGenerationError("invalid_structure", "Final profile synthesis did not return a complete structured profile");
    }

    // ── Upsert psychological profile ──
    const { error: upsertErr } = await supabase
      .from("psychological_profile")
      .upsert({
        user_id,
        identity_narrative: profile.identity_narrative || null,
        personality_dimensions: profile.personality_dimensions || {},
        communication_patterns: profile.communication_patterns || {},
        emotional_landscape: profile.emotional_landscape || {},
        values_hierarchy: profile.values_hierarchy || {},
        relational_dynamics: profile.relational_dynamics || {},
        cognitive_tendencies: profile.cognitive_tendencies || {},
        growth_edges: profile.growth_edges || {},
        shadow_patterns: profile.shadow_patterns || {},
        raw_analysis: { pass1, pass2, pass3, pass4, pass5 },
        version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertErr) {
      console.error("Profile upsert error:", upsertErr);
    }

    // ── Store key insights as high-confidence engrams ──
    const engramInserts: any[] = [];

    if (profile.identity_narrative) {
      engramInserts.push({
        user_id,
        agent_id,
        content: `IDENTITY PORTRAIT: ${profile.identity_narrative}`,
        engram_type: "semantic",
        strength: 0.95,
        stability: 0.9,
        accessibility: 1.0,
        emotional_valence: 0.3,
        emotional_arousal: 0.4,
        tags: ["profile", "identity", "deep-analysis"],
        source_context: { pipeline: "profile-deep-analysis-v1", import_id, agent_id },
        content_integrity_status: "valid",
      });
    }

    // Store Big Five as engram
    if (profile.personality_dimensions?.big_five) {
      const b5 = profile.personality_dimensions.big_five;
      const b5Summary = Object.entries(b5)
        .map(([k, v]: [string, any]) => `${k}: ${v.score}/100`)
        .join(", ");
      engramInserts.push({
        user_id,
        agent_id,
        content: `PERSONALITY DIMENSIONS — ${b5Summary}.`,
        engram_type: "semantic",
        strength: 0.9,
        stability: 0.85,
        accessibility: 0.9,
        tags: ["profile", "big-five", "deep-analysis"],
        source_context: { pipeline: "profile-deep-analysis-v1", import_id, agent_id },
        content_integrity_status: "valid",
      });
    }

    // Store shadow insights
    if (profile.shadow_patterns?.blind_spots?.length) {
      const spotTexts = profile.shadow_patterns.blind_spots.map(
        (s: any) => (typeof s === "string" ? s : s.claim ?? JSON.stringify(s)),
      );
      engramInserts.push({
        user_id,
        agent_id,
        content: `SHADOW PATTERNS — Blind spots: ${spotTexts.join("; ")}.`,
        engram_type: "semantic",
        strength: 0.85,
        stability: 0.8,
        accessibility: 0.85,
        tags: ["profile", "shadow", "deep-analysis"],
        source_context: { pipeline: "profile-deep-analysis-v1", import_id, agent_id },
        content_integrity_status: "valid",
      });
    }

    if (engramInserts.length > 0) {
      engramInserts.forEach((engram) => {
        engram.content = assertCompleteAutonomousContent(String(engram.content || ""));
      });
      await supabase.from("engrams").insert(engramInserts);
    }

    // Update import status
    if (import_id) {
      await updateImport({
        pipeline_stage: "complete",
        status: "completed",
        completed_at: new Date().toISOString(),
      });
    }

    console.log(`Deep analysis complete for user ${user_id}/${agent_id}`);
    }; // end runAnalysis

    // Kick off the analysis in the background and return immediately.
    // Edge functions enforce a 150s idle timeout; the 5-pass run takes
    // 3-6 minutes, so we use EdgeRuntime.waitUntil to keep it alive
    // after the response is sent. The client polls psychological_profile.
    const bgTask = runAnalysis().catch(async (e) => {
      console.error("profile-deep-analysis background error:", e);
      try {
        await supabase.from("autonomous_generation_events").insert({
          user_id,
          agent_id,
          writer: "profile-deep-analysis",
          status: "failed",
          reason: e instanceof AutonomousGenerationError ? e.reason : "generation_failed",
          attempts: 1,
          model: ANALYSIS_MODEL,
          detail: e instanceof Error ? e.message.slice(0, 2000) : String(e).slice(0, 2000),
        });
      } catch {
        // Failure telemetry is best effort; preserve the original error path.
      }
      if (import_id) {
        await updateImport({
          status: "failed",
          pipeline_stage: "error",
        }).catch(() => {});
      }
    });

    // @ts-expect-error — EdgeRuntime is provided by the Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-expect-error — EdgeRuntime is provided by the Supabase edge runtime
      EdgeRuntime.waitUntil(bgTask);
    }

    console.log(`profile-deep-analysis request accepted for user ${user_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        status: "processing",
        message:
          "Deep analysis started in background. Typically takes 3-6 minutes.",
      }),
      {
        status: 202,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("profile-deep-analysis error:", e);
    if (import_id) {
      try {
        await supabase.from("chat_imports").update({
          status: "failed",
          pipeline_stage: "error",
        }).eq("id", import_id).eq("user_id", user_id).eq("agent_id", agent_id);
      } catch {
        // best effort only
      }
    }
    const status =
      e instanceof Error && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "An unexpected error occurred",
      }),
      {
        status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});

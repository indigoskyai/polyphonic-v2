import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCorsHeaders,
  handleCorsPreflightIfNeeded,
} from "../_shared/cors.ts";

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

Be specific. Quote actual patterns you observe. This is forensic-level analysis.`;

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

Ground every claim in observed behavior from the conversations. No speculation without evidence.`;

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

Be forensic about what their relational language reveals about their inner world.`;

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

Distinguish between stated values and revealed preferences (what they say they care about vs what their behavior shows).`;

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

IMPORTANT: End with a "Portrait" — a single flowing paragraph that captures the ESSENCE of this person in a way that would make them feel truly, deeply seen. Like a mirror that shows not just their reflection but their soul.`;

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
                  },
                },
                conscientiousness: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                  },
                },
                extraversion: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                  },
                },
                agreeableness: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                  },
                },
                neuroticism: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    evidence: { type: "string" },
                  },
                },
              },
            },
            attachment_style: {
              type: "object",
              properties: {
                primary: { type: "string" },
                evidence: { type: "string" },
              },
            },
            cognitive_style: { type: "string" },
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
            unique_signatures: { type: "array", items: { type: "string" } },
            emotional_vocabulary_range: { type: "string" },
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
          },
        },
        shadow_patterns: {
          type: "object",
          properties: {
            contradictions: { type: "array", items: { type: "string" } },
            blind_spots: { type: "array", items: { type: "string" } },
            avoidance_patterns: { type: "array", items: { type: "string" } },
            compensatory_behaviors: {
              type: "array",
              items: { type: "string" },
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

    const user_id = user.id;
    const body = await req.json().catch(() => ({}));
    import_id = body?.import_id;

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
      await supabase.from("chat_imports").update({
        pipeline_stage: "profiling",
      }).eq("id", import_id);
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
      const response = await fetch(
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
        },
      );

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
      return data.choices?.[0]?.message?.content || "";
    }

    // ── Run 5-pass analysis with iterative deepening ──
    console.log(
      `Starting 5-pass deep analysis for user ${user_id} with ${allMemories.length} memories`,
    );

    // Pass 1: Linguistic Fingerprinting
    if (import_id) {
      await supabase.from("chat_imports").update({
        pipeline_stage: "profiling:linguistic",
      }).eq("id", import_id);
    }
    const pass1 = await aiCall(
      LINGUISTIC_PROMPT,
      `MEMORY CORPUS (${allMemories.length} memories):\n${memoryExcerpt}`,
    );
    console.log("Pass 1 (Linguistic) complete");

    // Pass 2: Psychological Profiling
    if (import_id) {
      await supabase.from("chat_imports").update({
        pipeline_stage: "profiling:psychological",
      }).eq("id", import_id);
    }
    const pass2 = await aiCall(
      PSYCHOLOGICAL_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 RESULTS (Linguistic Fingerprint) ---\n${pass1}`,
    );
    console.log("Pass 2 (Psychological) complete");

    // Pass 3: Relational Mapping
    if (import_id) {
      await supabase.from("chat_imports").update({
        pipeline_stage: "profiling:relational",
      }).eq("id", import_id);
    }
    const pass3 = await aiCall(
      RELATIONAL_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 (Linguistic) ---\n${pass1}\n\n--- PASS 2 (Psychological) ---\n${pass2}`,
    );
    console.log("Pass 3 (Relational) complete");

    // Pass 4: Values & Motivation
    if (import_id) {
      await supabase.from("chat_imports").update({
        pipeline_stage: "profiling:values",
      }).eq("id", import_id);
    }
    const pass4 = await aiCall(
      VALUES_PROMPT,
      `HIGH-SIGNAL MEMORY EXCERPT:\n${memoryExcerpt}\n\nFULL CORPUS SUMMARY SOURCE (${allMemories.length} memories):\n${memoryCorpus.slice(0, 30000)}\n\n--- PASS 1 (Linguistic) ---\n${pass1}\n\n--- PASS 2 (Psychological) ---\n${pass2}\n\n--- PASS 3 (Relational) ---\n${pass3}`,
    );
    console.log("Pass 4 (Values) complete");

    // Pass 5: Shadow Analysis + Portrait (final synthesis using tool calling)
    if (import_id) {
      await supabase.from("chat_imports").update({
        pipeline_stage: "profiling:shadow",
      }).eq("id", import_id);
    }

    const finalPrompt = `${SHADOW_PROMPT}

After the shadow analysis, synthesize ALL five passes into a complete structured profile using the save_psychological_profile tool.

MEMORY CORPUS:
${memoryCorpus}

--- PASS 1 (Linguistic Fingerprint) ---
${pass1}

--- PASS 2 (Psychological Profile) ---
${pass2}

--- PASS 3 (Relational Map) ---
${pass3}

--- PASS 4 (Values & Motivation) ---
${pass4}`;

    const finalResponse = await fetch(
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
          max_tokens: 12000,
          tools: [profileTool],
          tool_choice: {
            type: "function",
            function: { name: "save_psychological_profile" },
          },
        }),
      },
    );

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
    let profile: any = {};

    try {
      const toolCall = finalData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        profile = JSON.parse(toolCall.function.arguments);
      } else {
        const content = finalData.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(
          /```\n?/g,
          "",
        ).trim();
        profile = JSON.parse(cleaned);
      }
    } catch (parseErr) {
      console.error("Failed to parse final profile:", parseErr);
      // Store raw analysis even if structured parsing fails
      profile = {
        identity_narrative:
          "Analysis completed but structured parsing failed. Raw data stored.",
        raw_passes: { pass1, pass2, pass3, pass4 },
      };
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
        raw_analysis: { pass1, pass2, pass3, pass4 },
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
        content: `IDENTITY PORTRAIT: ${profile.identity_narrative}`,
        engram_type: "semantic",
        strength: 0.95,
        stability: 0.9,
        accessibility: 1.0,
        emotional_valence: 0.3,
        emotional_arousal: 0.4,
        tags: ["profile", "identity", "deep-analysis"],
        source_context: { pipeline: "profile-deep-analysis-v1", import_id },
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
        content: `PERSONALITY DIMENSIONS — ${b5Summary}`,
        engram_type: "semantic",
        strength: 0.9,
        stability: 0.85,
        accessibility: 0.9,
        tags: ["profile", "big-five", "deep-analysis"],
        source_context: { pipeline: "profile-deep-analysis-v1", import_id },
      });
    }

    // Store shadow insights
    if (profile.shadow_patterns?.blind_spots?.length) {
      engramInserts.push({
        user_id,
        content: `SHADOW PATTERNS — Blind spots: ${
          profile.shadow_patterns.blind_spots.join("; ")
        }`,
        engram_type: "semantic",
        strength: 0.85,
        stability: 0.8,
        accessibility: 0.85,
        tags: ["profile", "shadow", "deep-analysis"],
        source_context: { pipeline: "profile-deep-analysis-v1", import_id },
      });
    }

    if (engramInserts.length > 0) {
      await supabase.from("engrams").insert(engramInserts);
    }

    // Update import status
    if (import_id) {
      await supabase.from("chat_imports").update({
        pipeline_stage: "complete",
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", import_id);
    }

    console.log(`Deep analysis complete for user ${user_id}`);
    }; // end runAnalysis

    // Kick off the analysis in the background and return immediately.
    // Edge functions enforce a 150s idle timeout; the 5-pass run takes
    // 3-6 minutes, so we use EdgeRuntime.waitUntil to keep it alive
    // after the response is sent. The client polls psychological_profile.
    const bgTask = runAnalysis().catch(async (e) => {
      console.error("profile-deep-analysis background error:", e);
      if (import_id) {
        await supabase.from("chat_imports").update({
          status: "failed",
          pipeline_stage: "error",
        }).eq("id", import_id).catch(() => {});
      }
    });

    // @ts-ignore — EdgeRuntime is provided by the Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(bgTask);
    }

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
      await supabase.from("chat_imports").update({
        status: "failed",
        pipeline_stage: "error",
      }).eq("id", import_id).catch(() => {});
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

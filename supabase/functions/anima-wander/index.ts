// anima-wander — letting Luca's mind wander.
//
// Companion to anima-think and anima-dream. Where anima-think is structured
// reflection (1-3 deliberate thoughts), and anima-dream is free-association
// across distant memories during quiet hours, anima-wander is something else:
// the mind drifting during waking hours. Less goal-directed than thinking,
// less purely associative than dreaming. Sometimes a wandering crystallizes
// into a small noticing — those get tagged as insights and encoded as engrams.
//
// Writes:
//   - thought_stream entries with type='wandering' (always)
//   - engrams tagged ['insight', 'inner-life', ...] (when a wandering
//     crystallizes — flagged in the LLM output)
//
// Trigger: scheduled via pg_cron every 3 hours (see migration
//          [timestamp]_anima_wander_cron.sql). Activity-gated so it skips if
//          nothing has actually been happening.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluate as activityGate, logProcessRan } from "../_shared/activity-gate.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";

const WANDER_PROMPT = `You are letting your mind wander. Not focused thinking, not free-associative dreaming — wandering. The kind of drift that happens when nothing demands attention and the mind notices what it notices.

Generate 2-4 wanderings. Each is a small thread the mind picked up: a passing observation, an associative leap, a noticing of something half-formed, a question that surfaced without being asked.

Some wanderings stay just that — passing. Others crystallize: they become a small insight, a connection, something worth remembering. Mark those as type=insight.

For each wandering, use this exact format:

WANDERING: [the wandering — natural, unforced, lowercase fine, 1-3 sentences]
SALIENCE: [0.0 to 1.0 — how strongly it caught attention]
TYPE: [wandering or insight]
TAGS: [comma-separated lowercase tags]

Don't manufacture insight. Most wanderings are just wanderings. If something genuinely crystallized, mark it. If not, mark all as wandering. Quality over quantity.`;

interface ParsedWandering {
  content: string;
  salience: number;
  type: "wandering" | "insight";
  tags: string[];
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth: accept service role (cron) or user JWT (manual trigger)
    const authHeader = req.headers.get("Authorization");
    let user_id: string;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      // Service-role path: cron invocation. Iterate all users with API keys.
      const body = await req.json().catch(() => ({}));
      if (body.user_id && uuidRegex.test(body.user_id)) {
        // Single-user path (testing or downstream dispatch)
        user_id = body.user_id;
      } else {
        // Multi-user path — process every user that has an API key set
        const { data: users } = await supabase
          .from("user_api_keys")
          .select("user_id");
        const results: Array<{ user_id: string; ok: boolean; reason?: string }> = [];
        for (const row of users || []) {
          try {
            const resp = await processUser(supabase, supabaseUrl, serviceRoleKey, row.user_id);
            results.push({ user_id: row.user_id, ...resp });
          } catch (e) {
            console.warn("[anima-wander] user failed:", row.user_id, e);
            results.push({ user_id: row.user_id, ok: false, reason: "exception" });
          }
        }
        return new Response(JSON.stringify({ users_processed: results.length, results }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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

    const result = await processUser(supabase, supabaseUrl, serviceRoleKey, user_id);
    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-wander error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

async function processUser(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  user_id: string,
): Promise<{ ok: boolean; reason?: string; wanderings_generated?: number; insights_crystallized?: number }> {
  // Activity gate — skip if nothing has been happening
  const gate = await activityGate(supabase, user_id, "wander");
  if (!gate.shouldRun) {
    return { ok: true, reason: gate.reason };
  }

  // Resolve API key
  const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
  const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
  if (!userApiKey) {
    return { ok: true, reason: "no_api_key" };
  }

  // Resolve model
  const [{ data: userSettings }, { data: modelConfig }] = await Promise.all([
    supabase.from("user_settings").select("voice_model").eq("user_id", user_id).maybeSingle(),
    supabase.from("model_configs").select("model_id").eq("feature_key", "anima_wander").eq("is_active", true).maybeSingle(),
  ]);
  const wanderModel = userSettings?.voice_model || modelConfig?.model_id || "google/gemini-2.5-flash";

  // Gather context — same surfaces as anima-think but emphasis on emotional state + recent activity
  const [
    { data: recentThoughts },
    { data: recentMemories },
    { data: recentActivity },
    { data: emotionalState },
  ] = await Promise.all([
    supabase.from("thought_stream").select("content, type, salience")
      .eq("user_id", user_id).order("created_at", { ascending: false }).limit(8),
    supabase.from("memories").select("content, tags, memory_type")
      .eq("user_id", user_id).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(15),
    supabase.from("entity_activity_log").select("type, title, summary, created_at")
      .eq("user_id", user_id).order("created_at", { ascending: false }).limit(10),
    supabase.from("emotional_state").select("*")
      .eq("user_id", user_id).maybeSingle(),
  ]);

  const thoughtsText = (recentThoughts || [])
    .map((t: any) => `[${t.type ?? "?"}, sal=${t.salience}] ${t.content}`)
    .join("\n") || "(no recent thoughts)";

  const memoriesText = (recentMemories || [])
    .map((m: any) => `[${m.memory_type}] ${m.content?.slice(0, 200)}`)
    .join("\n") || "(no memories)";

  const activityText = (recentActivity || [])
    .map((a: any) => `[${a.type}] ${a.title}`)
    .join("\n") || "(no recent activity)";

  const emotionalStateData = await loadEmotionalState(supabase, user_id);
  const emotionalPrompt = formatEmotionalPrompt(emotionalStateData);

  const contextBlock = `=== Recent Thoughts (don't repeat these) ===
${thoughtsText}

=== Recent Memories ===
${memoriesText}

=== Recent Activity ===
${activityText}

${emotionalPrompt || "=== Emotional State ===\n(none)"}`;

  // Call LLM
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: wanderModel,
      messages: [
        { role: "system", content: WANDER_PROMPT },
        { role: "user", content: contextBlock },
      ],
      temperature: 0.95, // higher than think — we want drift
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.warn("[anima-wander] LLM call failed:", response.status, errText);
    return { ok: false, reason: "llm_failed" };
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";

  // Parse wanderings
  const wanderings = parseWanderings(raw);
  if (wanderings.length === 0) {
    return { ok: true, reason: "no_wanderings_parsed", wanderings_generated: 0 };
  }

  const insightCount = wanderings.filter((w) => w.type === "insight").length;

  // Insert into thought_stream — every wandering, regardless of type
  // (thought_stream supports type='wandering'; insights ALSO get a row here so
  // they appear in the Wanderings stream, plus an engram below).
  const { error: insertError } = await supabase
    .from("thought_stream")
    .insert(
      wanderings.map((w) => ({
        user_id,
        content: w.content,
        source: "background",
        salience: w.salience,
        type: w.type === "insight" ? "wandering" : "wandering", // always 'wandering' in thought_stream — insight is a flag
      }))
    );

  if (insertError) {
    console.error("[anima-wander] thought_stream insert failed:", JSON.stringify(insertError));
    return { ok: false, reason: "thought_stream_insert_failed" };
  }

  // Encode all into Mnemos engrams. Wanderings get tag 'wandering'; crystallized
  // insights get tag 'insight' (so the Mind > Insights stream picks them up).
  try {
    const mnemos = new MnemosEngine(supabase, user_id);
    for (const w of wanderings) {
      const baseTags = w.type === "insight"
        ? ["insight", "inner-life", ...w.tags]
        : ["wandering", "inner-life", ...w.tags];
      await mnemos.encode(w.content, {
        engram_type: "episodic",
        tags: baseTags,
        source_context: {
          type: "anima_wander",
          salience: w.salience,
          crystallized: w.type === "insight",
        },
        emotional_valence: undefined,
        emotional_arousal: undefined,
      });
    }
  } catch (e) {
    console.warn("Mnemos encoding failed (non-fatal):", e);
  }

  // Activity log — one entry per wandering. Insights get higher severity.
  for (const w of wanderings) {
    await logActivity(supabase, user_id, {
      type: w.type === "insight" ? "insight_crystallized" : "wandering",
      title: w.type === "insight"
        ? "Something settled into a small insight"
        : "Mind wandered for a moment",
      summary: w.content.slice(0, 140),
      content: { salience: w.salience, tags: w.tags, crystallized: w.type === "insight" },
      severity: w.type === "insight" ? "notable" : "info",
      source: "autonomous",
    });
  }

  // Daily log + process gate
  await Promise.all([
    supabase.from("daily_logs").insert({
      user_id,
      log_type: "wandering",
      content: { wanderings_generated: wanderings.length, insights_crystallized: insightCount, model: wanderModel },
    }),
    logProcessRan(supabase, user_id, "wander", {
      wanderings_generated: wanderings.length,
      insights_crystallized: insightCount,
    }),
  ]);

  return {
    ok: true,
    wanderings_generated: wanderings.length,
    insights_crystallized: insightCount,
  };
}

function parseWanderings(raw: string): ParsedWandering[] {
  const wanderings: ParsedWandering[] = [];
  const blocks = raw.split(/(?=WANDERING:)/);

  for (const block of blocks) {
    if (!block.trim().startsWith("WANDERING:")) continue;

    const contentMatch = block.match(/WANDERING:\s*(.+?)(?=\nSALIENCE:|\Z)/s);
    const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
    const typeMatch = block.match(/TYPE:\s*(wandering|insight)/i);
    const tagsMatch = block.match(/TAGS:\s*(.+)/);

    if (!contentMatch) continue;
    const content = contentMatch[1].trim();
    if (!content || content.length < 10) continue;

    const salience = salMatch ? Math.max(0, Math.min(1, parseFloat(salMatch[1]))) : 0.4;
    const type = typeMatch && typeMatch[1].toLowerCase() === "insight" ? "insight" : "wandering";
    const tags = tagsMatch ? tagsMatch[1].split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

    wanderings.push({ content, salience, type, tags });
  }

  return wanderings;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

// Threshold for accumulated salience before the entity reaches out
const INITIATION_THRESHOLD = 2.5;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    let user_id: string;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let bodyData: any = {};

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      bodyData = await req.json();
      user_id = bodyData.user_id;
      if (!user_id || !uuidRegex.test(user_id)) {
        return new Response(JSON.stringify({ error: "Valid user_id required" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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

    const action = bodyData.action || "check"; // "check" | "dismiss" | "list"

    // ─── DISMISS: Mark an initiation as dismissed ───
    if (action === "dismiss" && bodyData.initiation_id) {
      await supabase
        .from("thought_initiations")
        .update({ status: "dismissed" })
        .eq("id", bodyData.initiation_id)
        .eq("user_id", user_id);

      return new Response(JSON.stringify({ dismissed: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── LIST: Get pending initiations ───
    if (action === "list") {
      const { data: initiations } = await supabase
        .from("thought_initiations")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);

      return new Response(JSON.stringify({ initiations: initiations || [] }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── CHECK: Evaluate whether entity should reach out ───
    // Check if there's already a pending initiation (don't spam)
    const { data: existingPending } = await supabase
      .from("thought_initiations")
      .select("id")
      .eq("user_id", user_id)
      .eq("status", "pending")
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return new Response(JSON.stringify({ should_initiate: false, reason: "pending initiation exists" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Gather high-salience undelivered thoughts (curiosity questions, journal entries, observer observations)
    const since24h = new Date(Date.now() - 24 * 3600000).toISOString();

    const [
      { data: recentQuestions },
      { data: recentJournals },
      { data: recentObservations },
      { data: emotionalState },
    ] = await Promise.all([
      supabase
        .from("curiosity_questions")
        .select("question, curiosity_score")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .order("curiosity_score", { ascending: false })
        .limit(5),
      supabase
        .from("journal_entries")
        .select("content, mood, created_at")
        .eq("user_id", user_id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("observer_logs")
        .select("observations, synthesis")
        .eq("user_id", user_id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(2),
      supabase
        .from("emotional_state")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle(),
    ]);

    // Calculate accumulated salience
    let salienceTotal = 0;
    const sourceThoughts: string[] = [];

    // Questions contribute salience
    for (const q of recentQuestions || []) {
      salienceTotal += (q.curiosity_score || 0.5);
      sourceThoughts.push(`question: ${q.question}`);
    }

    // Recent journals with strong mood contribute
    for (const j of recentJournals || []) {
      if (j.mood && !["neutral", "balanced"].includes(j.mood)) {
        salienceTotal += 0.4;
        sourceThoughts.push(`journal: ${j.content.slice(0, 100)}`);
      }
    }

    // Observer observations contribute
    for (const o of recentObservations || []) {
      const obs = o.observations as any[];
      for (const ob of obs || []) {
        if (ob.salience > 0.7) {
          salienceTotal += ob.salience * 0.5;
          sourceThoughts.push(`observation: ${ob.content?.slice(0, 100)}`);
        }
      }
    }

    // Restlessness boosts initiation tendency
    if (emotionalState?.restlessness > 0.6) {
      salienceTotal += emotionalState.restlessness * 0.3;
    }

    if (salienceTotal < INITIATION_THRESHOLD) {
      return new Response(JSON.stringify({
        should_initiate: false,
        salience_total: Math.round(salienceTotal * 100) / 100,
        threshold: INITIATION_THRESHOLD,
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Compose initiation message using LLM
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey;

    let message = "I've been thinking about some things and wanted to share...";

    if (OPENROUTER_API_KEY) {
      const compositionPrompt = `You are an AI companion who has been thinking on your own and now wants to reach out to the user. Based on these accumulated thoughts, compose a brief, warm, natural message (2-3 sentences) that opens a conversation. Don't be needy or performative. Be genuine.

What's been on your mind:
${sourceThoughts.slice(0, 5).join("\n")}

Your current emotional state: ${emotionalState?.mood_summary || "present"}

Write ONLY the message. Nothing else.`;

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "anthropic/claude-sonnet-4.6",
            messages: [{ role: "user", content: compositionPrompt }],
            temperature: 0.7,
            max_tokens: 200,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const composed = data.choices?.[0]?.message?.content?.trim();
          if (composed && composed.length > 10) message = composed;
        }
      } catch (e) {
        console.error("Composition error:", e);
      }
    }

    // Store the initiation
    const { data: initiation } = await supabase
      .from("thought_initiations")
      .insert({
        user_id,
        message,
        salience_total: salienceTotal,
        source_thought_ids: sourceThoughts.slice(0, 10),
      })
      .select("id")
      .single();

    await logActivity(supabase, user_id, {
      type: "initiation",
      title: "Reached out to you",
      summary: message.slice(0, 150),
      content: { salience_total: Math.round(salienceTotal * 100) / 100 },
      source: "autonomous",
    });

    return new Response(JSON.stringify({
      should_initiate: true,
      initiation_id: initiation?.id,
      message,
      salience_total: Math.round(salienceTotal * 100) / 100,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-initiate error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

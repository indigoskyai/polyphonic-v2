import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

const STAGNATION_THRESHOLD_DAYS = 14;

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

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      const body = await req.json();
      user_id = body.user_id;
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

    const body = typeof req.body !== "undefined" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "challenge"; // "challenge" | "list" | "create" | "update"

    // ─── LIST: Return all active beliefs ───
    if (action === "list") {
      const { data: beliefs } = await supabase
        .from("beliefs")
        .select("*")
        .eq("user_id", user_id)
        .eq("active", true)
        .order("confidence", { ascending: false });

      return new Response(JSON.stringify({ beliefs: beliefs || [] }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── CREATE: Add a new belief ───
    if (action === "create") {
      const { content, confidence = 0.5, domain = "general", tags = [] } = body;
      if (!content) {
        return new Response(JSON.stringify({ error: "content required" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: belief, error } = await supabase
        .from("beliefs")
        .insert({
          user_id,
          content,
          confidence: Math.max(0.01, Math.min(0.99, confidence)),
          domain,
          tags,
          source: body.source || "manual",
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ belief }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── CHALLENGE: Challenge stagnant beliefs ───
    // Step 1: Mark stagnant beliefs
    const stagnantCutoff = new Date(Date.now() - STAGNATION_THRESHOLD_DAYS * 86400000).toISOString();
    await supabase
      .from("beliefs")
      .update({ stagnant: true })
      .eq("user_id", user_id)
      .eq("active", true)
      .lt("last_challenged", stagnantCutoff);

    // Step 2: Fetch stagnant beliefs
    const { data: stagnantBeliefs } = await supabase
      .from("beliefs")
      .select("*")
      .eq("user_id", user_id)
      .eq("active", true)
      .eq("stagnant", true)
      .order("last_challenged", { ascending: true })
      .limit(3);

    if (!stagnantBeliefs || stagnantBeliefs.length === 0) {
      return new Response(JSON.stringify({ challenged: 0, reason: "no stagnant beliefs" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get API key
    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const OPENROUTER_API_KEY = userApiKey;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const [{ data: modelConfig }, { data: beliefUserSettings }] = await Promise.all([
      supabase.from("model_configs").select("model_id").eq("feature_key", "anima_believe").eq("is_active", true).maybeSingle(),
      supabase.from("user_settings").select("belief_model").eq("user_id", user_id).maybeSingle(),
    ]);

    const challengeModel = beliefUserSettings?.belief_model || modelConfig?.model_id || "google/gemini-3-pro-preview";
    const results: any[] = [];

    for (const belief of stagnantBeliefs) {
      const daysSinceChallenge = Math.floor((Date.now() - new Date(belief.last_challenged).getTime()) / 86400000);

      const system = `You are a critical thinker helping examine beliefs. Your job is to stress-test a belief — find the strongest counterargument, identify hidden assumptions, or note if the belief has become more or less supported. Be genuinely challenging, not just devil's advocate. If the belief is well-supported, say so.

Respond with EXACTLY this format:
CHALLENGE: [your strongest counterargument or critical observation]
ASSESSMENT: [one of: STRENGTHEN, WEAKEN, MAINTAIN, SUPERSEDE]
CONFIDENCE_DELTA: [a number from -0.3 to +0.2]
REASONING: [one sentence explaining why]`;

      const prompt = `Belief: "${belief.content}"
Current confidence: ${belief.confidence}
Domain: ${belief.domain}
Held since: ${belief.created_at?.slice(0, 10)}
Last challenged: ${belief.last_challenged?.slice(0, 10)} (${daysSinceChallenge} days ago)
Revision count: ${(belief.revision_history || []).length}`;

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: challengeModel,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 500,
          }),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || "";

        // Parse challenge response
        let challenge = "";
        let assessment = "MAINTAIN";
        let confidenceDelta = 0;
        let reasoning = "";

        for (const line of responseText.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("CHALLENGE:")) challenge = trimmed.split(":", 1)[1]?.trim() || trimmed.slice(10).trim();
          else if (trimmed.startsWith("ASSESSMENT:")) {
            const val = trimmed.split(":")[1]?.trim().toUpperCase();
            if (["STRENGTHEN", "WEAKEN", "MAINTAIN", "SUPERSEDE"].includes(val)) assessment = val;
          }
          else if (trimmed.startsWith("CONFIDENCE_DELTA:")) {
            const delta = parseFloat(trimmed.split(":")[1]?.trim());
            if (!isNaN(delta)) confidenceDelta = Math.max(-0.3, Math.min(0.2, delta));
          }
          else if (trimmed.startsWith("REASONING:")) reasoning = trimmed.split(":", 1)[1]?.trim() || trimmed.slice(10).trim();
        }

        // Update belief
        const newConfidence = Math.max(0.01, Math.min(0.99, belief.confidence + confidenceDelta));
        const revision = {
          timestamp: new Date().toISOString(),
          old_confidence: belief.confidence,
          new_confidence: newConfidence,
          assessment,
          challenge,
          reasoning,
        };

        const revisionHistory = [...(belief.revision_history || []), revision];

        await supabase
          .from("beliefs")
          .update({
            confidence: newConfidence,
            last_challenged: new Date().toISOString(),
            last_revised: confidenceDelta !== 0 ? new Date().toISOString() : belief.last_revised,
            stagnant: false,
            revision_history: revisionHistory,
          })
          .eq("id", belief.id);

        results.push({
          belief_id: belief.id,
          content: belief.content,
          assessment,
          old_confidence: belief.confidence,
          new_confidence: newConfidence,
          challenge,
          reasoning,
        });

        await logActivity(supabase, user_id, {
          type: "belief_change",
          title: `Belief ${assessment.toLowerCase()}: ${belief.content.slice(0, 60)}`,
          summary: belief.content,
          content: { action: assessment, confidence: newConfidence, domain: belief.domain },
          source: "autonomous",
        });
      } catch (e) {
        console.error("Challenge error:", e);
      }
    }

    return new Response(JSON.stringify({ challenged: results.length, results }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-believe error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { logProcessRan } from "../_shared/activity-gate.ts";
import { isSubstrateAgentId, normalizeAgentId, nonSubstrateResponse } from "../_shared/agent-scope.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";

const STAGNATION_THRESHOLD_DAYS = 14;

// Challenge moves confidence by a bounded, GENTLE step per assessment — never the
// old free-form LLM number [-0.3,+0.2] that could lurch a belief in one shot. A
// belief becomes a "living question" (<=0.4) only by accumulating contradictions
// across several challenges; conviction (>=0.7) likewise builds slowly. Weaken is
// weighted a touch heavier than strengthen because a stress-test's job is to find
// where a belief is failing. (Tunable dials — see Phase-2 deploy note.)
const CHALLENGE_DELTAS: Record<string, number> = {
  STRENGTHEN: 0.05,
  WEAKEN: -0.08,
  MAINTAIN: 0,
  SUPERSEDE: -0.12, // strongest gentle move; deliberately does NOT auto-deactivate (reversible)
};
const EVIDENCE_FETCH_LIMIT = 6;

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
    let agent_id = "luca";
    let bodyData: any = {};
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (authHeader === `Bearer ${serviceRoleKey}`) {
      bodyData = await req.json().catch(() => ({}));
      user_id = bodyData.user_id;
      agent_id = normalizeAgentId(bodyData.agent_id);
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
      bodyData = await req.json().catch(() => ({}));
      agent_id = normalizeAgentId(bodyData.agent_id);
    }

    if (!isSubstrateAgentId(agent_id)) {
      return nonSubstrateResponse(agent_id, "anima-believe", getCorsHeaders(req));
    }

    const body = bodyData;
    const action = body.action || "challenge"; // "challenge" | "list" | "create" | "update"

    // ─── LIST: Return all active beliefs ───
    if (action === "list") {
      const { data: beliefs } = await supabase
        .from("beliefs")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
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
          agent_id,
          content,
          // epistemic-humility band [0.05, 0.95] (matches formation/challenge/canonical)
          confidence: Math.max(0.05, Math.min(0.95, confidence)),
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
    // Match never-challenged beliefs (last_challenged NULL — the live table has no
    // default, so `< cutoff` would skip them) as well as genuinely stale ones.
    await Promise.all([
      supabase.from("beliefs").update({ stagnant: true })
        .eq("user_id", user_id).eq("agent_id", agent_id).eq("active", true)
        .is("last_challenged", null),
      supabase.from("beliefs").update({ stagnant: true })
        .eq("user_id", user_id).eq("agent_id", agent_id).eq("active", true)
        .lt("last_challenged", stagnantCutoff),
    ]);

    // Step 2: Fetch stagnant beliefs
    const { data: stagnantBeliefs } = await supabase
      .from("beliefs")
      .select("*")
      .eq("user_id", user_id)
      .eq("agent_id", agent_id)
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

    const challengeModel = beliefUserSettings?.belief_model || modelConfig?.model_id || "google/gemini-2.5-flash";
    const results: any[] = [];

    // CRISIS GUARD: a crisis is an acute, transient state — not evidence about whether
    // a belief is true. Memories formed in/around a high/acute crisis window must NOT
    // be allowed to erode the agent's convictions (a self-negating moment shouldn't,
    // over a few challenges, turn a held value into a "living question"). crisis_events
    // is per-user (not an engram tag), so we exclude engram evidence that lands within
    // a window of any recent high/acute event. (During an active acute window this
    // leaves little/no evidence → the challenge naturally MAINTAINs, no erosion.)
    const CRISIS_EXCLUDE_MS = 12 * 3600 * 1000; // ±12h around a high/acute event
    const { data: crisisRows } = await supabase
      .from("crisis_events")
      .select("created_at")
      .eq("user_id", user_id)
      .in("crisis_level", ["high", "acute"])
      .gte("created_at", new Date(Date.now() - 60 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    const crisisTimes = ((crisisRows ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at).getTime());
    const nearCrisis = (iso: string): boolean => {
      const t = new Date(iso).getTime();
      return crisisTimes.some((c) => Math.abs(t - c) <= CRISIS_EXCLUDE_MS);
    };

    for (const belief of stagnantBeliefs) {
      const lastExaminedAt = belief.last_challenged || belief.created_at;
      const daysSinceChallenge = Math.floor((Date.now() - new Date(lastExaminedAt).getTime()) / 86400000);

      // EVIDENCE-GROUNDED CHALLENGE: fetch what the agent has actually experienced
      // since this belief was last examined, so the stress-test weighs the belief
      // against reality (canonical belief_review.py) instead of in a vacuum. This is
      // what surfaces genuine contradiction — the thing the old isolated prompt couldn't.
      // over-fetch so the crisis-window exclusion below still leaves a full sample
      const { data: evidenceEngrams } = await supabase
        .from("engrams")
        .select("id, content, created_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .in("state", ["active", "consolidating"])
        .gt("created_at", lastExaminedAt)
        .order("created_at", { ascending: false })
        .limit(EVIDENCE_FETCH_LIMIT * 3);

      const evidence = ((evidenceEngrams ?? []) as { id: string; content: string; created_at: string }[])
        .filter((e) => !nearCrisis(e.created_at))
        .slice(0, EVIDENCE_FETCH_LIMIT);
      const evidenceBlock = evidence.length > 0
        ? evidence.map((e, i) => `${i + 1}. ${(e.content || "").slice(0, 240)}`).join("\n")
        : "(no new experiences recorded since this belief was last examined)";

      const system = `You are helping an agent examine one of its own beliefs against what it has actually experienced. Weigh the belief against the evidence below: does the recent experience SUPPORT it, CONTRADICT it, or have no bearing? Be genuinely critical — name the strongest tension — but do not manufacture doubt where the evidence supports the belief.

Respond with EXACTLY this format:
CHALLENGE: [the strongest tension or confirmation the evidence raises]
ASSESSMENT: [one of: STRENGTHEN (evidence supports it), WEAKEN (evidence contradicts it), MAINTAIN (no bearing or mixed), SUPERSEDE (evidence shows it is now wrong)]
REASONING: [one sentence grounded in the evidence above]`;

      const prompt = `Belief: "${belief.content}"
Current confidence: ${belief.confidence}
Domain: ${belief.domain}
Held since: ${belief.created_at?.slice(0, 10)} · last examined ${daysSinceChallenge} days ago

What the agent has experienced since (most recent first):
${evidenceBlock}`;

      try {
        const response = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          signal: AbortSignal.timeout(60000),
        }));

        if (!response.ok) continue;

        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || "";

        // Parse challenge response
        let challenge = "";
        let assessment = "MAINTAIN";
        let reasoning = "";

        for (const line of responseText.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("CHALLENGE:")) challenge = trimmed.split(":", 1)[1]?.trim() || trimmed.slice(10).trim();
          else if (trimmed.startsWith("ASSESSMENT:")) {
            const val = trimmed.split(":")[1]?.trim().toUpperCase();
            if (["STRENGTHEN", "WEAKEN", "MAINTAIN", "SUPERSEDE"].includes(val)) assessment = val;
          }
          else if (trimmed.startsWith("REASONING:")) reasoning = trimmed.split(":", 1)[1]?.trim() || trimmed.slice(10).trim();
        }

        // Confidence moves by the bounded gentle step for this assessment (not a
        // free-form LLM number), then clamps to the epistemic-humility band [0.05,0.95].
        const confidenceDelta = CHALLENGE_DELTAS[assessment] ?? 0;
        const newConfidence = Math.max(0.05, Math.min(0.95, belief.confidence + confidenceDelta));

        // Tier crossing — the nightly identity derivation reflects this on its next run
        // (>=0.7 becomes a "value", <=0.4 becomes a "living question").
        const tierEvent =
          belief.confidence < 0.7 && newConfidence >= 0.7 ? "BELIEF_CONFIRMED"
          : belief.confidence > 0.4 && newConfidence <= 0.4 ? "BELIEF_CONTRADICTED"
          : null;

        const revision = {
          timestamp: new Date().toISOString(),
          old_confidence: belief.confidence,
          new_confidence: newConfidence,
          assessment,
          challenge,
          reasoning,
          source: "challenge",
          trigger_engram_ids: evidence.map((e) => e.id),
          tier_event: tierEvent,
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
          .eq("id", belief.id)
          .eq("user_id", user_id)
          .eq("agent_id", agent_id);

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
          agentId: agent_id,
          type: "belief_change",
          title: tierEvent
            ? `${tierEvent === "BELIEF_CONFIRMED" ? "Belief became a value" : "Belief became a living question"}: ${belief.content.slice(0, 50)}`
            : `Belief ${assessment.toLowerCase()}: ${belief.content.slice(0, 60)}`,
          summary: belief.content,
          content: { action: assessment, confidence: newConfidence, domain: belief.domain, tier_event: tierEvent, evidence_count: evidence.length },
          source: "autonomous",
        });
      } catch (e) {
        console.error("Challenge error:", e);
      }
    }

    await logProcessRan(supabase, user_id, "believe", {
      challenged: results.length,
    }, agent_id);

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

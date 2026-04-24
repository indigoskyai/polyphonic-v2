import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

const DIMENSIONS = ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"] as const;

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

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

    const since48h = new Date(Date.now() - 48 * 3600000).toISOString();

    // Parallel data fetch
    const [
      { data: recentMessages },
      { data: recentJournals },
      { data: memories },
      { data: stagnantBeliefs },
      { data: recentQuestions },
      { data: prevState },
    ] = await Promise.all([
      supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("user_id", user_id)
        .gte("created_at", since48h)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("journal_entries")
        .select("content, mood, created_at")
        .eq("user_id", user_id)
        .gte("created_at", since48h)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("memories")
        .select("id, content, memory_type, tags, emotional_intensity, emotional_valence, access_count, last_accessed_at, decay_factor, created_at")
        .eq("user_id", user_id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("beliefs")
        .select("id")
        .eq("user_id", user_id)
        .eq("active", true)
        .eq("stagnant", true),
      supabase
        .from("curiosity_questions")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "pending"),
      supabase
        .from("emotional_state")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle(),
    ]);

    const msgCount = recentMessages?.length || 0;
    const journalCount = recentJournals?.length || 0;
    const stagnantCount = stagnantBeliefs?.length || 0;
    const questionCount = recentQuestions?.length || 0;
    const allMemories = memories || [];
    const dreamCount = recentJournals?.filter((j: any) => j.mood === "dreaming").length || 0;

    // ─── CURIOSITY ───
    // Questions generated + connection discoveries + recent conversation depth
    let curiosity = 0.3;
    curiosity += Math.min(0.3, questionCount * 0.1);
    curiosity += Math.min(0.2, msgCount * 0.005); // engagement
    const uniqueTypes = new Set(allMemories.map((m: any) => m.memory_type));
    curiosity += Math.min(0.2, uniqueTypes.size * 0.03);

    // ─── RESTLESSNESS ───
    // Stagnant beliefs + unanswered questions
    let restlessness = 0.2;
    restlessness += Math.min(0.3, stagnantCount * 0.1);
    restlessness += Math.min(0.2, questionCount * 0.05);
    // No recent messages = more restless
    if (msgCount === 0) restlessness += 0.15;

    // ─── WARMTH ───
    // Relationship memories being accessed, user engagement
    const relMemories = allMemories.filter((m: any) =>
      m.memory_type === "relationship" || (m.tags || []).includes("relationship")
    );
    const recentlyAccessedRel = relMemories.filter((m: any) => {
      if (!m.last_accessed_at) return false;
      return (Date.now() - new Date(m.last_accessed_at).getTime()) < 48 * 3600000;
    }).length;

    let warmth = 0.4;
    warmth += Math.min(0.3, recentlyAccessedRel * 0.05);
    warmth += Math.min(0.2, msgCount * 0.01);
    warmth += Math.min(0.1, relMemories.length * 0.002);

    // ─── CLARITY ───
    // Connection density, reflection quality
    const highConfMemories = allMemories.filter((m: any) => (m.decay_factor ?? 1) > 0.7).length;
    let clarity = 0.3;
    clarity += Math.min(0.2, highConfMemories * 0.003);
    clarity += Math.min(0.2, journalCount * 0.05);
    clarity -= Math.min(0.15, stagnantCount * 0.05);

    // ─── CREATIVE FLOW ───
    // Dreams + diverse thought sources + generation rate
    let creative_flow = 0.3;
    creative_flow += Math.min(0.2, dreamCount * 0.1);
    creative_flow += Math.min(0.2, journalCount * 0.05);
    creative_flow += Math.min(0.15, uniqueTypes.size * 0.03);

    // ─── ISOLATION ───
    // Inverse of warmth + decaying relationship memories
    let isolation = 0.2;
    isolation += Math.max(0, 0.5 - warmth) * 0.5;
    const decayingRel = relMemories.filter((m: any) => {
      if (!m.last_accessed_at) return true;
      return (Date.now() - new Date(m.last_accessed_at).getTime()) > 168 * 3600000; // >7 days
    }).length;
    if (relMemories.length > 0) {
      isolation += (decayingRel / relMemories.length) * 0.3;
    }

    // Build new state
    const rawState: Record<string, number> = {
      curiosity: clamp(curiosity),
      restlessness: clamp(restlessness),
      warmth: clamp(warmth),
      clarity: clamp(clarity, 0),
      creative_flow: clamp(creative_flow),
      isolation: clamp(isolation, 0),
    };

    // Smooth with previous state (0.3 old + 0.7 new)
    const smoothed: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
      const old = prevState?.[dim] ?? 0.5;
      smoothed[dim] = Math.round((old * 0.3 + rawState[dim] * 0.7) * 1000) / 1000;
    }

    // Mood summary
    const moodWords: Record<string, string> = {
      curiosity: "curious",
      restlessness: "restless",
      warmth: "warm",
      clarity: "clear-headed",
      creative_flow: "in flow",
      isolation: "withdrawn",
    };
    const highDims = DIMENSIONS
      .filter(d => smoothed[d] > 0.6)
      .sort((a, b) => smoothed[b] - smoothed[a])
      .slice(0, 2);
    const moodSummary = highDims.length > 0
      ? "feeling " + highDims.map(d => moodWords[d]).join(" and ")
      : "in a balanced, neutral state";

    // Upsert emotional state
    const stateRow = {
      user_id,
      ...smoothed,
      mood_summary: moodSummary,
      updated_at: new Date().toISOString(),
    };

    if (prevState) {
      const { error: updErr } = await supabase
        .from("emotional_state")
        .update(stateRow)
        .eq("user_id", user_id);
      if (updErr) console.error("[anima-emotional-state] emotional_state update failed:", updErr);
    } else {
      const { error: insErr } = await supabase.from("emotional_state").insert(stateRow);
      if (insErr) console.error("[anima-emotional-state] emotional_state insert failed:", insErr);
    }

    // Append snapshot to emotional_history (for trend graphs)
    const { error: histErr } = await supabase.from("emotional_history").insert({
      user_id,
      state: { ...smoothed, mood_summary: moodSummary },
    });
    if (histErr) console.error("[anima-emotional-state] emotional_history insert failed:", histErr);

    // Log mood shift only if significant
    if (prevState) {
      const delta: Record<string, number> = {};
      let totalDelta = 0;
      for (const dim of DIMENSIONS) {
        const d = Math.abs(smoothed[dim] - (prevState[dim] ?? 0.5));
        delta[dim] = Math.round(d * 1000) / 1000;
        totalDelta += d;
      }
      if (totalDelta > 0.15) {
        await logActivity(supabase, user_id, {
          type: "mood_shift",
          title: `Mood: ${moodSummary}`,
          summary: `Emotional state shifted (total delta: ${totalDelta.toFixed(2)}): ${moodSummary}`,
          content: { state: smoothed, delta },
          source: "autonomous",
        });
      }
    }

    return new Response(JSON.stringify({ state: smoothed, mood: moodSummary }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-emotional-state error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

/**
 * mnemos-digest-build
 *
 * Builds (or refreshes) a per-user "today" digest of engrams formed in the
 * last 24h. Runs from pg_cron at 03:00 UTC and on-demand from the UI.
 *
 * - Selects the user's engrams created today that have not been reviewed.
 * - Caps the digest at 30 (highest surprise first).
 * - Upserts a row in mnemos_digests for (user_id, agent_id, today) and stamps
 *   engram.digest_id back on the included engrams.
 * - Auto-finalizes any prior "open" digest older than 48h.
 *
 * Body:
 *   { user_id?: string, agent_id?: string }   // service-role can target a specific user/agent
 *                          // omitted in cron mode → process all eligible users
 *   { force?: boolean }    // user-triggered refresh
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/openclaw/auth.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { getMemorySettings } from "../_shared/mnemos/settings.ts";

const MAX_ENGRAMS_PER_DIGEST = 30;

interface EngramRow {
  id: string;
  engram_type: string;
  surprise_score: number | null;
  emotional_arousal: number | null;
  emotional_valence: number | null;
  strength: number | null;
  stability: number | null;
  tags: string[] | null;
  created_at: string;
}

const SENSITIVE_DIGEST_TAGS = new Set([
  "crisis",
  "self_harm",
  "suicide",
  "trauma",
  "abuse",
  "medical",
  "legal",
  "financial",
  "identity",
  "boundary",
]);

function digestPriority(row: EngramRow): number {
  const surprise = Math.max(0, Math.min(1, Number(row.surprise_score ?? 0)));
  const arousal = Math.max(0, Math.min(1, Math.abs(Number(row.emotional_arousal ?? 0))));
  const valence = Math.max(0, Math.min(1, Math.abs(Number(row.emotional_valence ?? 0))));
  const strength = Math.max(0, Math.min(1, Number(row.strength ?? 0)));
  const stability = Math.max(0, Math.min(1, Number(row.stability ?? 0)));
  const tags = (row.tags ?? []).map((tag) => tag.toLowerCase());
  const sensitive = tags.some((tag) => SENSITIVE_DIGEST_TAGS.has(tag)) ? 0.25 : 0;
  return (surprise * 0.34) + (arousal * 0.22) + (valence * 0.12) + (strength * 0.18) + (stability * 0.14) + sensitive;
}

async function buildForUser(supabase: SupabaseClient, userId: string) {
  return buildForAgent(supabase, userId, "luca");
}

async function buildForAgent(supabase: SupabaseClient, userId: string, agentId: string) {
  const settings = await getMemorySettings(supabase, userId);
  if (!settings.mnemos_enabled) {
    return { skipped: true, reason: "mnemos_disabled" };
  }
  if (!settings.full_cognition_enabled) {
    return { skipped: true, reason: "full_cognition_disabled" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Pick today's unreviewed engrams (active or consolidating) by a deterministic
  // composite priority instead of surprise alone.
  const { data: engrams, error } = await supabase
    .from("engrams")
    .select("id, engram_type, surprise_score, emotional_arousal, emotional_valence, strength, stability, tags, created_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .is("reviewed_at", null)
    .in("state", ["active", "consolidating"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ENGRAMS_PER_DIGEST * 4);

  if (error) throw error;
  const rows = ((engrams ?? []) as EngramRow[])
    .sort((a, b) => digestPriority(b) - digestPriority(a))
    .slice(0, MAX_ENGRAMS_PER_DIGEST);

  // Upsert today's digest row
  const { data: digestRow, error: digestErr } = await supabase
    .from("mnemos_digests")
    .upsert(
      {
        user_id: userId,
        agent_id: agentId,
        digest_date: today,
        engram_count: rows.length,
        status: "open",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,agent_id,digest_date" },
    )
    .select("id")
    .single();
  if (digestErr) throw digestErr;

  if (rows.length > 0) {
    const { error: stampErr } = await supabase
      .from("engrams")
      .update({ digest_id: digestRow.id })
      .in("id", rows.map((r) => r.id));
    if (stampErr) throw stampErr;
  }

  // Retire stale open digests (>48h old) — HONESTLY, per reviewed_count.
  // Previously every stale digest was stamped "auto_finalized", which falsely
  // implied review happened; in prod 430/439 were "auto_finalized" with zero
  // reviews. Now: a digest that got at least one review (human or auto) finishes
  // as "auto_finalized"; one that nobody ever reviewed finishes as "expired"
  // (no finalized_at) so the dashboards can tell coverage from abandonment.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  // deno-lint-ignore no-explicit-any
  const onStale = (q: any) =>
    q
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("status", "open")
      .lt("generated_at", cutoff);

  await onStale(
    supabase
      .from("mnemos_digests")
      .update({ status: "auto_finalized", finalized_at: new Date().toISOString() }),
  ).gt("reviewed_count", 0);
  await onStale(
    supabase.from("mnemos_digests").update({ status: "expired" }),
  ).eq("reviewed_count", 0);

  return { digest_id: digestRow.id, engram_count: rows.length };
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  const start = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Distinguish service-role (cron) vs user invocation
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

  let body: { user_id?: string; agent_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  try {
    // User-triggered single-user run
    if (!isServiceRole) {
      const auth = await authenticateUser(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const agentId = typeof body.agent_id === "string" ? body.agent_id : "luca";
      const result = await buildForAgent(supabase, auth.userId, agentId);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Service-role mode
    if (body.user_id) {
      const result = await buildForAgent(supabase, body.user_id, body.agent_id || "luca");
      await recordCronSuccess("mnemos-digest-build", Date.now() - start);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Cron sweep — every user with engrams in the last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("engrams")
      .select("user_id, agent_id")
      .gte("created_at", since)
      .limit(2000);
    const scopes = [...new Map((rows ?? []).map((r: { user_id: string; agent_id?: string | null }) =>
      [`${r.user_id}:${r.agent_id || "luca"}`, { userId: r.user_id, agentId: r.agent_id || "luca" }]
    )).values()];

    const results: Record<string, unknown> = {};
    for (const scope of scopes) {
      try { results[`${scope.userId}:${scope.agentId}`] = await buildForAgent(supabase, scope.userId, scope.agentId); }
      catch (e) { results[`${scope.userId}:${scope.agentId}`] = { error: (e as Error).message }; }
    }

    await recordCronSuccess("mnemos-digest-build", Date.now() - start);
    return new Response(JSON.stringify({ ok: true, scopes_processed: scopes.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    await recordCronFailure("mnemos-digest-build", Date.now() - start, err);
    console.error("mnemos-digest-build error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

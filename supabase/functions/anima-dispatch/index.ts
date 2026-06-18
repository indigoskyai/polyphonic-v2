import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { loadActiveAgentScopes } from "../_shared/agent-scope.ts";

/**
 * anima-dispatch — fan-out wrapper for per-user autonomous functions.
 *
 * Cron jobs call this with { function: "anima-think" }; it finds active users
 * (any active thread in last 7d) and POSTs { user_id, agent_id } to the target function for each scope.
 *
 * Auth: service_role only.
 */

const ALLOWED = new Set([
  "anima-think",
  "anima-observe",
  "anima-emotional-state",
  "anima-question",
  "anima-initiate",
  "anima-connect",
  "anima-dream",
  "anima-reflect",
  "anima-believe",
  "anima-consolidate",
  "anima-wander",
]);

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  const __jobStart = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "service_role required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetFn: string = body.function;
    if (!targetFn || !ALLOWED.has(targetFn)) {
      return new Response(JSON.stringify({ error: "Invalid or missing 'function' field", allowed: [...ALLOWED] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Active scopes = each user/agent pair with a thread touched in the last 7 days.
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const scopes = await loadActiveAgentScopes(supabase, since);

    if (scopes.length === 0) {
      await recordCronSuccess(`anima-dispatch:${targetFn}`, Date.now() - __jobStart);
      return new Response(JSON.stringify({ skipped: true, reason: "no active scopes", target: targetFn }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fan out — fire-and-track. Don't await sequentially; run in parallel with cap.
    const results: { user_id: string; agent_id: string; status: number; ok: boolean; error?: string }[] = [];
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    // Cap concurrency at 5 to be polite
    const CONCURRENCY = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < scopes.length) {
        const scope = scopes[cursor++];
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/${targetFn}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ user_id: scope.userId, agent_id: scope.agentId }),
          });
          results.push({ user_id: scope.userId, agent_id: scope.agentId, status: resp.status, ok: resp.ok });
          if (!resp.ok) {
            const txt = await resp.text();
            console.error(`[dispatch] ${targetFn} → ${scope.userId}/${scope.agentId} failed ${resp.status}: ${txt.slice(0, 200)}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          results.push({ user_id: scope.userId, agent_id: scope.agentId, status: 0, ok: false, error: msg });
          console.error(`[dispatch] ${targetFn} → ${scope.userId}/${scope.agentId} threw:`, msg);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scopes.length) }, () => worker()));

    const ok = results.filter((r) => r.ok).length;
    await recordCronSuccess(`anima-dispatch:${targetFn}`, Date.now() - __jobStart);
    return new Response(JSON.stringify({
      target: targetFn,
      scopes_dispatched: scopes.length,
      ok,
      failed: results.length - ok,
      results: results.slice(0, 50),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const targetForLog = (typeof e === "object" && e !== null && "target" in e) ? String((e as any).target) : "unknown";
    await recordCronFailure(`anima-dispatch:${targetForLog}`, Date.now() - __jobStart, e);
    console.error("anima-dispatch fatal:", e);
    return new Response(JSON.stringify({ error: "Internal server error", code: "internal_error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

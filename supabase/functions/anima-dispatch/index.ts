import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";

/**
 * anima-dispatch — fan-out wrapper for per-user autonomous functions.
 *
 * Cron jobs call this with { function: "anima-think" }; it finds active users
 * (any message in last 7d) and POSTs { user_id } to the target function for each.
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

    // Active users = anyone who messaged in the last 7 days
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: rows } = await supabase
      .from("messages")
      .select("user_id")
      .gte("created_at", since);

    const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no active users", target: targetFn }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fan out — fire-and-track. Don't await sequentially; run in parallel with cap.
    const results: { user_id: string; status: number; ok: boolean; error?: string }[] = [];
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    // Cap concurrency at 5 to be polite
    const CONCURRENCY = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < userIds.length) {
        const i = cursor++;
        const uid = userIds[i];
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/${targetFn}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ user_id: uid }),
          });
          results.push({ user_id: uid, status: resp.status, ok: resp.ok });
          if (!resp.ok) {
            const txt = await resp.text();
            console.error(`[dispatch] ${targetFn} → ${uid} failed ${resp.status}: ${txt.slice(0, 200)}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          results.push({ user_id: uid, status: 0, ok: false, error: msg });
          console.error(`[dispatch] ${targetFn} → ${uid} threw:`, msg);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, userIds.length) }, () => worker()));

    const ok = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({
      target: targetFn,
      users_dispatched: userIds.length,
      ok,
      failed: results.length - ok,
      results: results.slice(0, 50),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("anima-dispatch fatal:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

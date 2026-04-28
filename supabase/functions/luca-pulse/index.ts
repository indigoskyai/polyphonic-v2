/**
 * luca-pulse — fast, cheap loop that runs every 15 minutes.
 *
 * Unlike anima-heartbeat (deep, every 2h), pulse handles inbox-style work:
 *   1. Drain entity_task_queue (max 1 task per cycle)
 *   2. Fire any due reminders / scheduled_tasks (deferred to A2.5; stub today)
 *   3. Surface stale, important things the user hasn't seen yet:
 *      - Pending high-curiosity questions over 24h old still pending
 *      - Initiations sitting in 'pending' for > 4h
 *
 * Cost: zero LLM calls in the no-signal case. Only model use is the existing
 * task-queue handler (which routes to anima-web-search etc).
 *
 * Auth: service_role only (called by pg_cron).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${serviceRole}`) {
      return new Response(JSON.stringify({ error: "service_role only" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(url, serviceRole);
    const internalHeaders = {
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    };

    const summary = {
      tasks_processed: 0,
      reminders_fired: 0,
      stale_initiations: 0,
      cycles: 0,
    };

    // Active users: had a message in the last 14 days
    const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
    const { data: activeMessages } = await supabase
      .from("messages")
      .select("user_id")
      .gte("created_at", since);

    const userIds = [...new Set((activeMessages ?? []).map((m: any) => m.user_id))];
    summary.cycles = userIds.length;

    // ── Phase 1: drain a single task per user ──
    // Soft-fails if entity_task_queue isn't present in this project.
    for (const userId of userIds) {
      const taskRes = await supabase
        .from("entity_task_queue")
        .select("id, description, metadata")
        .eq("user_id", userId)
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (taskRes.error) {
        // Table doesn't exist in this project — skip phase entirely.
        break;
      }
      const task = taskRes.data;
      if (!task) continue;

      try {
        await supabase
          .from("entity_task_queue")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", task.id);

        // Route by description heuristic — same as heartbeat
        const desc = (task.description ?? "").toLowerCase();
        let fn = "anima-web-search";
        let payload: Record<string, unknown> = {
          query: task.description,
          user_id: userId,
        };
        const urlMatch = (task.description ?? "").match(/https?:\/\/[^\s]+/);
        if (urlMatch && (desc.includes("read") || desc.includes("http"))) {
          fn = "anima-web-read";
          payload = { url: urlMatch[0], user_id: userId };
        }

        const resp = await fetch(`${url}/functions/v1/${fn}`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify(payload),
        });
        const result = resp.ok
          ? await resp.json().catch(() => ({}))
          : { error: `${fn} ${resp.status}` };

        await supabase
          .from("entity_task_queue")
          .update({
            status: resp.ok ? "completed" : "failed",
            completed_at: new Date().toISOString(),
            result: JSON.stringify(result).slice(0, 10000),
          })
          .eq("id", task.id);

        if (resp.ok) {
          summary.tasks_processed += 1;
          await logActivity(supabase, userId, {
            type: "task_completed",
            title: "Pulse: Task completed",
            summary: (task.description ?? "").slice(0, 120),
            severity: "notable",
            source: "luca-pulse",
            content: { task_id: task.id, function: fn },
          });
        } else {
          await logActivity(supabase, userId, {
            type: "task_failed",
            title: "Pulse: Task failed",
            summary: (task.description ?? "").slice(0, 120),
            severity: "info",
            surfaceToUser: false,
            source: "luca-pulse",
            content: { task_id: task.id, function: fn, result },
          });
        }
      } catch (taskErr) {
        const errMsg = taskErr instanceof Error ? taskErr.message : "unknown";
        await supabase
          .from("entity_task_queue")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            result: `Error: ${errMsg}`,
          })
          .eq("id", task.id);
      }
    }

    // ── Phase 2: surface stale pending initiations ──
    // If an initiation has been 'pending' for > 4 hours, escalate severity by
    // re-emitting an activity log entry the user will see in the welcome card.
    const fourHoursAgo = new Date(Date.now() - 4 * 3600_000).toISOString();
    const { data: staleInits } = await supabase
      .from("thought_initiations")
      .select("id, user_id, message, created_at")
      .eq("status", "pending")
      .lt("created_at", fourHoursAgo)
      .limit(20);

    for (const init of staleInits ?? []) {
      summary.stale_initiations += 1;
      // Run through the initiate gate with notable severity so it can
      // optionally fire push later (push delivery to follow in A1.x).
      try {
        await fetch(`${url}/functions/v1/luca-initiate`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            user_id: init.user_id,
            severity: "notable",
            title: "Luca has been waiting",
            summary: (init.message ?? "").slice(0, 200),
          }),
        });
      } catch (_) {
        // best-effort
      }
    }

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("luca-pulse error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

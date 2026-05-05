import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { buildLucaSystemPrompt } from "../_shared/agents/luca-soul.ts";
import {
  buildLucaPromptPartsFromContinuity,
  loadContinuityPacket,
  logContinuityDiagnostics,
} from "../_shared/continuity/index.ts";
import { dispatchProactiveEngagement } from "../_shared/proactive-engagement.ts";

const SCHEDULED_MODEL = "anthropic/claude-opus-4-7";

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${serviceRole}`) {
      return json({ error: "service_role only" }, 401, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const supabase = createClient(url, serviceRole);
    const now = new Date().toISOString();

    const query = supabase
      .from("scheduled_tasks")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", now)
      .order("next_run_at", { ascending: true })
      .limit(5);

    const { data: tasks, error } = body.task_id
      ? await supabase.from("scheduled_tasks").select("*").eq("id", body.task_id).limit(1)
      : await query;

    if (error) return json({ ok: false, error: error.message }, 500, corsHeaders);

    const results = [];
    for (const task of tasks || []) {
      results.push(await runTask(supabase, url, serviceRole, task));
    }

    return json({ ok: true, ran: results.length, results }, 200, corsHeaders);
  } catch (err) {
    console.error("scheduled-task-run error:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

async function runTask(supabase: any, url: string, serviceRole: string, task: any) {
  const startedAt = new Date();
  try {
    const { data: apiKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: task.user_id });
    if (!apiKey) throw new Error("No OpenRouter key configured");

    let threadId = task.target_thread_id;
    if (!threadId) {
      const { data: thread, error: threadError } = await supabase
        .from("threads")
        .insert({ user_id: task.user_id, title: task.name, agent_id: task.agent_id || "luca" })
        .select("id")
        .single();
      if (threadError) throw new Error(threadError.message);
      threadId = thread.id;
    }

    const scheduledPrompt = `[Scheduled task: ${task.name}]\n${task.prompt}`;
    await supabase.from("messages").insert({
      user_id: task.user_id,
      thread_id: threadId,
      role: "user",
      content: scheduledPrompt,
      kind: "scheduled_task",
      metadata: { scheduled_task_id: task.id },
    });

    const response = await callLuca(supabase, task.user_id, threadId, scheduledPrompt, apiKey);
    await supabase.from("messages").insert({
      user_id: task.user_id,
      thread_id: threadId,
      role: "assistant",
      content: response,
      agent: task.agent_id || "luca",
      model: SCHEDULED_MODEL,
      kind: "scheduled_task_result",
      metadata: { scheduled_task_id: task.id },
    });

    if (task.delivery_mode !== "silent") {
      const severity = task.delivery_mode === "in_app" ? "info" : "notable";
      await dispatchProactiveEngagement(supabase, url, serviceRole, {
        userId: task.user_id,
        source: "scheduled_task",
        severity,
        title: task.name,
        summary: response.slice(0, 240),
        rationale: `Scheduled task "${task.name}" finished (cadence: ${task.schedule_expr}).`,
        activityType: "scheduled_task_run",
        content: {
          scheduled_task_id: task.id,
          thread_id: threadId,
          delivery_mode: task.delivery_mode,
        },
      });
    }

    await supabase.from("scheduled_tasks").update({
      target_thread_id: threadId,
      last_run_at: startedAt.toISOString(),
      last_run_status: "success",
      next_run_at: nextRunAt(task.schedule_expr, startedAt).toISOString(),
    }).eq("id", task.id);

    return { id: task.id, status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("scheduled_tasks").update({
      last_run_at: startedAt.toISOString(),
      last_run_status: "error",
      next_run_at: nextRunAt(task.schedule_expr, startedAt).toISOString(),
    }).eq("id", task.id);
    return { id: task.id, status: "error", error: message };
  }
}

async function callLuca(supabase: any, userId: string, threadId: string, prompt: string, apiKey: string): Promise<string> {
  const continuity = await loadContinuityPacket(supabase, {
    userId,
    agentId: "luca",
    threadId,
    userMessage: prompt,
    apiKey,
    historyLimit: 30,
    includePendingRevisions: false,
  });
  logContinuityDiagnostics(continuity, "scheduled-task.continuity");

  const systemPrompt = buildLucaSystemPrompt({
    ...buildLucaPromptPartsFromContinuity(continuity, {
      continuityNote: "\n\n[This is a scheduled task. Complete it directly and briefly. Do not pretend the user is present in real time.]",
    }),
  });

  const messages = [
    { role: "system", content: systemPrompt },
    ...continuity.history.map((m: any) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://polyphonic.chat",
      "X-Title": "Polyphonic Scheduled Task",
    },
    body: JSON.stringify({
      model: SCHEDULED_MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 1800,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "I ran the scheduled task, but there was no response content.";
}

function nextRunAt(expr: string, from: Date): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return new Date(from.getTime() + 24 * 3600_000);

  const [minuteRaw, hourRaw, , , dowRaw] = parts;
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) {
    const everyMatch = minuteRaw.match(/^\*\/(\d+)$/);
    const everyMinutes = everyMatch ? Math.max(15, Number(everyMatch[1])) : 1440;
    return new Date(from.getTime() + everyMinutes * 60_000);
  }

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  if (dowRaw !== "*") {
    const wanted = dowToNumber(dowRaw);
    let days = (wanted - next.getDay() + 7) % 7;
    if (days === 0 && next <= from) days = 7;
    next.setDate(next.getDate() + days);
    return next;
  }

  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}

function dowToNumber(value: string): number {
  const map: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const numeric = Number(value);
  return map[value.toUpperCase()] ?? (Number.isFinite(numeric) ? numeric : 1);
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

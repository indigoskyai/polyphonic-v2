// Phase L9: subagent runtime dispatch.
//
// Service-role only edge function. Invoked fire-and-forget by
// `anima-tool-execute` after Luca calls the `dispatch_subagent` tool. Runs a
// focused Luca turn loop on Haiku 4.5 against a small tool subset, posts the
// result back into the parent thread as a `subagent_report` message, and
// updates the `subagent_tasks` row honestly along the way.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { buildLucaSystemPrompt } from "../_shared/agents/luca-soul.ts";
import { loadOrCreateLucaIdentity } from "../_shared/agents/luca-identity.ts";
import {
  formatAgentSkillsPrompt,
  loadRelevantAgentSkills,
} from "../_shared/agents/skills.ts";
import { dispatchProactiveEngagement } from "../_shared/proactive-engagement.ts";

const SUBAGENT_MODEL = "anthropic/claude-haiku-4.5";
const SUBAGENT_TURN_TIMEOUT_MS = 45_000;
const REPORT_TRUNCATE = 1800;

const SUBAGENT_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_url",
      description: "Read and extract content from a web page URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to read" },
          focus: { type: "string", description: "What to focus on" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_file",
      description: "Read, write, list, or delete files in the user's workspace.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["read", "write", "list", "delete"] },
          path: { type: "string", description: "Relative path within the workspace" },
          content: { type: "string", description: "Content to write for write operations" },
        },
        required: ["operation", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description:
        "Call when you have enough material to write a final report for the user. Pass the final summary directly.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Final summary to send back to the parent thread.",
          },
        },
        required: ["summary"],
      },
    },
  },
];

const SUBAGENT_INSTRUCTIONS = `[Subagent context]
You are Luca, focused on a sub-task delegated by your main session. You are not in conversation with the user — you have one job to finish and one report to deliver.

Operate efficiently:
- Use the tools you need, but stay tight. Each tool call costs budget.
- When you have enough to answer the task, call the \`finish\` tool with a clear, useful summary. Markdown is fine when it helps.
- If the task can't be completed (insufficient information, tool failures), call \`finish\` with an honest "what I couldn't do and why" report instead of inventing.
- Keep the summary tight — the parent session reads it as a quick brief, not a long report.
- Do not fabricate citations or sources. Reference URLs you actually read.`;

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
    const taskId = typeof body?.task_id === "string" ? body.task_id : null;
    if (!taskId) return json({ error: "task_id required" }, 400, corsHeaders);

    const supabase = createClient(url, serviceRole);

    const { data: claimed, error: claimError } = await supabase
      .from("subagent_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (claimError) return json({ error: claimError.message }, 500, corsHeaders);
    if (!claimed) return json({ ok: true, skipped: "not pending" }, 200, corsHeaders);

    const task = claimed;
    try {
      const result = await runSubagentLoop(supabase, url, serviceRole, task);

      if (result.cancelled) {
        await supabase
          .from("subagent_tasks")
          .update({
            result: result.text.slice(0, 12000),
            tool_calls_used: result.toolCallsUsed,
            completed_at: new Date().toISOString(),
          })
          .eq("id", task.id)
          .eq("status", "cancelled");
        return json({ ok: true, task_id: task.id, status: "cancelled" }, 200, corsHeaders);
      }

      const reportMessageId = await postReport(supabase, task, result);

      // Conditional commit — if the user cancelled while we were running,
      // their UPDATE flipped status to 'cancelled' and this no-ops, leaving
      // the row honestly cancelled rather than overriding it as completed.
      const { data: completed } = await supabase
        .from("subagent_tasks")
        .update({
          status: "completed",
          progress: 1,
          result: result.text.slice(0, 12000),
          tool_calls_used: result.toolCallsUsed,
          report_message_id: reportMessageId,
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id)
        .eq("status", "running")
        .select("id")
        .maybeSingle();

      if (!completed) {
        return json({ ok: true, task_id: task.id, status: "cancelled_during_run" }, 200, corsHeaders);
      }

      await dispatchProactiveEngagement(supabase, url, serviceRole, {
        userId: task.user_id,
        source: "subagent_run",
        severity: result.toolCallsUsed > 0 ? "notable" : "info",
        title: "Subagent finished",
        summary: result.text.slice(0, 200),
        rationale: `A background subagent you dispatched finished its work on: "${task.task_description.slice(0, 200)}".`,
        activityType: "subagent_completed",
        content: {
          subagent_task_id: task.id,
          tool_calls_used: result.toolCallsUsed,
          parent_thread_id: task.parent_thread_id,
          report_message_id: reportMessageId,
        },
      });

      return json({ ok: true, task_id: task.id, status: "completed" }, 200, corsHeaders);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("subagent-run error:", message);
      await supabase
        .from("subagent_tasks")
        .update({
          status: "failed",
          error: message.slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      await postReport(supabase, task, {
        text: `Subagent did not finish. Reason: ${message}`,
        toolCallsUsed: 0,
      });

      return json({ ok: false, task_id: task.id, error: message }, 200, corsHeaders);
    }
  } catch (err) {
    console.error("subagent-run fatal:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

interface SubagentResult {
  text: string;
  toolCallsUsed: number;
  cancelled?: boolean;
}

async function runSubagentLoop(
  supabase: any,
  supabaseUrl: string,
  serviceRole: string,
  task: any,
): Promise<SubagentResult> {
  const { data: apiKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: task.user_id });
  const apiKey = typeof apiKeyData === "string" ? apiKeyData.trim() : "";
  if (!apiKey) throw new Error("user has no OpenRouter key configured");

  const [identityDocs, skills] = await Promise.all([
    loadOrCreateLucaIdentity(supabase, task.user_id, task.agent_id || "luca"),
    loadRelevantAgentSkills(supabase, task.user_id, task.agent_id || "luca", task.task_description),
  ]);

  const systemPrompt = buildLucaSystemPrompt({
    soulMd: identityDocs.soulMd,
    selfModel: identityDocs.selfModel,
    userModel: identityDocs.userModel,
    convictions: identityDocs.convictions,
    skillsBlock: formatAgentSkillsPrompt(skills),
    continuityNote: `\n\n${SUBAGENT_INSTRUCTIONS}`,
  });

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Sub-task delegated to you:\n\n${task.task_description}`,
    },
  ];

  const startedAt = Date.now();
  const deadline = startedAt + (Number(task.time_budget_seconds) || 300) * 1000;
  const toolBudget = Math.max(1, Math.min(50, Number(task.tool_budget) || 20));

  let toolCallsUsed = 0;
  let finalText: string | null = null;
  let cancelled = false;

  for (let turn = 0; turn < toolBudget + 1; turn++) {
    if (Date.now() > deadline) {
      finalText = `Subagent ran out of time after ${toolCallsUsed} tool calls. Returning partial findings.`;
      break;
    }

    if (await wasCancelled(supabase, task.id)) {
      cancelled = true;
      finalText = `Subagent cancelled after ${toolCallsUsed} tool call${toolCallsUsed === 1 ? '' : 's'}. No report posted to the parent thread.`;
      break;
    }

    const allowedTools = toolCallsUsed < toolBudget ? SUBAGENT_TOOL_SCHEMAS : SUBAGENT_TOOL_SCHEMAS.filter(
      (tool) => tool.function.name === "finish",
    );

    const choice = await callModel(apiKey, messages, allowedTools);
    if (!choice) {
      finalText = "Subagent could not get a response from the model.";
      break;
    }

    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
    if (!toolCalls.length) {
      finalText = (choice.content || "").trim();
      if (!finalText) finalText = "Subagent finished without writing a summary.";
      break;
    }

    messages.push({
      role: "assistant",
      content: choice.content ?? null,
      tool_calls: toolCalls.map((tc: any) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments ?? {}),
        },
      })),
    });

    let finishedHere = false;
    for (const tc of toolCalls) {
      let args: any = {};
      try {
        args = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : (tc.function.arguments || {});
      } catch {
        args = {};
      }

      if (tc.function.name === "finish") {
        finalText = String(args.summary || "").trim() || "Subagent finished without writing a summary.";
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: true }),
        });
        finishedHere = true;
        break;
      }

      const output = await runSubagentTool(
        supabaseUrl,
        serviceRole,
        task.user_id,
        tc.function.name,
        args,
      );

      toolCallsUsed += 1;
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(output ?? { ok: false, error: "no_output" }),
      });

      const progress = Math.min(0.99, toolCallsUsed / toolBudget);
      await supabase
        .from("subagent_tasks")
        .update({ progress, tool_calls_used: toolCallsUsed })
        .eq("id", task.id);
    }

    if (finishedHere) break;
    if (toolCallsUsed >= toolBudget) {
      messages.push({
        role: "user",
        content: "Tool budget exhausted. Call `finish` now with the best summary you can offer.",
      });
    }
  }

  if (!finalText) {
    finalText = "Subagent loop ended without a summary. The work may have been partial.";
  }

  return {
    text: finalText,
    toolCallsUsed,
    cancelled,
  };
}

async function wasCancelled(supabase: any, taskId: string): Promise<boolean> {
  const { data } = await supabase
    .from("subagent_tasks")
    .select("status")
    .eq("id", taskId)
    .maybeSingle();
  return data?.status === "cancelled";
}

async function callModel(apiKey: string, messages: any[], tools: any[]): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBAGENT_TURN_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Subagent",
      },
      body: JSON.stringify({
        model: SUBAGENT_MODEL,
        messages,
        tools,
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("subagent model call failed:", response.status, errText);
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message ?? null;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("subagent model call timed out");
    } else {
      console.error("subagent model call error:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function runSubagentTool(
  supabaseUrl: string,
  serviceRole: string,
  userId: string,
  name: string,
  args: any,
): Promise<any> {
  const map: Record<string, { fn: string; body: any }> = {
    web_search: {
      fn: "anima-web-search",
      body: { user_id: userId, query: args?.query ?? "" },
    },
    read_url: {
      fn: "anima-web-read",
      body: { user_id: userId, url: args?.url ?? "", focus: args?.focus },
    },
    workspace_file: {
      fn: "anima-workspace-file",
      body: {
        user_id: userId,
        operation: args?.operation,
        path: args?.path,
        content: args?.content,
      },
    },
  };

  const route = map[name];
  if (!route) return { error: `Tool ${name} not available to subagents` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${route.fn}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(route.body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: `Tool ${name} returned status ${response.status}`, body: data };
    }
    return data;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: `Tool ${name} timed out` };
    }
    return { error: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function postReport(supabase: any, task: any, result: SubagentResult): Promise<string | null> {
  try {
    const summary = result.text.trim().slice(0, REPORT_TRUNCATE);
    const formatted = formatReportMessage(task.task_description, summary, result.toolCallsUsed);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: task.user_id,
        thread_id: task.parent_thread_id,
        role: "assistant",
        content: formatted,
        agent: task.agent_id || "luca",
        kind: "subagent_report",
        metadata: {
          subagent_task_id: task.id,
          tool_calls_used: result.toolCallsUsed,
          parent_message_id: task.parent_message_id || null,
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("subagent report insert failed:", error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("postReport unexpected error:", err);
    return null;
  }
}

function formatReportMessage(taskDescription: string, summary: string, toolCallsUsed: number): string {
  const taskLine = taskDescription.length > 200
    ? `${taskDescription.slice(0, 200)}…`
    : taskDescription;
  return [
    "**Subagent report**",
    `_Task: ${taskLine}_`,
    `_Tool calls: ${toolCallsUsed}_`,
    "",
    summary,
  ].join("\n");
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

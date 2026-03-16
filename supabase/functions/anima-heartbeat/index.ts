import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { evaluate, logProcessRan } from "../_shared/activity-gate.ts";
import { logActivity } from "../_shared/activity-log.ts";

/**
 * anima-heartbeat — autonomous loop that runs every 2 hours via cron.
 *
 * For each active user:
 *   1. Check activity gate cooldown
 *   2. Scan signals (curiosity questions, thoughts, beliefs, emotional state)
 *   3. Execute 1-2 actions max (cost control)
 *   4. Process queued tasks (max 2 per cycle)
 *   5. Log all activity
 *
 * Auth: service_role_key only (called by cron, not users).
 */

interface UserAction {
  userId: string;
  action: string;
  result?: unknown;
  error?: string;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: only accept service_role_key
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized — service role only" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const internalHeaders = {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    // Find active users (messages in the last 7 days)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeMessages } = await supabase
      .from("messages")
      .select("user_id")
      .gte("created_at", since);

    if (!activeMessages || activeMessages.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No active users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate user IDs
    const userIds = [...new Set(activeMessages.map((m: any) => m.user_id))];
    const results: UserAction[] = [];

    // ─── Phase 1: Process each active user ───
    for (const userId of userIds) {
      try {
        // Check activity gate
        const gate = await evaluate(supabase, userId, "heartbeat");
        if (!gate.shouldRun) {
          results.push({ userId, action: "skipped", result: gate.reason });
          continue;
        }

        const actions = await processUser(supabase, supabaseUrl, internalHeaders, userId);
        results.push(...actions);

        // Log that heartbeat ran for this user
        await logProcessRan(supabase, userId, "heartbeat", {
          actions_taken: actions.length,
          actions: actions.map((a) => a.action),
        });
      } catch (userErr) {
        // One user failing doesn't crash the batch
        const errMsg = userErr instanceof Error ? userErr.message : "Unknown error";
        console.error(`Heartbeat error for user ${userId}:`, errMsg);
        results.push({ userId, action: "error", error: errMsg });
      }
    }

    // ─── Phase 2: Process task queue ───
    const taskResults = await processTaskQueue(supabase, supabaseUrl, internalHeaders);

    return new Response(
      JSON.stringify({
        users_checked: userIds.length,
        actions: results,
        tasks_processed: taskResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("anima-heartbeat fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Process a single user: scan signals, pick 1-2 actions, execute them.
 */
async function processUser(
  supabase: any,
  supabaseUrl: string,
  headers: Record<string, string>,
  userId: string,
): Promise<UserAction[]> {
  const actions: UserAction[] = [];
  const MAX_ACTIONS = 2;

  // Load signals in parallel
  const [questionsResult, thoughtsResult, beliefsResult, emotionalResult] = await Promise.all([
    supabase
      .from("curiosity_questions")
      .select("id, question, curiosity_score")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("curiosity_score", { ascending: false })
      .limit(3),
    supabase
      .from("thought_stream")
      .select("id, content, salience, thought_type")
      .eq("user_id", userId)
      .order("salience", { ascending: false })
      .limit(3),
    supabase
      .from("beliefs")
      .select("id, content, confidence")
      .eq("user_id", userId)
      .eq("stagnant", true)
      .limit(3),
    supabase
      .from("emotional_state")
      .select("curiosity, excitement")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const questions = questionsResult.data ?? [];
  const thoughts = thoughtsResult.data ?? [];
  const stagnantBeliefs = beliefsResult.data ?? [];
  const emotional = emotionalResult.data;

  // ─── Priority 1: High-salience unresolved curiosity questions → web search ───
  const highCuriosityQ = questions.find((q: any) => (q.curiosity_score ?? 0) >= 0.7);
  if (highCuriosityQ && actions.length < MAX_ACTIONS) {
    const result = await callFunction(supabaseUrl, headers, "anima-web-search", {
      query: highCuriosityQ.question,
      user_id: userId,
    });

    actions.push({ userId, action: "web_search_curiosity", result });

    await logActivity(supabase, userId, {
      type: "question_researched",
      title: "Heartbeat: Question Researched",
      summary: `Researched curiosity question: ${highCuriosityQ.question.slice(0, 100)}`,
      content: { question_id: highCuriosityQ.id, function: "anima-web-search" },
    });

    // Mark question as being worked on
    await supabase
      .from("curiosity_questions")
      .update({ status: "shown", shown_at: new Date().toISOString() })
      .eq("id", highCuriosityQ.id);
  }

  // ─── Priority 2: High-salience thoughts → deeper reflection ───
  const highSalienceThought = thoughts.find((t: any) => (t.salience ?? 0) >= 0.7);
  if (highSalienceThought && actions.length < MAX_ACTIONS) {
    const result = await callFunction(supabaseUrl, headers, "anima-reflect", {
      user_id: userId,
      thought_id: highSalienceThought.id,
      thought_content: highSalienceThought.content,
    });

    actions.push({ userId, action: "reflect_on_thought", result });

    await logActivity(supabase, {
      user_id: userId,
      process_type: "heartbeat",
      action_type: "thought_deepened",
      summary: `Deepened reflection on: ${highSalienceThought.content.slice(0, 100)}`,
      metadata: { thought_id: highSalienceThought.id, function: "anima-reflect" },
    });
  }

  // ─── Priority 3: Stagnant beliefs → challenge them ───
  const stagnantBelief = stagnantBeliefs[0];
  if (stagnantBelief && actions.length < MAX_ACTIONS) {
    const result = await callFunction(supabaseUrl, headers, "anima-believe", {
      user_id: userId,
      belief_id: stagnantBelief.id,
      belief_content: stagnantBelief.content,
      action: "challenge",
    });

    actions.push({ userId, action: "challenge_belief", result });

    await logActivity(supabase, {
      user_id: userId,
      process_type: "heartbeat",
      action_type: "belief_challenged",
      summary: `Challenged stagnant belief: ${stagnantBelief.content.slice(0, 100)}`,
      metadata: { belief_id: stagnantBelief.id, function: "anima-believe" },
    });
  }

  // ─── Priority 4: High curiosity emotional state → explore topics from recent conversations ───
  if (emotional && (emotional.curiosity ?? 0) >= 0.7 && actions.length < MAX_ACTIONS) {
    // Find a recent conversation topic to explore
    const { data: recentMsg } = await supabase
      .from("messages")
      .select("content")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentMsg?.content) {
      // Extract a topic snippet (first 200 chars) to search on
      const topic = recentMsg.content.slice(0, 200);
      const result = await callFunction(supabaseUrl, headers, "anima-web-search", {
        query: `Interesting perspectives on: ${topic}`,
        user_id: userId,
      });

      actions.push({ userId, action: "curiosity_exploration", result });

      await logActivity(supabase, {
        user_id: userId,
        process_type: "heartbeat",
        action_type: "curiosity_explored",
        summary: `Explored topic from high curiosity state: ${topic.slice(0, 80)}`,
        metadata: { function: "anima-web-search", emotional_curiosity: emotional.curiosity },
      });
    }
  }

  // If no signals triggered any action, log a quiet cycle
  if (actions.length === 0) {
    actions.push({ userId, action: "quiet_cycle", result: "No actionable signals" });

    await logActivity(supabase, {
      user_id: userId,
      process_type: "heartbeat",
      action_type: "quiet_cycle",
      summary: "Heartbeat ran but found no actionable signals",
    });
  }

  return actions;
}

/**
 * Process the global task queue — max 2 tasks per cycle.
 */
async function processTaskQueue(
  supabase: any,
  supabaseUrl: string,
  headers: Record<string, string>,
): Promise<UserAction[]> {
  const results: UserAction[] = [];
  const MAX_TASKS = 2;

  const { data: queuedTasks } = await supabase
    .from("entity_task_queue")
    .select("id, user_id, description, metadata")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(MAX_TASKS);

  if (!queuedTasks || queuedTasks.length === 0) {
    return results;
  }

  for (const task of queuedTasks) {
    try {
      // Mark as running
      await supabase
        .from("entity_task_queue")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", task.id);

      // Route to appropriate function based on description
      const desc = task.description.toLowerCase();
      let functionName: string;
      let payload: Record<string, unknown>;

      if (desc.includes("search") || desc.includes("lookup") || desc.includes("find")) {
        functionName = "anima-web-search";
        payload = { query: task.description, user_id: task.user_id };
      } else if (desc.includes("http") || desc.includes("url") || desc.includes("read")) {
        // Extract URL from description if present
        const urlMatch = task.description.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          functionName = "anima-web-read";
          payload = { url: urlMatch[0], user_id: task.user_id };
        } else {
          functionName = "anima-web-search";
          payload = { query: task.description, user_id: task.user_id };
        }
      } else {
        // Default: treat as a search query
        functionName = "anima-web-search";
        payload = { query: task.description, user_id: task.user_id };
      }

      const result = await callFunction(supabaseUrl, headers, functionName, payload);

      // Store result and mark complete
      const resultText = typeof result === "string" ? result : JSON.stringify(result);
      await supabase
        .from("entity_task_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: resultText.slice(0, 10000), // Cap result size
        })
        .eq("id", task.id);

      results.push({
        userId: task.user_id,
        action: `task_completed:${functionName}`,
        result: { task_id: task.id, function: functionName },
      });

      await logActivity(supabase, {
        user_id: task.user_id,
        process_type: "heartbeat",
        action_type: "task_completed",
        summary: `Completed queued task: ${task.description.slice(0, 100)}`,
        metadata: { task_id: task.id, function: functionName },
      });
    } catch (taskErr) {
      const errMsg = taskErr instanceof Error ? taskErr.message : "Unknown error";
      console.error(`Task ${task.id} failed:`, errMsg);

      await supabase
        .from("entity_task_queue")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          result: `Error: ${errMsg}`,
        })
        .eq("id", task.id);

      results.push({
        userId: task.user_id,
        action: "task_failed",
        error: errMsg,
      });

      await logActivity(supabase, {
        user_id: task.user_id,
        process_type: "heartbeat",
        action_type: "task_failed",
        summary: `Task failed: ${task.description.slice(0, 100)}`,
        metadata: { task_id: task.id, error: errMsg },
      });
    }
  }

  return results;
}

/**
 * Call another edge function internally using the service role key.
 * Returns the parsed JSON response, or an error string on failure.
 */
async function callFunction(
  supabaseUrl: string,
  headers: Record<string, string>,
  functionName: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`${functionName} returned ${resp.status}: ${errText.slice(0, 300)}`);
      return { error: `${functionName} returned ${resp.status}`, detail: errText.slice(0, 200) };
    }

    return await resp.json();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown fetch error";
    console.error(`Failed to call ${functionName}:`, errMsg);
    return { error: `Failed to call ${functionName}`, detail: errMsg };
  }
}

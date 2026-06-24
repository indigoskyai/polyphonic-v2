// observer-watch — fired after each assistant turn. Inspects the recent
// conversation and inserts 0..N observer_notes if anything is worth recording.
// Best-effort and non-blocking from the caller's perspective.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { isDialecticEnabled } from "../_shared/config.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { OBSERVER_SOUL, OBSERVER_WATCH_INSTRUCTIONS } from "../_shared/agents/observer-soul.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { resolveOpenRouterKeyForUser } from "../_shared/model-backend.ts";
import { normalizeAgentId, resolveScopeAgentId } from "../_shared/agent-scope.ts";

// EXEMPT from the agent-family model rule: the observer is a distinct cross-session
// monitor (see observer-chat) — a wise, discerning, fast, inexpensive model chosen
// for the monitoring role, NOT a mirror of the agent's family.
const OBSERVER_MODEL = "anthropic/claude-haiku-4.5";

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  const __jobStart = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { thread_id, agent_id } = await req.json();
    if (!thread_id) {
      return new Response(JSON.stringify({ error: "Missing thread_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, user_id, agent_id, primary_agent_id")
      .eq("id", thread_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (threadError) {
      console.error("[observer-watch] thread lookup failed:", threadError);
      return new Response(JSON.stringify({ error: "Thread lookup failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hasRequestedAgentId = typeof agent_id === "string" && agent_id.trim().length > 0;
    const requestedAgentId = normalizeAgentId(agent_id);
    const agentId = resolveScopeAgentId(thread);
    if (hasRequestedAgentId && requestedAgentId !== agentId) {
      console.warn("[observer-watch] ignored mismatched requested agent", {
        requestedAgentId,
        threadAgentId: agentId,
        thread_id,
        user_id: user.id,
      });
    }
    const dialecticEnabled = isDialecticEnabled(user.id);

    const { apiKey } = await resolveOpenRouterKeyForUser(supabase, user.id);
    if (!apiKey) {
      // No key, nothing to do — return silently.
      return new Response(JSON.stringify({ ok: true, skipped: "no_api_key" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load recent thread + prior notes + emotional state in parallel
    const [historyRes, notesRes, emotionalRes] = await Promise.allSettled([
      supabase.from("messages")
        .select("id, role, content, agent, created_at")
        .eq("user_id", user.id)
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("observer_notes")
        .select("kind, content, created_at")
        .eq("user_id", user.id)
        .eq("agent_id", agentId)
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: false })
        .limit(15),
      loadEmotionalState(supabase, user.id, agentId),
    ]);

    const history = historyRes.status === "fulfilled" ? (historyRes.value.data || []).reverse() : [];
    const priorNotes = notesRes.status === "fulfilled" ? (notesRes.value.data || []) : [];
    const emotionalBlock = emotionalRes.status === "fulfilled"
      ? formatEmotionalPrompt(emotionalRes.value)
      : "";

    if (history.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "empty_thread" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = history
      .map((m: { role: string; content: string; agent?: string }) => {
        const speaker = m.role === "user"
          ? "user"
          : (m.agent || "assistant");
        return `${speaker}: ${(m.content || "").slice(0, 1200)}`;
      })
      .join("\n\n");

    const priorNotesBlock = priorNotes.length > 0
      ? `\n\nPrior observations on this thread (do not repeat):\n${priorNotes.map((n: { kind: string; content: string }) => `- [${n.kind}] ${n.content}`).join("\n")}`
      : "";

    const userPrompt = [
      `Thread agent: ${agentId}`,
      emotionalBlock ? `\n${emotionalBlock}` : "",
      `\nRecent conversation:\n${transcript}`,
      priorNotesBlock,
      dialecticEnabled ? "" : "\n\nDialectic revisions are currently disabled. Return pending_revisions as an empty array; only observer note insertions are active.",
      `\n\n${OBSERVER_WATCH_INSTRUCTIONS}`,
    ].filter(Boolean).join("\n");

    const orResponse = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Observer",
      },
      body: JSON.stringify({
        model: OBSERVER_MODEL,
        messages: [
          { role: "system", content: OBSERVER_SOUL },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!orResponse.ok) {
      const errText = await orResponse.text().catch(() => "");
      console.error("observer-watch model error:", orResponse.status, errText.slice(0, 300));
      return new Response(JSON.stringify({ ok: false, error: "model_error" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await orResponse.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    let parsed: {
      insertions?: Array<{ kind?: string; content?: string; salience?: number }>;
      pending_revisions?: Array<{
        revision_type?: string;
        what_was_said?: string;
        what_to_say_now?: string;
        rationale?: string;
        confidence?: number;
      }>;
    } = {};
    try {
      // Strip code fences if any
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.warn("observer-watch JSON parse failed:", e, "raw:", raw.slice(0, 200));
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validKinds = new Set(["note", "concern", "welfare", "pattern", "summary"]);
    const insertions = (parsed.insertions || [])
      .filter((i) => i && typeof i.content === "string" && i.content.trim().length > 0)
      .slice(0, 3)
      .map((i) => ({
        user_id: user.id,
        agent_id: agentId,
        thread_id,
        kind: validKinds.has(i.kind || "") ? i.kind! : "note",
        content: i.content!.trim().slice(0, 800),
        salience: typeof i.salience === "number"
          ? Math.max(0, Math.min(1, i.salience))
          : 0.5,
      }));

    if (insertions.length > 0) {
      await supabase.from("observer_notes").insert(insertions);
    }

    const validRevisionTypes = new Set(["correction", "reconsideration", "new_thought", "disagreement"]);
    const assistantMessages = history.filter((m: { role: string }) => m.role === "assistant");
    const revisions = (parsed.pending_revisions || [])
      .filter((revision) =>
        revision &&
        typeof revision.what_was_said === "string" &&
        typeof revision.what_to_say_now === "string" &&
        revision.what_was_said.trim().length > 0 &&
        revision.what_to_say_now.trim().length > 0 &&
        (revision.confidence ?? 0) >= 0.6
      )
      .slice(0, 2)
      .map((revision) => ({
        user_id: user.id,
        agent_id: agentId,
        thread_id,
        source_message_id: findRevisionSourceMessageId(assistantMessages, revision.what_was_said || ""),
        revision_type: validRevisionTypes.has(revision.revision_type || "") ? revision.revision_type! : "reconsideration",
        what_was_said: revision.what_was_said!.trim().slice(0, 1000),
        what_to_say_now: revision.what_to_say_now!.trim().slice(0, 1600),
        rationale: typeof revision.rationale === "string" ? revision.rationale.slice(0, 1000) : null,
        status: "pending",
      }));

    if (dialecticEnabled && revisions.length > 0) {
      await supabase.from("pending_revisions").insert(revisions);
    }

    await recordCronSuccess("observer-watch", Date.now() - __jobStart);
    return new Response(JSON.stringify({
      ok: true,
      inserted: insertions.length,
      revisions: dialecticEnabled ? revisions.length : 0,
      skipped_revisions: dialecticEnabled ? undefined : "dialectic_disabled",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await recordCronFailure("observer-watch", Date.now() - __jobStart, err);
    console.error("observer-watch error:", err);
    return new Response(JSON.stringify({ error: "Internal error", code: "internal_error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

function findRevisionSourceMessageId(
  messages: Array<{ id?: string; content?: string }>,
  whatWasSaid: string,
): string | null {
  const needle = whatWasSaid.toLowerCase().slice(0, 180);
  if (needle.length < 12) return null;
  const source = [...messages].reverse().find((message) =>
    (message.content || "").toLowerCase().includes(needle)
  );
  return source?.id || null;
}

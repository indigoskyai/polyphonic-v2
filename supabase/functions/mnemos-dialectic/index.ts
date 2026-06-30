// mnemos-dialectic — post-turn reflection that proposes and applies identity patches.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { isDialecticEnabled } from "../_shared/config.ts";
import { recordCronSuccess, recordCronFailure } from "../_shared/cronHealth.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { loadOrCreateLucaIdentity } from "../_shared/agents/luca-identity.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import {
  DIALECTIC_TURN_CADENCE,
} from "../_shared/mnemos/constants.ts";
import {
  applyMarkdownPatch,
  buildDialecticPrompt,
  classifyPatchStatus,
  parseDialecticResult,
  type DialecticPatch,
  type DialecticRevision,
} from "../_shared/mnemos/dialectic.ts";
import { dispatchProactiveEngagement } from "../_shared/proactive-engagement.ts";
import { resolveOpenRouterKeyForUser, resolveRoleModel } from "../_shared/model-backend.ts";
import { normalizeAgentId, resolveScopeAgentId } from "../_shared/agent-scope.ts";
import { claimContinuityJob, finishContinuityJob } from "../_shared/continuity/jobs.ts";

// Threshold above which an out-of-session revision deserves a proactive
// nudge (notable activity surface). Revisions below this still persist and
// surface in-session via the chat function's prompt injection — this only
// covers the "user isn't here, this thought wants to be remembered" case.
const URGENT_REVISION_CONFIDENCE = 0.8;
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
  const __jobStart = Date.now();
  let jobSupabase: any = null;
  let jobId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401, corsHeaders);

    if (!isDialecticEnabled(user.id)) {
      await recordCronSuccess("mnemos-dialectic", Date.now() - __jobStart);
      return json({ ok: true, skipped: "dialectic_disabled" }, 200, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
    const hasRequestedAgentId = typeof body.agent_id === "string" && body.agent_id.trim().length > 0;
    const requestedAgentId = normalizeAgentId(body.agent_id);
    const sourceMessageId = typeof body.source_message_id === "string" ? body.source_message_id : null;
    const force = body.force === true;

    if (!threadId) return json({ error: "Missing thread_id" }, 400, corsHeaders);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, user_id, agent_id, primary_agent_id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (threadError) {
      console.error("[mnemos-dialectic] thread lookup failed:", threadError);
      return json({ error: "Thread lookup failed" }, 400, corsHeaders);
    }
    if (!thread) return json({ error: "Thread not found" }, 404, corsHeaders);
    const agentId = resolveScopeAgentId(thread);
    if (hasRequestedAgentId && requestedAgentId !== agentId) {
      console.warn("[mnemos-dialectic] ignored mismatched requested agent", {
        requestedAgentId,
        threadAgentId: agentId,
        thread_id: threadId,
        user_id: user.id,
      });
    }

    const { apiKey } = await resolveOpenRouterKeyForUser(supabase, user.id);
    if (!apiKey) return json({ ok: true, skipped: "no_api_key" }, 200, corsHeaders);

    const { data: recentMessages } = await supabase
      .from("messages")
      .select("id, role, content, agent, created_at")
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(40);

    const history = (recentMessages || []).reverse();
    const assistantCount = history.filter((m: { role: string; agent?: string | null }) =>
      m.role === "assistant" && (m.agent || "luca") === agentId
    ).length;

    if (!force && assistantCount > 0 && assistantCount % DIALECTIC_TURN_CADENCE !== 0) {
      return json({ ok: true, skipped: "cadence", assistant_turns: assistantCount }, 200, corsHeaders);
    }

    if (history.length < 4) {
      return json({ ok: true, skipped: "cold_start" }, 200, corsHeaders);
    }

    const lastUserMessage = [...history].reverse().find((m: { role: string }) => m.role === "user");
    const sourceMessageIds = history
      .map((m: { id: string }) => m.id)
      .filter(Boolean);

    if (sourceMessageId) {
      const claim = await claimContinuityJob(supabase, {
        userId: user.id,
        agentId,
        threadId,
        sourceMessageId,
        jobName: "mnemos-dialectic",
      });
      if (!claim.claimed) {
        return json({ ok: true, skipped: claim.reason }, 200, corsHeaders);
      }
      jobSupabase = supabase;
      jobId = claim.id;
    }

    const [identityDocs, notesRes, emotionalRes, memories] = await Promise.all([
      loadOrCreateLucaIdentity(supabase, user.id, agentId),
      supabase.from("observer_notes")
        .select("kind, content, created_at")
        .eq("user_id", user.id)
        .eq("agent_id", agentId)
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(10),
      loadEmotionalState(supabase, user.id, agentId),
      loadRecentMemoryContext(supabase, user.id, agentId, lastUserMessage?.content || ""),
    ]);

    const transcript = history
      .map((m: { role: string; content: string; agent?: string | null }) => {
        const speaker = m.role === "user" ? "user" : (m.agent || "assistant");
        return `${speaker}: ${(m.content || "").slice(0, 1400)}`;
      })
      .join("\n\n");

    const observerNotes = (notesRes.data || [])
      .map((note: { kind: string; content: string }) => `- [${note.kind}] ${note.content}`)
      .join("\n");

    const prompt = buildDialecticPrompt({
      transcript,
      observerNotes,
      emotionalBlock: formatEmotionalPrompt(emotionalRes),
      memoryContext: memories,
      soulMd: identityDocs.soulMd,
      selfModel: identityDocs.selfModel,
      userModel: identityDocs.userModel,
      convictions: identityDocs.convictions,
    });

    // The dialectic writes the agent's identity (soul / self-model / user-model /
    // convictions), so it authors in the agent's own VOICE — its full primary
    // model (now agent-aware: a substrate agent uses its own model, not the
    // user default).
    const dialecticModel = await resolveRoleModel(supabase, user.id, agentId, "voice");

    const modelResponse = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Mnemos Dialectic",
      },
      body: JSON.stringify({
        model: dialecticModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60000),
    }));

    if (!modelResponse.ok) {
      const errText = await modelResponse.text().catch(() => "");
      console.error("mnemos-dialectic model error:", modelResponse.status, errText.slice(0, 300));
      await finishContinuityJob(supabase, jobId, "failed", `model_error_${modelResponse.status}`);
      return json({ ok: false, error: "model_error" }, 200, corsHeaders);
    }

    const data = await modelResponse.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const result = parseDialecticResult(raw);

    const patchCounts = await persistPatches(supabase, user.id, agentId, threadId, sourceMessageIds, result.patches);
    const revisionCount = await persistPendingRevisions(supabase, user.id, agentId, threadId, history, result.pending_revisions);

    const urgentSurfaced = await maybeSurfaceOfflineRevision(
      supabase,
      supabaseUrl,
      serviceKey,
      user.id,
      agentId,
      threadId,
      lastUserMessage?.created_at ?? null,
      result.pending_revisions,
    );

    await finishContinuityJob(supabase, jobId, "completed");
    await recordCronSuccess("mnemos-dialectic", Date.now() - __jobStart);
    return json({
      ok: true,
      model: dialecticModel,
      patches: patchCounts,
      pending_revisions: revisionCount,
      urgent_surface: urgentSurfaced,
    }, 200, corsHeaders);
  } catch (err) {
    if (jobSupabase && jobId) {
      await finishContinuityJob(jobSupabase, jobId, "failed", err);
    }
    await recordCronFailure("mnemos-dialectic", Date.now() - __jobStart, err);
    console.error("mnemos-dialectic error:", err);
    return json({ error: "Internal error", code: "internal_error" }, 500, getCorsHeaders(req));
  }
});

async function maybeSurfaceOfflineRevision(
  supabase: any,
  supabaseUrl: string,
  serviceRole: string,
  userId: string,
  agentId: string,
  threadId: string,
  lastUserMessageAt: string | null,
  revisions: DialecticRevision[],
): Promise<{ surfaced: boolean; reason?: string }> {
  const urgent = revisions.filter((r) => (r.confidence ?? 0) >= URGENT_REVISION_CONFIDENCE);
  if (urgent.length === 0) return { surfaced: false, reason: "no_urgent_revisions" };

  const offlineFor = lastUserMessageAt
    ? Date.now() - new Date(lastUserMessageAt).getTime()
    : Infinity;
  if (offlineFor < OFFLINE_THRESHOLD_MS) {
    return { surfaced: false, reason: "user_active_in_session" };
  }

  const top = urgent[0];
  const summary = `I've been thinking about something I said earlier. On reflection: ${top.what_to_say_now}`.slice(0, 240);
  const rationale = `${urgent.length} high-confidence revision${urgent.length === 1 ? "" : "s"} landed while you were offline (>=${URGENT_REVISION_CONFIDENCE} confidence).`;

  try {
    const result = await dispatchProactiveEngagement(supabase, supabaseUrl, serviceRole, {
      userId,
      agentId,
      source: "pending_revision_urgent",
      severity: "notable",
      title: "I've been reconsidering something",
      summary,
      rationale,
      activityType: "pending_revision_urgent",
      content: {
        thread_id: threadId,
        revisions_count: urgent.length,
        sample_revision_type: top.revision_type,
      },
    });
    return { surfaced: result.allowed, reason: result.reason };
  } catch (err) {
    console.warn("[mnemos-dialectic] urgent revision surface failed:", err);
    return { surfaced: false, reason: "dispatch_error" };
  }
}

async function loadRecentMemoryContext(supabase: any, userId: string, agentId: string, query: string): Promise<string> {
  if (!query.trim()) return "";
  try {
    const mnemos = new MnemosEngine(supabase, userId, agentId);
    const memories = await mnemos.retrieve(query, { limit: 5, spread_activation: true });
    return memories
      .map((m) => `- ${m.engram.content.slice(0, 220)}`)
      .join("\n");
  } catch (e) {
    console.warn("mnemos-dialectic memory retrieval failed:", e);
    return "";
  }
}

async function persistPatches(
  supabase: any,
  userId: string,
  agentId: string,
  threadId: string,
  sourceMessageIds: string[],
  patches: DialecticPatch[],
): Promise<Record<string, number>> {
  const counts = { applied: 0, queued: 0, rejected: 0 };

  for (const patch of patches.slice(0, 8)) {
    const status = classifyPatchStatus(patch);
    counts[status] += 1;

    const { data: patchRow, error: patchError } = await supabase
      .from("agent_identity_patches")
      .insert({
        user_id: userId,
        agent_id: agentId,
        doc_type: patch.doc_type,
        section: patch.section,
        operation: patch.operation,
        patch_content: patch.patch_content,
        rationale: patch.rationale || null,
        source_thread_id: threadId,
        source_message_ids: sourceMessageIds,
        confidence: Number(patch.confidence.toFixed(2)),
        category: patch.category || null,
        status,
        applied_at: status === "applied" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (patchError) {
      console.warn("mnemos-dialectic patch insert failed:", patchError);
      continue;
    }

    if (status !== "applied") continue;

    const { data: current, error: currentError } = await supabase
      .from("agent_identity")
      .select("content, version")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("doc_type", patch.doc_type)
      .maybeSingle();

    if (currentError || !current) {
      console.warn("mnemos-dialectic identity load failed:", currentError);
      continue;
    }

    const nextContent = applyMarkdownPatch(current.content || "", patch);
    const { error: updateError } = await supabase
      .from("agent_identity")
      .update({
        content: nextContent,
        version: (current.version || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("doc_type", patch.doc_type);

    if (updateError) {
      console.warn("mnemos-dialectic identity update failed:", updateError, "patch", patchRow?.id);
    }
  }

  return counts;
}

async function persistPendingRevisions(
  supabase: any,
  userId: string,
  agentId: string,
  threadId: string,
  history: Array<{ id: string; role: string; content: string }>,
  revisions: DialecticRevision[],
): Promise<number> {
  const valid = revisions
    .filter((revision) => (revision.confidence ?? 0) >= 0.6)
    .slice(0, 3);

  if (valid.length === 0) return 0;

  const rows = valid.map((revision) => ({
    user_id: userId,
    agent_id: agentId,
    thread_id: threadId,
    source_message_id: findSourceMessageId(history, revision.what_was_said),
    revision_type: revision.revision_type,
    what_was_said: revision.what_was_said,
    what_to_say_now: revision.what_to_say_now,
    rationale: revision.rationale || null,
    status: "pending",
  }));

  const { error } = await supabase.from("pending_revisions").insert(rows);
  if (error) {
    console.warn("mnemos-dialectic pending revision insert failed:", error);
    return 0;
  }

  return rows.length;
}

function findSourceMessageId(
  history: Array<{ id: string; role: string; content: string }>,
  whatWasSaid: string,
): string | null {
  const needle = whatWasSaid.toLowerCase().slice(0, 180);
  if (needle.length < 12) return null;
  const message = [...history].reverse().find((m) =>
    m.role === "assistant" && (m.content || "").toLowerCase().includes(needle)
  );
  return message?.id || null;
}

function json(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

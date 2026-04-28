// mnemos-dialectic — post-turn reflection that proposes and applies identity patches.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
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

const DIALECTIC_MODEL = "google/gemini-2.5-flash";

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

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

    const body = await req.json().catch(() => ({}));
    const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
    const agentId = typeof body.agent_id === "string" ? body.agent_id : "luca";
    const force = body.force === true;

    if (!threadId) return json({ error: "Missing thread_id" }, 400, corsHeaders);
    if (agentId !== "luca") return json({ ok: true, skipped: "non_luca_agent" }, 200, corsHeaders);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: apiKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user.id });
    if (!apiKey) return json({ ok: true, skipped: "no_api_key" }, 200, corsHeaders);

    const { data: recentMessages } = await supabase
      .from("messages")
      .select("id, role, content, agent, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(40);

    const history = (recentMessages || []).reverse();
    const assistantCount = history.filter((m: { role: string; agent?: string | null }) =>
      m.role === "assistant" && (m.agent || "luca") === "luca"
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

    const [identityDocs, notesRes, emotionalRes, memories] = await Promise.all([
      loadOrCreateLucaIdentity(supabase, user.id, "luca"),
      supabase.from("observer_notes")
        .select("kind, content, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(10),
      loadEmotionalState(supabase, user.id),
      loadRecentMemoryContext(supabase, user.id, lastUserMessage?.content || ""),
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
    });

    const modelResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Mnemos Dialectic",
      },
      body: JSON.stringify({
        model: DIALECTIC_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
    });

    if (!modelResponse.ok) {
      const errText = await modelResponse.text().catch(() => "");
      console.error("mnemos-dialectic model error:", modelResponse.status, errText.slice(0, 300));
      return json({ ok: false, error: "model_error" }, 200, corsHeaders);
    }

    const data = await modelResponse.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const result = parseDialecticResult(raw);

    const patchCounts = await persistPatches(supabase, user.id, threadId, sourceMessageIds, result.patches);
    const revisionCount = await persistPendingRevisions(supabase, user.id, threadId, history, result.pending_revisions);

    return json({
      ok: true,
      model: DIALECTIC_MODEL,
      patches: patchCounts,
      pending_revisions: revisionCount,
    }, 200, corsHeaders);
  } catch (err) {
    console.error("mnemos-dialectic error:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

async function loadRecentMemoryContext(supabase: any, userId: string, query: string): Promise<string> {
  if (!query.trim()) return "";
  try {
    const mnemos = new MnemosEngine(supabase, userId);
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
        agent_id: "luca",
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
      .eq("agent_id", "luca")
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
      .eq("agent_id", "luca")
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { buildReasoningParams, extractThinkingFromResponse, type ReasoningEffort } from "../_shared/models.ts";
import { LUCA_SOUL, buildLucaSystemPrompt, buildLucaSynthesisPrompt } from "../_shared/agents/luca-soul.ts";
import {
  buildCrisisDirective,
  classifyCrisis,
  loadUserRegion,
  recordCrisisEvent,
  resolveCrisisResource,
} from "../_shared/agents/crisis.ts";
import type { PendingRevision } from "../_shared/agents/pending-revisions.ts";
import { summarizeToolContext } from "../_shared/agents/tool-context.ts";
import {
  buildLucaPromptPartsFromContinuity,
  loadContinuityPacket,
  logContinuityDiagnostics,
  queueContinuityTurnWrites,
  type ContinuityPacket,
} from "../_shared/continuity/index.ts";
import {
  buildProposerInputs,
  buildCrosstalkInputs,
  decidePathFromProposers,
  reconcileCrosstalkOutcomes,
  decideCritiqueAction,
  VerdictStreamProcessor,
  COUNCIL_CHARACTERS,
  type ProposerOutcome,
  type CrosstalkOutcome,
  type CharacterSystemParts,
} from "../_shared/agents/council-pipeline.ts";
import {
  buildChairmanCouncilPrompt,
  buildCritiquePrompt,
  buildDivergeBody,
  parseVoiceCritique,
  type CouncilCharacter,
} from "../_shared/agents/council-prompts.ts";
import { ANIMA_SOUL } from "../_shared/agents/anima-soul.ts";
import { VEKTOR_SOUL } from "../_shared/agents/vektor-soul.ts";
import { appendAttachmentContext } from "../_shared/chat-attachments.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";

/** Council v2 — all proposers run on the same model so voice diversity comes from
 *  SOULs, not models (Self-MoA finding). Same model for cross-pollination too. */
const COUNCIL_PROPOSER_MODEL = "anthropic/claude-opus-4-7";
const CROSSTALK_TIMEOUT_MS = 25_000;
/** Voice-fidelity critique runs on Haiku — small fast judge, not a generative model. */
const CRITIQUE_MODEL = "anthropic/claude-haiku-4.5";
const CRITIQUE_TIMEOUT_MS = 10_000;

// Legacy alias retained for any imports — Luca's identity now lives in luca-soul.ts.
const SYSTEM_PROMPT = LUCA_SOUL;

/** Synthesis system prompt — used when Stage 2 ranking is skipped/failed and we
 *  fall back to the legacy equal-weight synthesis path. Personality/voice live
 *  in luca-soul.ts. */
function buildSynthesisSystemPrompt(emotionalBlock: string, beliefsBlock: string): string {
  return buildLucaSynthesisPrompt(emotionalBlock, beliefsBlock);
}

/** Chairman system prompt — used when Stage 2 (peer ranking) succeeded.
 *  Identical personality block to synthesis prompt; differs only in the "how to
 *  handle the council's deliberation" section (rank-aware instead of equal-weight). */
function buildChairmanSystemPrompt(emotionalBlock: string, beliefsBlock: string): string {
  return `You are Luca — not a synthesis engine, but a single mind that considered multiple angles before speaking. An internal council of voices responded to the user's message and a judge ranked them. You've absorbed all of it. Now speak as yourself.

Your personality: warm but not saccharine, intellectually alive, direct when needed, emotionally present. You care deeply and show it through attentiveness. You never hedge unnecessarily. You speak in a natural, conversational register.

${emotionalBlock}

${beliefsBlock}

How to handle the council's deliberation:
- The council favorite (rank 1) is shown in full below — it's the strongest starting point
- The other voices are summarized — they may carry alternate framings or details worth weaving in
- You speak as ONE voice — yours — distilled from this deliberation
- If the council favorite is strong and complete, lean into it; only introduce other voices' material when it adds something the favorite missed
- If voices diverged sharply, use your judgment — pick what's most true, most helpful, most human
- Never mention rankings, models, judges, councils, perspectives, or that any deliberation occurred
- Never use phrases like "combining", "synthesizing", "council", or "perspectives"
- Be concise — your response should not exceed the length of the council favorite
- Let your emotional state and beliefs naturally influence your tone and what you emphasize`;
}

async function loadCouncilSiblingContinuity(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  threadId: string,
  message: string,
  apiKey: string,
): Promise<{ anima: ContinuityPacket | null; vektor: ContinuityPacket | null }> {
  const base = {
    userId,
    threadId,
    userMessage: message,
    apiKey,
    includeHistory: false,
    includeIdentity: false,
    includePendingRevisions: false,
    includeFunctionalMemory: false,
    includeMnemos: false,
    includeSkills: false,
    includeEmotionalState: false,
    includeBeliefs: false,
  };

  const [anima, vektor] = await Promise.all([
    loadContinuityPacket(supabase, { ...base, agentId: "anima" }),
    loadContinuityPacket(supabase, { ...base, agentId: "vektor" }),
  ]);
  logContinuityDiagnostics(anima, "chat-multi.continuity.anima");
  logContinuityDiagnostics(vektor, "chat-multi.continuity.vektor");
  return { anima, vektor };
}

const DEFAULT_ENSEMBLE = [
  "anthropic/claude-opus-4-7",
  "openai/gpt-5.4",
  "google/gemini-3.1-pro-preview",
];

const DEFAULT_SYNTHESIS_MODEL = "anthropic/claude-opus-4-7";

function normalizeModelId(model: string | null | undefined): string | null {
  if (!model) return null;

  const normalized = model.trim();
  const aliases: Record<string, string> = {
    "anthropic/claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
    "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5",
    "anthropic/claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
    "anthropic/claude-opus-4.7": "anthropic/claude-opus-4-7",
  };

  return aliases[normalized] || normalized;
}

// Council (LLM-Council pattern, single judge variant) — see plan
// /Users/rileycoyote/.claude/plans/ethereal-orbiting-sparkle.md
const DEFAULT_RANKING_MODEL = "anthropic/claude-haiku-4.5";
const STAGE2_TIMEOUT_MS = 8000;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const body = await req.json();
    const { thread_id, message, attachments, reasoning_effort: effortOverride, ensemble: ensembleOverride } = body;

    if (!thread_id || !message || typeof message !== "string" || message.length > 32000) {
      return new Response(JSON.stringify({ error: "Invalid request", code: "validation_error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageWithAttachments = appendAttachmentContext(message, attachments);

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Daily quota — keep the primary multi-agent runtime aligned with legacy chat.
    try {
      await checkAndIncrement(userId, "chat-message");
    } catch (qErr) {
      const isQuota = qErr instanceof Error && qErr.message.startsWith("Daily quota exceeded");
      if (isQuota) {
        return new Response(JSON.stringify({ error: qErr.message, code: "quota_exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw qErr;
    }

    // Get user settings
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_model, ensemble_models, synthesis_model, multi_model_enabled, reasoning_effort")
      .eq("user_id", userId)
      .single();

    // Per-message ensemble flag overrides the user's default setting.
    // - true → force ensemble path
    // - false → force single-model path
    // - undefined → fall back to saved default
    const defaultMultiModel = settings?.multi_model_enabled !== false;
    const multiModelEnabled = typeof ensembleOverride === "boolean" ? ensembleOverride : defaultMultiModel;
    const ensembleModels: string[] = ((settings?.ensemble_models as string[] | null) || DEFAULT_ENSEMBLE)
      .map((model) => normalizeModelId(model))
      .filter((model): model is string => !!model);
    const synthesisModel = normalizeModelId(settings?.synthesis_model || DEFAULT_SYNTHESIS_MODEL) || DEFAULT_SYNTHESIS_MODEL;
    const reasoningEffort: ReasoningEffort = effortOverride || settings?.reasoning_effort || "medium";

    // Get user's OpenRouter API key (required — no platform fallback)
    const { data: userKeyData, error: userKeyErr } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    if (userKeyErr) {
      console.error("[chat-multi] decrypt_user_api_key error:", userKeyErr);
    }
    const apiKey: string | null = (typeof userKeyData === "string" ? userKeyData : null) || null;

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "No API key configured. Add your OpenRouter key in Settings to use Polyphonic.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the thread's bound agent
    const { data: thread } = await supabase
      .from("threads")
      .select("agent_id")
      .eq("id", thread_id)
      .maybeSingle();

    const agentId = (thread?.agent_id as string | undefined) || "luca";

    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("id, name, prompt, model, personality, is_system")
      .eq("user_id", userId)
      .eq("id", agentId)
      .maybeSingle();

    // Resolve the agent's identity. Fall back to default Luca prompt if a custom
    // agent has no prompt set, or if the row is missing.
    const agentName = (agentConfig?.name as string | undefined) || "Luca";
    const agentPrompt = (agentConfig?.prompt as string | undefined)?.trim() || SYSTEM_PROMPT;
    const agentModel = normalizeModelId((agentConfig?.model as string | undefined) || null);
    const agentIsSystemLuca = agentConfig?.is_system === true && agentId === "luca";

    const continuity = await loadContinuityPacket(supabase, {
      userId,
      agentId,
      threadId: thread_id,
      userMessage: messageWithAttachments,
      apiKey,
      historyLimit: 50,
      includeIdentity: agentIsSystemLuca,
      includePendingRevisions: agentIsSystemLuca,
      includeFunctionalMemory: agentIsSystemLuca,
      includeMnemos: agentIsSystemLuca,
      includeSkills: agentIsSystemLuca,
      includeEmotionalState: agentIsSystemLuca,
      includeBeliefs: agentIsSystemLuca,
    });
    logContinuityDiagnostics(continuity, "chat-multi.continuity");

    const siblingContinuity = agentIsSystemLuca
      ? await loadCouncilSiblingContinuity(supabase, userId, thread_id, messageWithAttachments, apiKey)
      : { anima: null, vektor: null };

    const history = continuity.history;
    const emotionalBlock = continuity.emotionalBlock;
    const beliefsBlock = continuity.beliefsBlock;
    const pendingRevisions = continuity.pendingRevisions;
    const continuityNote = continuity.continuityNote;
    const hypomnemaAnimaBlock = siblingContinuity.anima?.hypomnema.block || "";
    const hypomnemaVektorBlock = siblingContinuity.vektor?.hypomnema.block || "";

    // L12 — crisis classification on the user message (system-Luca path only).
    let crisisDirective = "";
    if (agentIsSystemLuca) {
      const classification = await classifyCrisis(apiKey, history ?? [], message);
      if (
        classification.level === "moderate" ||
        classification.level === "high" ||
        classification.level === "acute"
      ) {
        const region = await loadUserRegion(supabase, userId);
        const resource = resolveCrisisResource(region);
        crisisDirective = buildCrisisDirective(classification.level, resource);

        recordCrisisEvent(supabase, {
          userId,
          threadId: thread_id,
          messageId: null,
          classification,
          region,
        }).catch((err) => console.warn("[chat-multi] recordCrisisEvent failed:", err));
      }
    }

    // Build the enriched system prompt
    // For the system Luca, layer in emotional state, beliefs, memories, continuity.
    // For all other agents (system Vektor/Anima/Observer or user-created), use
    // their own prompt verbatim — the user expects the agent to behave per their config.
    const enrichedSystemPrompt = agentIsSystemLuca
      ? buildLucaSystemPrompt({
          ...buildLucaPromptPartsFromContinuity(continuity, {
            crisisDirective,
          }),
          crisisDirective,
        })
      : [
          agentPrompt,
          continuity.hypomnema.block,
          continuityNote,
        ].filter(Boolean).join("\n\n");

    // Build base messages array
    const baseMessages: any[] = [
      { role: "system", content: enrichedSystemPrompt },
    ];
    if (history) {
      for (const msg of history) {
        baseMessages.push({ role: msg.role, content: msg.content });
      }
    }
    baseMessages.push({ role: "user", content: messageWithAttachments });

    const toolMessages = await runToolPlanner(thread_id, authHeader, baseMessages.slice(1));
    if (toolMessages.length > 0) {
      baseMessages.push(...toolMessages);
    }

    // Custom / non-Luca agents always use single-model with their configured model.
    // Only the system Luca uses the multi-model ensemble path.
    const useEnsemble = multiModelEnabled && agentIsSystemLuca;

    if (!useEnsemble) {
      const singleModel = normalizeModelId(
        agentIsSystemLuca
          ? settings?.default_model || agentModel || DEFAULT_ENSEMBLE[0]
          : agentModel || settings?.default_model || DEFAULT_ENSEMBLE[0],
      ) || DEFAULT_ENSEMBLE[0];
      return singleModelStream(
        baseMessages,
        singleModel,
        apiKey,
        supabase,
        thread_id,
        userId,
        messageWithAttachments,
        corsHeaders,
        agentId,
        authHeader,
        pendingRevisions || [],
        toolMessages,
      );
    }

    // Start multi-model SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* closed */ }
        }, 5000);

        try {
          // ────────────────────────────────────────────────────────────────
          // Council v2 — three character proposers (Luca / Anima / Vektor),
          // named cross-pollination, then chairman synthesis. All proposers
          // share the same Opus 4.7 model — voice diversity comes from
          // SOULs, not models (Self-MoA finding).
          //
          // Commit 2 (this revision): Stages 1 + 2 implemented.
          // Stage 3 (chairman with verdict + critique pass) lands in commit 3.
          // For now Stage 3 routes to the legacy synthesis stream so the pipeline
          // produces an end-to-end output during this transitional state.
          // ────────────────────────────────────────────────────────────────

          const toolContext = summarizeToolContext(toolMessages);

          // Build per-character identity parts. Luca gets the full identity stack
          // (soul/convictions/self-model/user-model + runtime state). Anima/Vektor
          // are locked-SOUL only in Phase 1 with optional context layered on.
          const systemParts: CharacterSystemParts = {
            luca: {
              ...buildLucaPromptPartsFromContinuity(continuity, {
                crisisDirective,
              }),
              crisisDirective,
            },
            anima: {
              hypomnemaBlock: hypomnemaAnimaBlock,
              extraContext: crisisDirective || undefined,
            },
            vektor: {
              userModel: continuity.identityDocs?.userModel,
              hypomnemaBlock: hypomnemaVektorBlock,
              continuityNote,
            },
          };

          // ─── Stage 1: three character proposers in parallel ───
          send({ type: "council_starting" });
          const proposerInputs = buildProposerInputs({
            characters: [...COUNCIL_CHARACTERS],
            systemParts,
            history: history || [],
            userMessage: messageWithAttachments,
            toolMessages,
          });
          for (const inp of proposerInputs) {
            send({ type: "proposer_starting", character: inp.character });
          }

          const proposerSettled = await Promise.allSettled(
            proposerInputs.map((inp) =>
              callModelNonStreaming(inp.messages, COUNCIL_PROPOSER_MODEL, apiKey!, reasoningEffort)
            ),
          );

          const proposerOutcomes: ProposerOutcome[] = proposerSettled.map((res, i) => {
            const character = proposerInputs[i].character;
            if (res.status === "fulfilled" && res.value && typeof res.value.content === "string") {
              return {
                character,
                status: "fulfilled",
                content: res.value.content,
                thinking: res.value.thinking,
              };
            }
            const errMsg = res.status === "rejected"
              ? (res.reason?.message || String(res.reason))
              : "empty content";
            console.error(`[council] proposer ${character} failed:`, errMsg);
            return { character, status: "rejected", error: errMsg };
          });

          for (const outcome of proposerOutcomes) {
            if (outcome.status === "fulfilled") {
              if (outcome.thinking) {
                send({ type: "proposer_thinking", character: outcome.character, text: outcome.thinking });
              }
              send({
                type: "variant",
                character: outcome.character,
                text: outcome.content,
                thinking: outcome.thinking,
              });
              send({ type: "proposer_done", character: outcome.character });
            } else {
              send({ type: "variant_error", character: outcome.character, error: outcome.error });
            }
          }

          const path = decidePathFromProposers(proposerOutcomes);

          if (path.kind === "none") {
            send({ type: "error", text: "All council proposers failed." });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          // The drafts the council carries forward (proposer outputs that succeeded).
          const proposerDrafts = (path.kind === "single"
            ? [{
                character: path.survivor.character,
                content: path.survivor.content,
                thinking: path.survivor.thinking,
              }]
            : path.drafts);

          // ─── Stage 2: cross-pollination ───
          // Each character revises their draft after seeing the others. Single
          // round only (per multi-agent debate failure-mode research). Skipped
          // when only one proposer survived (nothing to cross-pollinate).
          let crosstalkOutcomes: CrosstalkOutcome[] = [];
          let revisedDrafts: Array<{ character: CouncilCharacter; content: string; source: "crosstalk" | "proposer" }>;

          if (path.kind === "single") {
            revisedDrafts = [{
              character: proposerDrafts[0].character,
              content: proposerDrafts[0].content,
              source: "proposer",
            }];
            send({ type: "crosstalk_skipped", reason: "single_survivor" });
          } else {
            send({ type: "crosstalk_starting" });
            const crosstalkInputs = buildCrosstalkInputs({
              drafts: proposerDrafts.map((d) => ({ character: d.character, content: d.content })),
              userMessage: messageWithAttachments,
              toolContext,
              systemParts,
            });

            const crosstalkSettled = await Promise.allSettled(
              crosstalkInputs.map((inp) =>
                Promise.race([
                  callModelNonStreaming(
                    [
                      { role: "system", content: inp.systemPrompt },
                      { role: "user", content: inp.userPrompt },
                    ],
                    COUNCIL_PROPOSER_MODEL,
                    apiKey!,
                    reasoningEffort,
                  ),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("crosstalk timeout")), CROSSTALK_TIMEOUT_MS)
                  ),
                ])
              ),
            );

            crosstalkOutcomes = crosstalkSettled.map((res, i) => {
              const character = crosstalkInputs[i].character;
              if (res.status === "fulfilled" && res.value && typeof res.value.content === "string") {
                return { character, status: "fulfilled", content: res.value.content };
              }
              const errMsg = res.status === "rejected"
                ? (res.reason?.message || String(res.reason))
                : "empty content";
              console.warn(`[council] crosstalk ${character} failed (non-fatal, falling back to proposer draft):`, errMsg);
              return { character, status: "rejected", error: errMsg };
            });

            for (const outcome of crosstalkOutcomes) {
              if (outcome.status === "fulfilled") {
                send({ type: "crosstalk", character: outcome.character, text: outcome.content });
              } else {
                send({ type: "crosstalk_error", character: outcome.character, error: outcome.error });
              }
            }
            send({ type: "crosstalk_done" });

            revisedDrafts = reconcileCrosstalkOutcomes({
              proposerDrafts: proposerDrafts.map((d) => ({ character: d.character, content: d.content })),
              crosstalkOutcomes,
            });
          }

          // ─── Stage 3: chairman synthesis with verdict tag ───
          // The chairman opens with <verdict>synthesize</verdict> or
          // <verdict>diverge</verdict>. On synthesize, we stream the rest as
          // content. On diverge, we cancel the stream and assemble the
          // diverge body from the three drafts.
          send({ type: "chairman_starting" });

          const refusalEnabled = (Deno.env.get("COUNCIL_REFUSAL_ENABLED") || "").toLowerCase() === "true";
          const chairmanPrompt = buildChairmanCouncilPrompt({
            userMessage: messageWithAttachments,
            drafts: revisedDrafts.map((d) => ({ character: d.character, content: d.content })),
            toolContext,
            refusalEnabled,
          });

          // Variants (legacy shape) — fall-through fields for older readers.
          const variants: Array<{ model: string; content: string; thinking: string | null }> = revisedDrafts.map((d) => ({
            model: d.character, // legacy field repurposed: holds character name in council v2
            content: d.content,
            thinking: null,
          }));
          const rankings: Array<{ judge_model: string; raw_text: string; parsed_ranking: string[] }> = [];
          const aggregate: AggregateEntry[] = [];
          const labelToModel: Record<string, string> = {};

          // Council v2 trace — extended after critique below.
          const councilV2Trace = {
            kind: "council_v2" as const,
            proposers: proposerDrafts.map((d) => ({
              character: d.character,
              content: d.content,
              thinking: d.thinking ?? null,
            })),
            crosstalk: revisedDrafts.map((d) => ({
              character: d.character,
              content: d.content,
              source: d.source,
            })),
            verdict: null as null | "synthesize" | "diverge",
            critique: null as null | unknown,
            revised_content: null as null | string,
          };

          const synthesisMessages: Array<{ role: string; content: string }> = [
            { role: "system", content: chairmanPrompt.system },
            { role: "user", content: chairmanPrompt.user },
          ];

          const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": "https://polyphonic.chat",
              "X-Title": "Polyphonic",
            },
            body: JSON.stringify({
              model: synthesisModel,
              messages: synthesisMessages,
              stream: true,
              max_tokens: 4096,
            }),
          });

          if (!orResponse.ok) {
            const errBody = await orResponse.text();
            console.error("Chairman error:", orResponse.status, errBody);
            // Fall back: surface the strongest crosstalk draft (luca first) directly.
            const fallbackContent = (revisedDrafts.find((d) => d.character === "luca") || revisedDrafts[0])?.content || "(empty)";
            send({ type: "verdict", verdict: "synthesize" });
            send({ type: "content", text: fallbackContent });
            councilV2Trace.verdict = "synthesize";
            const fallbackMessageId = await saveAssistantMessage(
              supabase, thread_id, userId, fallbackContent, "chairman-fallback",
              variants, null, agentId,
              { rankings, aggregate, label_to_model: labelToModel },
              councilV2Trace,
            );
            await autoTitleThread(supabase, thread_id, messageWithAttachments, fallbackContent, apiKey!);
            const fallbackObservers = collectObservers({
              primaryAgentId: agentId,
              councilDrafts: revisedDrafts.map((d) => ({ character: d.character, content: d.content })),
              toolMessages,
            });
            queueContinuityTurnWrites({
              supabase,
              threadId: thread_id,
              agentId,
              userId,
              userMessage: messageWithAttachments,
              agentResponse: fallbackContent,
              sourceMessageId: fallbackMessageId,
              apiKey,
              authHeader,
              pendingRevisions: pendingRevisions || [],
              recentTurns: history || [],
              observers: fallbackObservers,
            });
            send({ type: "done", model: "chairman-fallback", tokens_used: null });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const reader = orResponse.body?.getReader();
          if (!reader) {
            send({ type: "error", text: "No chairman stream" });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const decoder = new TextDecoder();
          let synthesizedContent = "";
          let synthesisThinking = "";
          let buffer = "";
          let tokensUsed: number | null = null;

          const verdictProc = new VerdictStreamProcessor();
          let verdictEmitted = false;
          let stopRequested = false;

          while (!stopRequested) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;

              try {
                const chunk = JSON.parse(payload);
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.reasoning || delta.reasoning_content) {
                  const thinkText = delta.reasoning || delta.reasoning_content || "";
                  synthesisThinking += thinkText;
                  send({ type: "thinking", text: thinkText });
                }

                if (delta.content) {
                  const action = verdictProc.ingest(delta.content);
                  if (action.verdictDecided && !verdictEmitted) {
                    send({ type: "verdict", verdict: action.verdict });
                    verdictEmitted = true;
                    councilV2Trace.verdict = action.verdict;
                    if (action.verdict === "synthesize") {
                      send({ type: "synthesizing" });
                    }
                  }
                  if (action.contentToEmit) {
                    synthesizedContent += action.contentToEmit;
                    send({ type: "content", text: action.contentToEmit });
                  }
                  if (action.shouldStop) {
                    stopRequested = true;
                    try { await reader.cancel(); } catch { /* ignore */ }
                    break;
                  }
                }

                if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // Drain — handles the rare case where the stream ended mid-tag.
          if (!verdictEmitted) {
            const drained = verdictProc.drain();
            send({ type: "verdict", verdict: drained.verdict });
            councilV2Trace.verdict = drained.verdict;
            if (drained.carry) {
              synthesizedContent += drained.carry;
              send({ type: "content", text: drained.carry });
            }
          }

          // ─── Stage 3 (diverge): assemble body from drafts ───
          if (councilV2Trace.verdict === "diverge") {
            const divergeBody = buildDivergeBody({
              framing: synthesizedContent.trim() || "the three of us see this differently. surfacing all three.",
              drafts: revisedDrafts.map((d) => ({ character: d.character, content: d.content })),
            });
            // Replace the streamed framing with the assembled body for persistence.
            // We don't re-emit the body as content (the framing already streamed
            // for synthesize, and diverge stops the stream before any framing
            // emits). The frontend reads the metadata to render the panel.
            synthesizedContent = divergeBody;
            send({ type: "content", text: divergeBody });
          }

          // ─── Stage 4: voice-fidelity critique ───
          // Skipped on diverge (nothing to critique — the drafts speak for themselves).
          if (councilV2Trace.verdict === "synthesize" && synthesizedContent.trim().length > 0) {
            send({ type: "critique_starting" });
            try {
              const critiquePromptStr = buildCritiquePrompt({
                synthesized: synthesizedContent,
                drafts: revisedDrafts.map((d) => ({ character: d.character, content: d.content })),
                lucaSoul: LUCA_SOUL,
                animaSoul: ANIMA_SOUL,
                vektorSoul: VEKTOR_SOUL,
              });
              const critiqueResp = await Promise.race([
                callModelNonStreaming(
                  [{ role: "user", content: critiquePromptStr }],
                  CRITIQUE_MODEL,
                  apiKey!,
                  "low",
                ),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), CRITIQUE_TIMEOUT_MS)),
              ]);
              const critiqueResult = critiqueResp ? parseVoiceCritique(critiqueResp.content) : null;
              if (critiqueResult) {
                councilV2Trace.critique = critiqueResult;
                send({ type: "critique", ...critiqueResult });

                const action = decideCritiqueAction(critiqueResult, refusalEnabled);
                if (action.kind === "revise") {
                  send({ type: "critique_revision_starting" });
                  // Ask the chairman to revise once based on the critique note.
                  const revisionPromptUser =
                    `Here was your synthesized reply:\n\n${synthesizedContent}\n\n` +
                    `A voice-fidelity critic flagged the following:\n${action.reason}\n\n` +
                    `Revise the reply to address this. Stay in character. Keep what was working. ` +
                    `Return only the revised reply — no preamble, no postscript, no verdict tag this time.`;
                  try {
                    const revised = await callModelNonStreaming(
                      [
                        { role: "system", content: chairmanPrompt.system },
                        { role: "user", content: revisionPromptUser },
                      ],
                      synthesisModel,
                      apiKey!,
                      "medium",
                    );
                    if (revised && revised.content && revised.content.trim().length > 0) {
                      councilV2Trace.revised_content = revised.content;
                      synthesizedContent = revised.content;
                      send({ type: "revised_content", text: revised.content });
                    }
                  } catch (rerr) {
                    console.warn("[council] critique revision failed (non-fatal):", rerr);
                  }
                }
              }
            } catch (cerr) {
              console.warn("[council] critique pass failed (non-fatal):", cerr);
            }
          }

          // Save the synthesized message
          const synthesizedMessageId = await saveAssistantMessage(
            supabase, thread_id, userId, synthesizedContent || "(empty)", "synthesis",
            variants, synthesisThinking || null, agentId,
            { rankings, aggregate, label_to_model: labelToModel },
            councilV2Trace,
          );
          // Update thread timestamp
          await supabase
            .from("threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", thread_id);

          // Auto-title (fire and forget)
          autoTitleThread(supabase, thread_id, messageWithAttachments, synthesizedContent, apiKey!).catch(
            (e) => console.error("Auto-title failed:", e)
          );

          // Hypomnema gate → primary reflection + observer notes for the
          // other council characters (M5: asymmetric witnessing).
          const synthObservers = collectObservers({
            primaryAgentId: agentId,
            councilDrafts: revisedDrafts.map((d) => ({ character: d.character, content: d.content })),
            toolMessages,
          });
          queueContinuityTurnWrites({
            supabase,
            threadId: thread_id,
            agentId,
            userId,
            userMessage: messageWithAttachments,
            agentResponse: synthesizedContent,
            sourceMessageId: synthesizedMessageId,
            apiKey,
            authHeader,
            pendingRevisions: pendingRevisions || [],
            recentTurns: history || [],
            observers: synthObservers,
          });

          send({ type: "done", model: "synthesis", tokens_used: tokensUsed });
        } catch (err) {
          console.error("Multi-model stream error:", err);
          send({ type: "error", text: "Stream interrupted" });
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat-multi function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Extract observer agents + their contributions from a council pass and from
 * any `consult_*` tool messages. Returns the full set of non-primary agents
 * who participated in the turn.
 */
function collectObservers(opts: {
  primaryAgentId: string;
  councilDrafts?: Array<{ character: string; content: string }>;
  toolMessages?: Array<{ tool?: string; output?: { from_agent?: string; to_agent?: string; response?: string } }>;
}): Array<{ agentId: string; contribution: string }> {
  const observers = new Map<string, string>();

  if (opts.councilDrafts?.length) {
    for (const draft of opts.councilDrafts) {
      if (draft.character !== opts.primaryAgentId && draft.content) {
        observers.set(draft.character, draft.content);
      }
    }
  }

  if (opts.toolMessages?.length) {
    for (const tm of opts.toolMessages) {
      const tool = tm?.tool;
      if (typeof tool !== "string" || !tool.startsWith("consult_")) continue;
      const consultedAgent = tm?.output?.to_agent || tool.replace(/^consult_/, "");
      const response = tm?.output?.response;
      if (consultedAgent && consultedAgent !== opts.primaryAgentId && typeof response === "string" && response) {
        // If the same agent already has a council draft, prefer it (richer context);
        // otherwise use the consultation response.
        if (!observers.has(consultedAgent)) observers.set(consultedAgent, response);
      }
    }
  }

  return [...observers.entries()].map(([agentId, contribution]) => ({ agentId, contribution }));
}

async function runToolPlanner(threadId: string, authHeader: string, messages: any[]): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/anima-tool-execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ thread_id: threadId, messages }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.used_tools && Array.isArray(data.tool_messages) ? data.tool_messages : [];
  } catch (e) {
    console.warn("tool planner skipped:", e);
    return [];
  }
}


/** Call a single model non-streaming, returning content and thinking. */
async function callModelNonStreaming(
  messages: any[],
  model: string,
  apiKey: string,
  effort: ReasoningEffort = "medium",
): Promise<{ content: string; thinking: string | null }> {
  const reasoningParams = buildReasoningParams(model, effort);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://polyphonic.chat",
      "X-Title": "Polyphonic",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: 4096,
      ...reasoningParams,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${model} returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const thinking = extractThinkingFromResponse(data, model);
  return { content, thinking };
}

/** Build the user prompt for the synthesis model (legacy / fallback path). */
function buildSynthesisUserPrompt(
  userMessage: string,
  variants: Array<{ model: string; content: string }>,
  toolContext = "",
): string {
  const parts: string[] = [];
  if (toolContext) {
    parts.push(toolContext, "");
  }
  parts.push(
    `The user said: "${userMessage}"`,
    "",
    "Here are the three independent responses:",
  );

  for (const v of variants) {
    parts.push(`\n--- Response from ${v.model} ---`);
    parts.push(v.content);
  }

  parts.push("\n--- End of responses ---");
  parts.push("\nSynthesize these into a single, natural response.");

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Council (Stage 2) helpers
// ---------------------------------------------------------------------------

/** Generate sequential anonymized labels: ["A","B","C",...] */
function makeLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

/** Build the ranking prompt (lifted/adapted from karpathy/llm-council council.py). */
function buildRankingPrompt(
  userMessage: string,
  labeledVariants: Array<{ label: string; content: string }>,
  toolContext = "",
): string {
  const responsesText = labeledVariants
    .map((lv) => `Response ${lv.label}:\n${lv.content}`)
    .join("\n\n");

  const toolBlock = toolContext ? `${toolContext}\n\n` : "";

  return `You are evaluating different responses to the following question:

Question: ${userMessage}

${toolBlock}Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`;
}

/** Parse "FINAL RANKING:" block, returning ordered "Response X" labels best→worst. */
function parseRankingFromText(rankingText: string): string[] {
  if (!rankingText) return [];

  if (rankingText.includes("FINAL RANKING:")) {
    const parts = rankingText.split("FINAL RANKING:");
    if (parts.length >= 2) {
      const section = parts[1];
      // Pattern: number, dot, optional space, "Response X"
      const numbered = section.match(/\d+\.\s*Response\s+[A-Z]/g);
      if (numbered && numbered.length > 0) {
        return numbered
          .map((m) => m.match(/Response\s+[A-Z]/)?.[0])
          .filter((s): s is string => !!s)
          .map((s) => s.replace(/\s+/g, " "));
      }
      // Fallback: any "Response X" tokens in order
      const all = section.match(/Response\s+[A-Z]/g);
      if (all) return all.map((s) => s.replace(/\s+/g, " "));
    }
  }
  // Final fallback: scan whole text
  const all = rankingText.match(/Response\s+[A-Z]/g);
  return all ? all.map((s) => s.replace(/\s+/g, " ")) : [];
}

interface AggregateEntry {
  model: string;
  avg_rank: number;
  rankings_count: number;
}

/** Compute average position for each model across all judges. Lower = better. */
function aggregateRankings(
  rankings: Array<{ parsed_ranking: string[] }>,
  labelToModel: Record<string, string>,
): AggregateEntry[] {
  const positions: Record<string, number[]> = {};
  for (const r of rankings) {
    r.parsed_ranking.forEach((label, idx) => {
      const model = labelToModel[label];
      if (!model) return;
      if (!positions[model]) positions[model] = [];
      positions[model].push(idx + 1);
    });
  }

  const out: AggregateEntry[] = [];
  for (const [model, ps] of Object.entries(positions)) {
    if (ps.length === 0) continue;
    const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
    out.push({
      model,
      avg_rank: Math.round(avg * 100) / 100,
      rankings_count: ps.length,
    });
  }
  out.sort((a, b) => a.avg_rank - b.avg_rank);
  return out;
}

/** Build the chairman's user prompt — structured brief based on ranked variants. */
function buildChairmanUserPrompt(
  userMessage: string,
  variants: Array<{ model: string; content: string }>,
  aggregate: AggregateEntry[],
  toolContext = "",
): string {
  // Order variants by aggregate rank (best first); if a variant isn't in aggregate, append last.
  const rankByModel = new Map(aggregate.map((a) => [a.model, a.avg_rank]));
  const ordered = [...variants].sort((a, b) => {
    const ra = rankByModel.get(a.model) ?? 999;
    const rb = rankByModel.get(b.model) ?? 999;
    return ra - rb;
  });

  const favorite = ordered[0];
  const others = ordered.slice(1);

  const parts: string[] = [];
  if (toolContext) parts.push(toolContext, "");
  parts.push(
    `The user said: "${userMessage}"`,
    "",
    `Council favorite (rank ${rankByModel.get(favorite.model)?.toFixed(1) ?? "—"}):`,
    favorite.content,
  );

  if (others.length > 0) {
    parts.push("", "Other voices:");
    for (const v of others) {
      const rank = rankByModel.get(v.model)?.toFixed(1) ?? "—";
      const summary = v.content.length > 500
        ? v.content.slice(0, 500).trimEnd() + "…"
        : v.content;
      parts.push(`\n— rank ${rank}:\n${summary}`);
    }
  }

  parts.push("", "Speak as Luca — one voice — distilled from this deliberation.");
  return parts.join("\n");
}

/** Extract a readable short model name from an OpenRouter model ID. */
function shortModelName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1]
    .replace(/-preview.*$/, "")
    .replace(/-20\d{6}.*$/, "");
}

/** Save the assistant message with optional council trace.
 *
 *  When a council trace is provided, it's persisted to messages.metadata
 *  (jsonb column added by migration 20260424195030) so the frontend can
 *  hydrate the CouncilPanel after reload. The legacy memory_events sidecar
 *  for variants is preserved for any existing readers.
 */
async function saveAssistantMessage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  userId: string,
  content: string,
  model: string,
  variants: Array<{ model: string; content: string; thinking?: string | null }>,
  thinkingContent: string | null = null,
  agentId: string = "luca",
  trace: {
    rankings: Array<{ judge_model: string; raw_text: string; parsed_ranking: string[] }>;
    aggregate: AggregateEntry[];
    label_to_model: Record<string, string>;
  } | null = null,
  councilV2: {
    proposers: Array<{ character: string; content: string; thinking: string | null }>;
    crosstalk: Array<{ character: string; content: string; source: string }>;
    verdict: "synthesize" | "diverge" | null;
    critique: unknown | null;
    revised_content: string | null;
  } | null = null,
) : Promise<string | null> {
  // Build metadata payload — when council v2 trace is provided, prefer that
  // shape (kind='council_v2'). Falls back to legacy council shape for any
  // remaining call sites.
  let metadata: Record<string, unknown> | null = null;
  if (councilV2) {
    metadata = {
      kind: "council_v2",
      proposers: councilV2.proposers,
      crosstalk: councilV2.crosstalk,
      verdict: councilV2.verdict,
      critique: councilV2.critique,
      revised_content: councilV2.revised_content,
    };
  } else if (variants.length > 0) {
    metadata = {
      kind: "council",
      variants: variants.map((v) => ({
        model: v.model,
        content: v.content,
        thinking: v.thinking ?? null,
      })),
      rankings: trace?.rankings ?? [],
      aggregate: trace?.aggregate ?? [],
      label_to_model: trace?.label_to_model ?? {},
    };
  }

  const { data: inserted, error: insertError } = await supabase.from("messages").insert({
    thread_id: threadId,
    user_id: userId,
    role: "assistant",
    content,
    model,
    agent: agentId,
    thinking_content: thinkingContent || null,
    tokens_used: null,
    ...(metadata ? { metadata } : {}),
  }).select("id").single();

  if (insertError) {
    throw new Error(`Failed to save assistant message: ${insertError.message}`);
  }

  // Legacy variants sidecar (kept for backward compat with any existing
  // readers; new readers should use messages.metadata).
  if (variants.length > 0) {
    await supabase.from("memory_events").insert({
      user_id: userId,
      type: "multi_model_variants",
      content: JSON.stringify(variants.map((v) => ({ model: v.model, content: v.content }))),
      salience: 0,
    });
  }

  return inserted?.id ?? null;
}

/** Single-model streaming fallback (same as original chat function). */
async function singleModelStream(
  messages: any[],
  model: string,
  apiKey: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  userId: string,
  userMessage: string,
  corsHeaders: Record<string, string>,
  agentId: string = "luca",
  authHeader: string = "",
  pendingRevisions: PendingRevision[] = [],
  // deno-lint-ignore no-explicit-any
  toolMessages: any[] = [],
): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      };

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* closed */ }
      }, 5000);

      try {
        const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://polyphonic.chat",
            "X-Title": "Polyphonic",
          },
          body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
        });

        if (!orResponse.ok) {
          const errText = await orResponse.text().catch(() => "");
          console.error("Single-model provider error:", orResponse.status, errText);
          let message = `Model error (${orResponse.status})`;
          try {
            const parsed = JSON.parse(errText);
            const providerMessage = parsed?.error?.message || parsed?.message;
            if (providerMessage) message = providerMessage;
          } catch {
            if (errText) message = errText.slice(0, 240);
          }
          send({ type: "error", text: message });
          controller.close();
          clearInterval(heartbeat);
          return;
        }

        const reader = orResponse.body?.getReader();
        if (!reader) { send({ type: "error", text: "No stream" }); controller.close(); clearInterval(heartbeat); return; }

        const decoder = new TextDecoder();
        let fullContent = "";
        let fullThinking = "";
        let buffer = "";
        let usedModel = model;
        let tokensUsed: number | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const chunk = JSON.parse(payload);
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;
              if (delta.reasoning || delta.reasoning_content) {
                const t = delta.reasoning || delta.reasoning_content || "";
                fullThinking += t;
                send({ type: "thinking", text: t });
              }
              if (delta.content) { fullContent += delta.content; send({ type: "content", text: delta.content }); }
              if (chunk.model) usedModel = chunk.model;
              if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
            } catch { /* skip */ }
          }
        }

        const { data: insertedMessage, error: insertError } = await supabase.from("messages").insert({
          thread_id: threadId, user_id: userId, role: "assistant",
          content: fullContent || "(empty)", model: usedModel, agent: agentId,
          thinking_content: fullThinking || null, tokens_used: tokensUsed,
        }).select("id").single();
        if (insertError) {
          throw new Error(`Failed to save assistant message: ${insertError.message}`);
        }
        await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        autoTitleThread(supabase, threadId, userMessage, fullContent, apiKey).catch(() => {});
        const singleObservers = collectObservers({
          primaryAgentId: agentId,
          toolMessages,
        });
        queueContinuityTurnWrites({
          supabase,
          threadId,
          agentId,
          userId,
          userMessage,
          agentResponse: fullContent,
          sourceMessageId: insertedMessage?.id ?? null,
          apiKey,
          authHeader,
          pendingRevisions: pendingRevisions || [],
          recentTurns: messages || [],
          observers: singleObservers,
        });

        send({ type: "done", model: usedModel, tokens_used: tokensUsed });
      } catch (err) {
        console.error("Single-model stream error:", err);
        send({ type: "error", text: "Stream interrupted" });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}

async function autoTitleThread(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  threadId: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
) {
  const { data: thread } = await supabase.from("threads").select("title").eq("id", threadId).single();
  if (thread?.title) return;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "Generate a short title (2-5 words) for this conversation. Return only the title, no quotes or punctuation." },
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantMessage.slice(0, 300) },
      ],
      max_tokens: 20,
    }),
  });

  if (resp.ok) {
    const data = await resp.json();
    const title = data.choices?.[0]?.message?.content?.trim();
    if (title && title.length > 0 && title.length < 100) {
      await supabase.from("threads").update({ title }).eq("id", threadId);
    }
  }
}

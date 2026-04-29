import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";
import { buildReasoningParams, extractThinkingFromResponse, type ReasoningEffort } from "../_shared/models.ts";
import { loadEmotionalState, formatEmotionalPrompt } from "../_shared/emotional-context.ts";
import { LUCA_SOUL, buildLucaSystemPrompt, buildLucaSynthesisPrompt } from "../_shared/agents/luca-soul.ts";
import { loadOrCreateLucaIdentity } from "../_shared/agents/luca-identity.ts";
import {
  buildCrisisDirective,
  classifyCrisis,
  loadUserRegion,
  recordCrisisEvent,
  resolveCrisisResource,
} from "../_shared/agents/crisis.ts";
import {
  finalizePendingRevisions,
  formatPendingRevisionsPrompt,
  loadPendingRevisions,
  type PendingRevision,
} from "../_shared/agents/pending-revisions.ts";
import {
  formatAgentSkillsPrompt,
  loadRelevantAgentSkills,
} from "../_shared/agents/skills.ts";
import { summarizeToolContext } from "../_shared/agents/tool-context.ts";

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
    const { thread_id, message, reasoning_effort: effortOverride, ensemble: ensembleOverride } = body;

    if (!thread_id || !message || typeof message !== "string" || message.length > 32000) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey: string | null = userKeyData || null;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured. Add your OpenRouter key in Settings to use Polyphonic." }), {
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

    // Load conversation history
    const { data: history } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(50);

    // Load emotional state, beliefs, and memories in parallel
    const [emotionalState, beliefsResult, mnemosResult, identityResult, pendingRevisionsResult, skillsResult] = await Promise.allSettled([
      loadEmotionalState(supabase, userId),
      supabase.from("beliefs").select("content, confidence, confidence_tier, domain")
        .eq("user_id", userId).eq("active", true)
        .order("confidence", { ascending: false }).limit(8),
      (async () => {
        try {
          const mnemos = new MnemosEngine(supabase, userId);
          return await mnemos.retrieve(message, { limit: 5, spread_activation: true });
        } catch { return []; }
      })(),
      agentIsSystemLuca ? loadOrCreateLucaIdentity(supabase, userId, agentId) : Promise.resolve(null),
      agentIsSystemLuca ? loadPendingRevisions(supabase, userId, thread_id) : Promise.resolve([]),
      agentIsSystemLuca ? loadRelevantAgentSkills(supabase, userId, agentId, message) : Promise.resolve([]),
    ]);

    // Format emotional context
    const emotionalData = emotionalState.status === "fulfilled" ? emotionalState.value : null;
    const emotionalBlock = formatEmotionalPrompt(emotionalData);

    // Format beliefs context
    let beliefsBlock = "";
    if (beliefsResult.status === "fulfilled" && (beliefsResult.value.data || []).length > 0) {
      const beliefs = beliefsResult.value.data || [];
      const beliefLines = beliefs.map((b: { content: string; confidence: number; confidence_tier?: string; domain?: string }) =>
        `- [${b.confidence.toFixed(2)} ${b.confidence_tier || ''}] ${b.content}`
      );
      beliefsBlock = `\nBeliefs you've formed from observing and reflecting (reference naturally when relevant):\n${beliefLines.join("\n")}`;
    }

    // Format memory context
    let memoryContext = "";
    if (mnemosResult.status === "fulfilled" && mnemosResult.value.length > 0) {
      const memorySnippets = mnemosResult.value
        .map((m: { engram: { content: string } }) => `- ${m.engram.content.slice(0, 200)}`)
        .join("\n");
      memoryContext = `\n\nRelevant memories about this person:\n${memorySnippets}`;
    }

    const identityDocs = identityResult.status === "fulfilled" ? identityResult.value : null;
    const pendingRevisions = pendingRevisionsResult.status === "fulfilled" ? pendingRevisionsResult.value : [];
    const pendingRevisionsBlock = formatPendingRevisionsPrompt(pendingRevisions || []);
    const relevantSkills = skillsResult.status === "fulfilled" ? skillsResult.value : [];
    const skillsBlock = formatAgentSkillsPrompt(relevantSkills || []);

    // Thread gap detection — if returning to an idle conversation
    let continuityNote = "";
    if (history && history.length > 0) {
      const lastMsg = history[history.length - 1];
      const lastMsgTime = new Date(lastMsg.created_at || Date.now()).getTime();
      const gapHours = (Date.now() - lastMsgTime) / 3_600_000;
      if (gapHours > 24) {
        const gapDays = Math.floor(gapHours / 24);
        continuityNote = `\n\n[Note: This conversation has been idle for ${gapDays} day${gapDays > 1 ? 's' : ''}. Briefly acknowledge picking back up — reference the last topic naturally, like resuming a conversation with a friend. Don't be heavy-handed.]`;
      }
    }

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
          emotionalBlock,
          beliefsBlock,
          memoryContext,
          soulMd: identityDocs?.soulMd,
          selfModel: identityDocs?.selfModel,
          userModel: identityDocs?.userModel,
          skillsBlock,
          pendingRevisions: pendingRevisionsBlock,
          continuityNote,
          crisisDirective,
        })
      : agentPrompt + continuityNote;

    // Build base messages array
    const baseMessages: any[] = [
      { role: "system", content: enrichedSystemPrompt },
    ];
    if (history) {
      for (const msg of history) {
        baseMessages.push({ role: msg.role, content: msg.content });
      }
    }
    baseMessages.push({ role: "user", content: message });

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
        message,
        corsHeaders,
        agentId,
        authHeader,
        pendingRevisions || [],
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
          // Fan out to all ensemble models in parallel (non-streaming, with reasoning)
          const variantPromises = ensembleModels.map((model) =>
            callModelNonStreaming(baseMessages, model, apiKey!, reasoningEffort)
          );

          const variantResults = await Promise.allSettled(variantPromises);

          // Collect successful responses (now includes thinking)
          const variants: Array<{ model: string; content: string; thinking: string | null }> = [];
          for (let i = 0; i < variantResults.length; i++) {
            const result = variantResults[i];
            const model = ensembleModels[i];
            if (result.status === "fulfilled" && result.value) {
              const { content, thinking } = result.value;
              variants.push({ model: shortModelName(model), content, thinking });
              send({ type: "variant", model: shortModelName(model), text: content, thinking });
            } else {
              const reason = result.status === "rejected" ? result.reason?.message || "unknown" : "empty";
              console.error(`Model ${model} failed:`, reason);
              send({ type: "variant_error", model: shortModelName(model), error: reason });
            }
          }

          if (variants.length === 0) {
            send({ type: "error", text: "All models failed to respond." });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          // If only one model succeeded, use its response directly
          if (variants.length === 1) {
            if (variants[0].thinking) {
              send({ type: "thinking", text: variants[0].thinking });
            }
            send({ type: "content", text: variants[0].content });
            await saveAssistantMessage(supabase, thread_id, userId, variants[0].content, "synthesis", variants, variants[0].thinking, agentId);
            finalizePendingRevisions(supabase, apiKey!, pendingRevisions || [], variants[0].content).catch(
              (e) => console.warn("pending revision finalization failed:", e)
            );
            await autoTitleThread(supabase, thread_id, message, variants[0].content, apiKey!);
            encodeMnemosMemory(supabase, userId, message, variants[0].content).catch(
              (e) => console.warn("Mnemos encode failed (non-fatal):", e)
            );
            fireObserverWatch(thread_id, agentId, authHeader);
            fireMnemosDialectic(thread_id, agentId, authHeader);
            fireSkillsDistill(thread_id, agentId, authHeader);
            send({ type: "done", model: "synthesis", tokens_used: null });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          // ─── Stage 2: peer-review ranking (single-judge variant) ───
          // Anonymize variants as Response A/B/C, ask the judge to rank them,
          // parse the FINAL RANKING block, compute aggregate. Falls back to
          // legacy synthesis if the judge fails or times out (>STAGE2_TIMEOUT_MS).
          send({ type: "ranking_starting" });
          const labels = makeLabels(variants.length);
          const labelToModel: Record<string, string> = {};
          variants.forEach((v, i) => {
            labelToModel[`Response ${labels[i]}`] = v.model;
          });
          const toolContext = summarizeToolContext(toolMessages);
          const rankingPrompt = buildRankingPrompt(
            message,
            variants.map((v, i) => ({ label: labels[i], content: v.content })),
            toolContext,
          );

          let aggregate: AggregateEntry[] = [];
          const rankings: Array<{
            judge_model: string;
            raw_text: string;
            parsed_ranking: string[];
          }> = [];

          try {
            const judgeResult = await Promise.race([
              callModelNonStreaming(
                [{ role: "user", content: rankingPrompt }],
                DEFAULT_RANKING_MODEL,
                apiKey!,
                "low",
              ),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), STAGE2_TIMEOUT_MS)),
            ]);

            if (judgeResult && judgeResult.content) {
              const parsed = parseRankingFromText(judgeResult.content);
              const entry = {
                judge_model: DEFAULT_RANKING_MODEL,
                raw_text: judgeResult.content,
                parsed_ranking: parsed,
              };
              rankings.push(entry);
              send({
                type: "ranking",
                judge_model: shortModelName(DEFAULT_RANKING_MODEL),
                raw_text: judgeResult.content,
                parsed_ranking: parsed,
              });
              aggregate = aggregateRankings(rankings, labelToModel);
              if (aggregate.length > 0) {
                send({ type: "aggregate_ranking", ordering: aggregate });
              }
            }
          } catch (rerr) {
            console.warn("Stage 2 ranking failed (non-fatal):", rerr);
          }

          // Pick prompt path: chairman (rank-aware) if aggregate has entries,
          // otherwise legacy synthesis prompt.
          const useChairman = aggregate.length > 0;
          send({ type: useChairman ? "chairman_starting" : "synthesizing" });

          // Build prompt with all variant responses
          const synthesisMessages: Array<{ role: string; content: string }> = useChairman
            ? [
                { role: "system", content: buildChairmanSystemPrompt(emotionalBlock, beliefsBlock) },
                { role: "user", content: buildChairmanUserPrompt(message, variants, aggregate, toolContext) },
              ]
            : [
                { role: "system", content: buildSynthesisSystemPrompt(emotionalBlock, beliefsBlock) },
                { role: "user", content: buildSynthesisUserPrompt(message, variants, toolContext) },
              ];

          // Stream the synthesis
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
              // No reasoning params for synthesis — it's merging outputs, not reasoning from scratch
            }),
          });

          if (!orResponse.ok) {
            const errBody = await orResponse.text();
            console.error("Synthesis error:", orResponse.status, errBody);

            // Retry synthesis without any special params (plain request)
            const retryResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
                stream: false,
                max_tokens: 4096,
              }),
            });

            if (retryResponse.ok) {
              // deno-lint-ignore no-explicit-any
              const retryData: any = await retryResponse.json();
              const retryContent = retryData?.choices?.[0]?.message?.content || "";
              if (retryContent) {
                send({ type: "content", text: retryContent });
                await saveAssistantMessage(supabase, thread_id, userId, retryContent, "synthesis-retry", variants, null, agentId, { rankings, aggregate, label_to_model: labelToModel });
                finalizePendingRevisions(supabase, apiKey!, pendingRevisions || [], retryContent).catch(
                  (e) => console.warn("pending revision finalization failed:", e)
                );
                await autoTitleThread(supabase, thread_id, message, retryContent, apiKey!);
                encodeMnemosMemory(supabase, userId, message, retryContent).catch(
                  (e) => console.warn("Mnemos encode failed (non-fatal):", e)
                );
                fireObserverWatch(thread_id, agentId, authHeader);
                fireMnemosDialectic(thread_id, agentId, authHeader);
                fireSkillsDistill(thread_id, agentId, authHeader);
                send({ type: "done", model: "synthesis", tokens_used: null });
                controller.close();
                clearInterval(heartbeat);
                return;
              }
            }

            // Final fallback: use first variant but notify the user
            const best = variants[0];
            send({ type: "content", text: best.content });
            await saveAssistantMessage(supabase, thread_id, userId, best.content, "fallback", variants, null, agentId, { rankings, aggregate, label_to_model: labelToModel });
            finalizePendingRevisions(supabase, apiKey!, pendingRevisions || [], best.content).catch(
              (e) => console.warn("pending revision finalization failed:", e)
            );
            await autoTitleThread(supabase, thread_id, message, best.content, apiKey!);
            encodeMnemosMemory(supabase, userId, message, best.content).catch(
              (e) => console.warn("Mnemos encode failed (non-fatal):", e)
            );
            fireObserverWatch(thread_id, agentId, authHeader);
            fireMnemosDialectic(thread_id, agentId, authHeader);
            fireSkillsDistill(thread_id, agentId, authHeader);
            send({ type: "done", model: "fallback", tokens_used: null });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const reader = orResponse.body?.getReader();
          if (!reader) {
            send({ type: "error", text: "No synthesis stream" });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          const decoder = new TextDecoder();
          let synthesizedContent = "";
          let synthesisThinking = "";
          let buffer = "";
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

                // Handle thinking/reasoning from synthesis model
                if (delta.reasoning || delta.reasoning_content) {
                  const thinkText = delta.reasoning || delta.reasoning_content || "";
                  synthesisThinking += thinkText;
                  send({ type: "thinking", text: thinkText });
                }

                if (delta.content) {
                  synthesizedContent += delta.content;
                  send({ type: "content", text: delta.content });
                }

                if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // Save the synthesized message (thinking separate from variants)
          await saveAssistantMessage(supabase, thread_id, userId, synthesizedContent || "(empty)", "synthesis", variants, synthesisThinking || null, agentId, { rankings, aggregate, label_to_model: labelToModel });
          finalizePendingRevisions(supabase, apiKey!, pendingRevisions || [], synthesizedContent).catch(
            (e) => console.warn("pending revision finalization failed:", e)
          );

          // Update thread timestamp
          await supabase
            .from("threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", thread_id);

          // Auto-title (fire and forget)
          autoTitleThread(supabase, thread_id, message, synthesizedContent, apiKey!).catch(
            (e) => console.error("Auto-title failed:", e)
          );

          // Encode the exchange into Mnemos (fire and forget)
          encodeMnemosMemory(supabase, userId, message, synthesizedContent).catch(
            (e) => console.warn("Mnemos encode failed (non-fatal):", e)
          );

          // Fire observer-watch (best-effort)
          fireObserverWatch(thread_id, agentId, authHeader);
          fireMnemosDialectic(thread_id, agentId, authHeader);
          fireSkillsDistill(thread_id, agentId, authHeader);

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire observer-watch in the background. Best-effort. Skips for the Observer's own threads. */
function fireObserverWatch(threadId: string, agentId: string, authHeader: string) {
  if (agentId === "observer") return; // don't observe the observer
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/observer-watch`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ thread_id: threadId, agent_id: agentId }),
    }).catch((e) => console.warn("observer-watch dispatch failed (non-fatal):", e));
  } catch (e) {
    console.warn("observer-watch dispatch error:", e);
  }
}

/** Fire mnemos-dialectic in the background. Best-effort. Luca only. */
function fireMnemosDialectic(threadId: string, agentId: string, authHeader: string) {
  if (agentId !== "luca") return;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mnemos-dialectic`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ thread_id: threadId, agent_id: agentId }),
    }).catch((e) => console.warn("mnemos-dialectic dispatch failed (non-fatal):", e));
  } catch (e) {
    console.warn("mnemos-dialectic dispatch error:", e);
  }
}

/** Fire skills-distill in the background. Best-effort. Luca only. */
function fireSkillsDistill(threadId: string, agentId: string, authHeader: string) {
  if (agentId !== "luca") return;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/skills-distill`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ thread_id: threadId, agent_id: agentId }),
    }).catch((e) => console.warn("skills-distill dispatch failed (non-fatal):", e));
  } catch (e) {
    console.warn("skills-distill dispatch error:", e);
  }
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
) {
  // Build metadata payload — only when we have something worth storing.
  const metadata = variants.length > 0
    ? {
        kind: "council",
        variants: variants.map((v) => ({
          model: v.model,
          content: v.content,
          thinking: v.thinking ?? null,
        })),
        rankings: trace?.rankings ?? [],
        aggregate: trace?.aggregate ?? [],
        label_to_model: trace?.label_to_model ?? {},
      }
    : null;

  await supabase.from("messages").insert({
    thread_id: threadId,
    user_id: userId,
    role: "assistant",
    content,
    model,
    agent: agentId,
    thinking_content: thinkingContent || null,
    tokens_used: null,
    ...(metadata ? { metadata } : {}),
  });

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
}

/** Encode a conversation exchange into Mnemos. */
async function encodeMnemosMemory(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  userMessage: string,
  assistantResponse: string,
) {
  const mnemos = new MnemosEngine(supabase, userId);
  await mnemos.encode(
    `User: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}`,
    {
      engram_type: "episodic",
      tags: ["conversation"],
      source_context: { type: "chat_exchange" },
    }
  );
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

        await supabase.from("messages").insert({
          thread_id: threadId, user_id: userId, role: "assistant",
          content: fullContent || "(empty)", model: usedModel, agent: agentId,
          thinking_content: fullThinking || null, tokens_used: tokensUsed,
        });
        await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        autoTitleThread(supabase, threadId, userMessage, fullContent, apiKey).catch(() => {});
        finalizePendingRevisions(supabase, apiKey, pendingRevisions || [], fullContent).catch(
          (e) => console.warn("pending revision finalization failed:", e)
        );

        // Encode into Mnemos
        encodeMnemosMemory(supabase, userId, userMessage, fullContent).catch(() => {});

        // Fire post-turn background reflection (best-effort)
        if (authHeader) {
          fireObserverWatch(threadId, agentId, authHeader);
          fireMnemosDialectic(threadId, agentId, authHeader);
          fireSkillsDistill(threadId, agentId, authHeader);
        }

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

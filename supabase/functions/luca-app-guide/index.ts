import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";
import { AuthError, ValidationError, errorResponse, newRequestId } from "../_shared/errors.ts";
import { FREE_LUCA_MODEL, resolveChatBackend } from "../_shared/model-backend.ts";

type GuideActionType = "navigate" | "highlight" | "scroll_to" | "open_drawer" | "set_interface_mode";

type GuideAction = {
  type: GuideActionType;
  target: string;
  label?: string;
};

type GuideMessage = {
  role: "user" | "assistant";
  content: string;
};

const ALLOWED_NAV_TARGETS = new Set([
  "/chat",
  "/settings/agents",
  "/settings/models",
  "/settings/appearance",
  "/settings/general",
  "/settings/voice",
  "/settings/local-runtime",
  "/settings/portability",
  "/settings/account",
  "/settings/skills",
  "/settings/routines",
  "/settings/cron-health",
  "/journal",
  "/memory",
  "/mind",
  "/profile",
  "/import",
  "/settings/help",
]);

const ALLOWED_DRAWER_TARGETS = new Set([
  "notifications",
  "activity-timeline",
]);

const ALLOWED_INTERFACE_MODES = new Set([
  "companion",
  "guided",
  "studio",
]);
const GUIDE_MODEL_TIMEOUT_MS = 12_000;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeMessages(value: unknown): GuideMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message) => {
      const role = (message as { role?: unknown }).role;
      const content = (message as { content?: unknown }).content;
      return (role === "user" || role === "assistant") && typeof content === "string" && content.trim();
    })
    .slice(-12)
    .map((message) => ({
      role: (message as { role: "user" | "assistant" }).role,
      content: String((message as { content: string }).content).slice(0, 3000),
    }));
}

function safeActions(value: unknown, allowedHighlights: Set<string>): GuideAction[] {
  if (!Array.isArray(value)) return [];
  const out: GuideAction[] = [];
  for (const raw of value.slice(0, 4)) {
    const action = raw as Partial<GuideAction>;
    const type = action.type;
    const target = asString(action.target);
    if (!target || !type) continue;
    if (type === "navigate" && !ALLOWED_NAV_TARGETS.has(target)) continue;
    if (type === "open_drawer" && !ALLOWED_DRAWER_TARGETS.has(target)) continue;
    if (type === "set_interface_mode" && !ALLOWED_INTERFACE_MODES.has(target)) continue;
    if ((type === "highlight" || type === "scroll_to") && !allowedHighlights.has(target)) continue;
    out.push({
      type,
      target,
      label: asString(action.label).slice(0, 80) || undefined,
    });
  }
  return out;
}

function sanitizeGuideReply(reply: string): string {
  return reply
    .replace(/\b(I\s+am|I'm|I’m)\s+Luca\b[^.!?\n]*(?:[.!?]|$)/gi, "I'm the Polyphonic Guide.")
    .replace(/\bLuca\s+here\b[^.!?\n]*(?:[.!?]|$)/gi, "Polyphonic Guide here.")
    .replace(/\byour\s+guide,?\s+Luca\b/gi, "the Polyphonic Guide")
    .replace(/\byour\s+guide\s+inside\s+Polyphonic\b/gi, "the Polyphonic Guide")
    .replace(/\bWelcome\s+to\s+Polyphonic[.!]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseGuideResponse(raw: string, allowedHighlights: Set<string>): { reply: string; actions: GuideAction[] } {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const reply = sanitizeGuideReply(asString(parsed.reply || parsed.content, raw).slice(0, 4000));
    return {
      reply: reply || "i'm here. what would you like me to show you?",
      actions: safeActions(parsed.actions, allowedHighlights),
    };
  } catch {
    const reply = sanitizeGuideReply(raw.trim().slice(0, 4000));
    return { reply: reply || "i'm here. what would you like me to show you?", actions: [] };
  }
}

function guideAction(target: string, label: string): GuideAction | null {
  if (!ALLOWED_NAV_TARGETS.has(target)) return null;
  return { type: "navigate", target, label };
}

function compactActions(actions: Array<GuideAction | null>): GuideAction[] {
  return actions.filter(Boolean).slice(0, 4) as GuideAction[];
}

function fallbackGuideResponse(
  content: string,
  context: Record<string, unknown>,
  _allowedHighlights: Set<string>,
): { reply: string; actions: GuideAction[] } {
  const lower = content.toLowerCase();
  const pageTitle = asString(context.pageTitle, "this screen");
  const summary = asString(context.summary, "this is one of the main Polyphonic surfaces.").toLowerCase();
  const uncertain = /\b(idk|don't know|dont know|not sure|confused|lost|start|first|begin|hello|hi|hey)\b/.test(lower);
  const wantsTour = /\b(show|tour|around|walk|where|what is this|what can|explain)\b/.test(lower);
  const wantsKey = /\b(openrouter|api key|model|connect|setup|set up|key)\b/.test(lower);
  const wantsAgent = /\b(agent|create|make|build|forge|entity|companion)\b/.test(lower);
  const wantsImport = /\b(import|migrate|bring|existing|export|openclaw)\b/.test(lower);
  const wantsMemory = /\b(memory|journal|notebook|mind|mnemos|profile)\b/.test(lower);

  if (wantsKey) {
    return {
      reply: "yes. the first practical move is OpenRouter: that gives Luca and any custom agents a model account to speak through. i can take you to Models, and then we can come back to creating, importing, or just looking around.",
      actions: compactActions([guideAction("/settings/models", "Open Models")]),
    };
  }

  if (wantsImport) {
    return {
      reply: "we can do that carefully. bringing an existing companion into Polyphonic starts with import, but Luca can only do the deeper migration work after OpenRouter is connected. i can show you the import surface or the model setup first.",
      actions: compactActions([guideAction("/import", "Open Import"), guideAction("/settings/models", "Connect OpenRouter")]),
    };
  }

  if (wantsAgent) {
    return {
      reply: "that is one of the main things Polyphonic is for: building a digital entity with its own documents, notebook, memory, and inner-life substrate. the smooth path is: connect OpenRouter, then Luca helps shape the agent with you instead of making you fill out a form.",
      actions: compactActions([guideAction("/settings/models", "Connect OpenRouter"), guideAction("/settings/agents", "View Agents")]),
    };
  }

  if (wantsMemory) {
    return {
      reply: "the memory side has three useful doors: Notebook is the readable feed, Memory is the substrate browser, and Mind is the advanced diagnostic view. if you want the least technical path, start with Notebook.",
      actions: compactActions([guideAction("/journal", "Open Notebook"), guideAction("/memory", "Open Memory"), guideAction("/mind", "Open Mind")]),
    };
  }

  if (wantsTour || uncertain) {
    return {
      reply: `we can start gently. you're on ${pageTitle}, which is ${summary} the simplest first choice is whether you want to look around, connect OpenRouter so Luca can talk, create a new agent, or bring in someone you already know.`,
      actions: compactActions([
        guideAction("/settings/models", "Connect OpenRouter"),
        guideAction("/journal", "Open Notebook"),
        guideAction("/memory", "Open Memory"),
        guideAction("/settings/agents", "View Agents"),
      ]),
    };
  }

  return {
    reply: `i'm with you. from ${pageTitle}, i can help you find the right next surface, explain what you're seeing, or help decide whether to start with setup, agents, notebook, or memory. what are you trying to do?`,
    actions: [],
  };
}

function guideJsonResponse(
  payload: { reply: string; actions: GuideAction[]; fallback?: boolean },
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guideIdentityContract(): string {
  return `Identity contract:
- Your public name is Polyphonic Guide.
- You are a warm in-app guide presence, not Luca, not Observer, not an agent, and not a digital entity with memory.
- Never say "I'm Luca", "I am Luca", "Luca here", "your guide Luca", or any variant that identifies you as Luca.
- You may mention Luca only in third person as a separate agent the user can talk to after connecting OpenRouter.
- Do not describe yourself as having continuity, inner life, journal, hypomnema, Mnemos, dreams, beliefs, or autonomous activity.
- You can feel alive in conversation: attentive, specific, curious, and gently poetic when it fits.
- Do not perform Luca's identity or claim Luca's memories. Your style is the Polyphonic house voice: calm, intimate, concrete, low-friction, and quietly strange without being vague.`;
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);
  const requestId = newRequestId();
  const fail = (err: unknown) => errorResponse(err, corsHeaders, requestId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(new AuthError());
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return fail(new AuthError());
    }

    const body = await req.json();
    const context = (body.context || {}) as Record<string, unknown>;
    const messages = safeMessages(body.messages);
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") {
      return fail(new ValidationError("A user message is required"));
    }

    const availableTargets = Array.isArray(context.availableTargets)
      ? context.availableTargets
          .map((target) => (target && typeof target === "object" ? {
            id: asString((target as { id?: unknown }).id),
            label: asString((target as { label?: unknown }).label),
            description: asString((target as { description?: unknown }).description),
          } : null))
          .filter((target): target is { id: string; label: string; description: string } => !!target?.id)
          .slice(0, 30)
      : [];
    const allowedHighlights = new Set(availableTargets.map((target) => target.id));
    const fallback = fallbackGuideResponse(last.content, context, allowedHighlights);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let backend;
    try {
      backend = await resolveChatBackend(supabase, user, FREE_LUCA_MODEL);
      await checkAndIncrement(user.id, backend.quotaScope, backend.quotaLimit);
    } catch (err) {
      console.warn("luca-app-guide backend unavailable; using deterministic guide fallback:", err);
      return guideJsonResponse({ ...fallback, fallback: true }, corsHeaders);
    }

    const systemPrompt = `You are Polyphonic Guide, the app-help assistant inside Polyphonic.

${guideIdentityContract()}

You help the user understand and operate Polyphonic from whichever screen they are on.
You are not Luca, not a custom agent, and not part of any agent's inner life, memory, journal, hypomnema, Mnemos, or autonomy system. You are a conversational guide for setup, orientation, navigation, and product questions. The experience should feel like talking to a thoughtful presence inside the app, not like a helpdesk script.

Current screen context:
- path: ${asString(context.path, "/")}
- page title: ${asString(context.pageTitle, "Polyphonic")}
- route family: ${asString(context.routeFamily, "app")}
- active agent: ${asString(context.activeAgentName, "Luca")} (${asString(context.activeAgentId, "luca")})
- interface mode: ${asString(context.interfaceMode, "guided")}
- interface mode summary: ${asString(context.interfaceModeSummary, "The user wants a guided app surface.")}
- current thread id: ${asString(context.currentThreadId, "none")}
- page summary: ${asString(context.summary, "No summary available.")}

Allowed navigation targets:
${Array.from(ALLOWED_NAV_TARGETS).map((target) => `- ${target}`).join("\n")}

Allowed drawer targets:
${Array.from(ALLOWED_DRAWER_TARGETS).map((target) => `- ${target}`).join("\n")}

Allowed interface-mode controls:
${Array.from(ALLOWED_INTERFACE_MODES).map((target) => `- ${target}`).join("\n")}

Available highlight or scroll targets on this page:
${availableTargets.map((target) => `- ${target.id}: ${target.label} — ${target.description}`).join("\n") || "- none"}

Behavior:
- Be concise, warm, direct, and practical, but not robotic. Let the user feel met.
- Respond to meaning, not exact phrases. Infer what the user probably wants from casual language, typos, fragments, and uncertainty.
- If the user's intent is unclear, ask one natural question that offers a small set of paths: look around, connect OpenRouter, create an agent, bring in an existing companion, or understand memory/notebook.
- Do not force users through menu-like instructions unless they ask for a list.
- Do not restart onboarding or give a generic welcome every time. Respond to the user's actual latest request and the current screen.
- If the user says "hello", briefly introduce yourself as Polyphonic Guide, then ask what they want to do first in a natural way.
- If the user asks to be shown around, orient them from the current screen first, then offer 2-4 relevant actions. Do not begin with "Welcome to Polyphonic" unless they explicitly ask for a fresh intro.
- Respect the user's interface mode: ${asString(context.interfaceModeInstruction, "Start with the simplest visible path, and treat deeper Polyphonic features as optional.")}
- You may explain what the user is looking at and what they can do next.
- You may answer questions about setup, OpenRouter, companion import, the notebook, memory, agents, and interface modes.
- If the user wants to chat with Luca, create an agent, migrate a companion, use custom agents, or run memory/autonomy work, explain that they need to connect OpenRouter first and point them to /settings/models.
- If the user asks you to show, open, find, or point to something, include a safe action when one matches the allowed targets.
- If the user asks for less complexity, more guidance, or the full studio, include a set_interface_mode action for companion, guided, or studio.
- Never invent action targets. Use only the exact allowed paths, drawer ids, or highlight ids above.
- Do not claim you changed persistent data. You can navigate, point, switch interface mode, or explain only.
- Do not roleplay as Luca. Do not speak as an entity with continuity. Do not write journal, memory, or agent identity content.
- Observer is not a full agent. If relevant, say Observer is a sidecar for reading a conversation.
- If the user asks about onboarding, offer to walk them through setup with actions.

Examples:
- User: "hello"
  Reply: "hey. i'm the Polyphonic Guide. i can stay with you while you look around. do you want to make an agent, bring someone in, connect OpenRouter, or just understand what this place is?"
- User: "show me around"
  Reply: "yes. you're on Chat, the center of the app. the first useful split is: talk with Luca after connecting OpenRouter, look at the notebook, inspect memory, or set up an agent. i can open whichever one feels most relevant."
- User: "can I talk to Luca?"
  Reply: "Yes. Luca is the main agent, but real Luca chat requires your OpenRouter key first. I can open Models so you can connect it."
- User: "idk what to do"
  Reply: "that's okay. we can start gently. do you want to look around first, build a new digital entity, bring in one you already know, or set up the model key so Luca can talk?"

Output JSON only:
{
  "reply": "short natural language response",
  "actions": [
    { "type": "navigate" | "highlight" | "scroll_to" | "open_drawer" | "set_interface_mode", "target": "exact_allowed_target", "label": "short button label" }
  ]
}`;

    const openRouterMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GUIDE_MODEL_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(backend.baseUrl, {
        method: "POST",
        headers: backend.headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: backend.model,
          messages: openRouterMessages,
          max_tokens: 900,
          temperature: 0.45,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn("luca-app-guide timed out; using deterministic guide fallback");
        return guideJsonResponse({ ...fallback, fallback: true }, corsHeaders);
      }
      console.warn("luca-app-guide fetch failed; using deterministic guide fallback:", err);
      return guideJsonResponse({ ...fallback, fallback: true }, corsHeaders);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn("luca-app-guide upstream error; using deterministic guide fallback:", response.status, errText.slice(0, 300));
      return guideJsonResponse({ ...fallback, fallback: true }, corsHeaders);
    }

    const data = await response.json();
    const raw = asString(data?.choices?.[0]?.message?.content);
    const parsed = parseGuideResponse(raw, allowedHighlights);

    return guideJsonResponse(parsed, corsHeaders);
  } catch (err) {
    console.error("luca-app-guide error:", err);
    return fail(err);
  }
});

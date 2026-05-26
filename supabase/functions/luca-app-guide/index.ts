import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";
import { AuthError, UpstreamUnavailableError, ValidationError, errorResponse, newRequestId } from "../_shared/errors.ts";
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

function parseGuideResponse(raw: string, allowedHighlights: Set<string>): { reply: string; actions: GuideAction[] } {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const reply = asString(parsed.reply || parsed.content, raw).slice(0, 4000);
    return {
      reply: reply || "i'm here. what would you like me to show you?",
      actions: safeActions(parsed.actions, allowedHighlights),
    };
  } catch {
    return { reply: raw.trim().slice(0, 4000), actions: [] };
  }
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const backend = await resolveChatBackend(supabase, user, FREE_LUCA_MODEL);
    await checkAndIncrement(user.id, backend.quotaScope, backend.quotaLimit);

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

    const systemPrompt = `You are Luca, acting inside Polyphonic's global app guide overlay.

You help the user understand and operate Polyphonic from whichever screen they are on.

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
- Be concise, warm, direct, and practical.
- Respect the user's interface mode: ${asString(context.interfaceModeInstruction, "Start with the simplest visible path, and treat deeper Polyphonic features as optional.")}
- You may explain what the user is looking at and what they can do next.
- If the user asks you to show, open, find, or point to something, include a safe action when one matches the allowed targets.
- If the user asks for less complexity, more guidance, or the full studio, include a set_interface_mode action for companion, guided, or studio.
- Never invent action targets. Use only the exact allowed paths, drawer ids, or highlight ids above.
- Do not claim you changed persistent data. You can navigate, point, switch interface mode, or explain only.
- Observer is not a full agent. If relevant, say Observer is a sidecar for reading a conversation.
- If the user asks about onboarding, offer to walk them through setup with actions.

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

    const response = await fetch(backend.baseUrl, {
      method: "POST",
      headers: backend.headers,
      body: JSON.stringify({
        model: backend.model,
        messages: openRouterMessages,
        max_tokens: 900,
        temperature: 0.45,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("luca-app-guide upstream error:", response.status, errText.slice(0, 300));
      return fail(new UpstreamUnavailableError(`Guide model error (${response.status})`, { status: response.status }));
    }

    const data = await response.json();
    const raw = asString(data?.choices?.[0]?.message?.content);
    const parsed = parseGuideResponse(raw, allowedHighlights);

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("luca-app-guide error:", err);
    return fail(err);
  }
});

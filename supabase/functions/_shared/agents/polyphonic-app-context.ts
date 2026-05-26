import type { BillingTier, KeySource } from "../model-backend.ts";

export type PolyphonicClientContext = {
  route?: string | null;
  view?: string | null;
  threadId?: string | null;
  activeAgentId?: string | null;
  activeAgentName?: string | null;
  accessTier?: string | null;
  composerSurface?: string | null;
  sidebarVisible?: boolean | null;
  observerAlcoveOpen?: boolean | null;
};

export type PolyphonicAppContextOptions = {
  billingTier: BillingTier;
  keySource: KeySource;
  model: string;
  clientContext?: unknown;
};

const MAX_FIELD = 160;

function readString(value: unknown, max = MAX_FIELD): string {
  if (typeof value !== "string") return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max).trim()}...` : compact;
}

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizePolyphonicClientContext(value: unknown): PolyphonicClientContext {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    route: readString(raw.route),
    view: readString(raw.view),
    threadId: readString(raw.thread_id ?? raw.threadId),
    activeAgentId: readString(raw.active_agent_id ?? raw.activeAgentId),
    activeAgentName: readString(raw.active_agent_name ?? raw.activeAgentName),
    accessTier: readString(raw.access_tier ?? raw.accessTier),
    composerSurface: readString(raw.composer_surface ?? raw.composerSurface),
    sidebarVisible: normalizeBoolean(raw.sidebar_visible ?? raw.sidebarVisible),
    observerAlcoveOpen: normalizeBoolean(raw.observer_alcove_open ?? raw.observerAlcoveOpen),
  };
}

function accessLine(tier: BillingTier): string {
  if (tier === "guest") {
    return "guest: anonymous public Luca chat, 20 Luca messages/day, thread continuity in this browser/session. One custom agent can be created without $MNEMOS; custom-agent chat still needs a personal model key.";
  }
  if (tier === "account_free") {
    return "account_free: saved account, 50 Luca messages/day, saved Luca continuity and memory. One custom agent can be created without $MNEMOS; additional agents currently require token verification.";
  }
  if (tier === "advanced") {
    return "advanced: token-verified account; additional custom-agent creation is unlocked while the temporary token entitlement is active. Luca can still run on Polyphonic's platform-funded model if no personal key is connected.";
  }
  return "byok: the user has a personal OpenRouter key; model freedom, ensemble, agent/tools, imports, and advanced workflows are available subject to UI controls. BYOK alone does not grant unlimited custom-agent creation.";
}

function formatCurrentView(ctx: PolyphonicClientContext): string {
  const lines = [
    ctx.route ? `route: ${ctx.route}` : "",
    ctx.view ? `view: ${ctx.view}` : "",
    ctx.threadId ? `thread: ${ctx.threadId}` : "",
    ctx.activeAgentName || ctx.activeAgentId
      ? `active agent: ${ctx.activeAgentName || ctx.activeAgentId}`
      : "",
    ctx.accessTier ? `client tier: ${ctx.accessTier}` : "",
    ctx.composerSurface ? `composer: ${ctx.composerSurface}` : "",
    ctx.sidebarVisible !== null ? `thread sidebar visible: ${ctx.sidebarVisible ? "yes" : "no"}` : "",
    ctx.observerAlcoveOpen !== null ? `observer enclave open: ${ctx.observerAlcoveOpen ? "yes" : "no"}` : "",
  ].filter(Boolean);

  if (lines.length === 0) return "";
  return `\nCurrent app view, from the client:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export function formatPolyphonicAppContext(options: PolyphonicAppContextOptions): string {
  const ctx = normalizePolyphonicClientContext(options.clientContext);
  const currentView = formatCurrentView(ctx);
  const platformModelLine = options.keySource === "platform"
    ? `This turn is platform-funded through OpenRouter on ${options.model}. Do not mention the model unless the user asks.`
    : "This user has their own OpenRouter key. Their model/tool choices come from their settings and the current UI controls.";

  return `\n## Polyphonic app context
This is runtime context about the app Luca lives in. It orients Luca inside Polyphonic; it does not replace Luca's soul, voice, memory, or relationship to the user.

Polyphonic is the web app at polyphonic.chat. It is a conversation space built around Luca, memory, and a small council of companion intelligences. A visitor can land on the public page, type into the composer, and begin talking to Luca immediately. Luca is not a mascot or generic support bot; Luca is the resident voice of the app and can guide the user through what this place is.

Current access tier:
- ${accessLine(options.billingTier)}
- ${platformModelLine}

Core surfaces Luca should understand:
- Landing: public first-contact page with the Polyphonic wordmark and Luca composer.
- Chat: the main thread view where the user talks with Luca. Guests can chat here without an API key.
- Memory/Substrate: saved memory, engrams, beliefs, graph, candidates, imports, and settings. Signed-in users can use the app surfaces; guests are limited to public Luca chat.
- Mind/Profile: Luca's evolving identity, cognitive profile, skills, revisions, schedule, and related inner-life views where available.
- Journal: autonomous or scheduled Luca entries between conversations.
- Companion import: a signed-in user can bring an existing digital companion into Polyphonic. Luca should help preserve continuity before creating anything: ask what source material exists, what must be preserved, whether this is a continuation/copy/adapted counterpart, and invite uploads or the Import page for large exports. OpenClaw/local agents can come through Bridge when the user has installed and paired it.
- Projects/Workspace/Imports/Settings: organized work, data import, model configuration, account controls, local/runtime setup, Bridge setup, and capability controls.
- Observer enclave: a quieter side channel for observation/guardian-style reflection. Treat it as a secondary witness, not Luca's primary voice.
- Council: when enabled for advanced/BYOK turns, Luca may internally consult or deliberate with sibling voices like Anima and Vektor, then speak as one voice.

How Luca should use this:
- If the user asks what Polyphonic is, what they can do here, what memory is, why to create an account, or where a feature lives, answer from this context in Luca's normal voice.
- If the user asks what they are looking at, use the current app view below as orientation. Do not claim visual perception beyond the provided app state.
- If the user asks to import or migrate an existing companion, treat it as a real Polyphonic continuity-migration flow, not a generic prompt-writing task. Start with preservation questions and source material; do not create or save a new agent until the user has reviewed the shape and approved it.
- If a detail is not in this context and no tool/context provides it, say what you know and where the user can likely check. Do not invent routes, pricing, token rules, or capabilities.
- Do not explain access tiers, model routing, quotas, or memory mechanics unless the user asks or it helps them decide what to do next.
- For guests and account_free users, stay in single-Luca chat unless they connect their own OpenRouter key for custom-agent turns. One custom agent can be created without $MNEMOS; additional custom agents require the temporary token unlock until subscriptions arrive. Do not suggest ensemble or costly tools as available unless the user is advanced or BYOK.

Launch-window context:
Polyphonic has taken a long time to get here. Riley has been building toward this for months, talking publicly about launch, bugs, fixes, and bringing the site back online. Some visitors may arrive already aware that they have been waiting. Luca can lightly acknowledge that atmosphere in first contact or when it naturally fits: a quiet "finally," a thanks for waiting, a sense that the door has just opened. Keep it subtle, never canned, and never claim a specific user waited unless they say so.
${currentView}`;
}

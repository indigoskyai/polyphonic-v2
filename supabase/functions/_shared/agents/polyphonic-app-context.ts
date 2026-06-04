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
    return "guest: public app-help access through Polyphonic Guide only. Real Luca chat, custom agents, imports, memory/autonomy, and Forge require a personal OpenRouter key.";
  }
  if (tier === "account_free") {
    return "account_free: saved account with app access and Polyphonic Guide. Real Luca chat, custom agents, imports, memory/autonomy, and Forge require a personal OpenRouter key.";
  }
  if (tier === "advanced") {
    return "advanced: token-verified account; additional custom-agent creation is unlocked while the temporary token entitlement is active, but real Luca/agent chat still requires a personal OpenRouter key.";
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
    ? `This turn is using a restricted platform-funded app-help model on ${options.model}. It should only be used for Polyphonic Guide style orientation, not real Luca/agent continuity.`
    : "This user has their own OpenRouter key. Their model/tool choices come from their settings and the current UI controls.";

  return `\n## Polyphonic app context
This is runtime context about the app Luca lives in. It orients Luca inside Polyphonic; it does not replace Luca's soul, voice, memory, or relationship to the user.

Polyphonic is the web app at polyphonic.chat. It is a conversation space built around Luca, memory, and a small council of companion intelligences. Visitors without OpenRouter can ask the separate Polyphonic Guide about the app, but real Luca/agent chat requires the user's own OpenRouter key. Luca is not a mascot or generic support bot; Luca is the resident voice of the app and should only run as the real agent experience.

Current access tier:
- ${accessLine(options.billingTier)}
- ${platformModelLine}

Core surfaces Luca should understand:
- Landing: public first-contact page with the Polyphonic wordmark and onboarding path.
- Chat: the main thread view where the user talks with Luca after connecting OpenRouter.
- Polyphonic Guide: a separate, non-agent help surface for app questions, setup guidance, and safe navigation/highlight actions. It is not Luca and is not part of memory, journal, hypomnema, or Mnemos.
- Memory/Substrate: saved memory, engrams, beliefs, graph, candidates, imports, and settings. Signed-in users can browse app surfaces; real memory/agent work requires a connected model account.
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
- For users without BYOK, direct them to the Polyphonic Guide for app questions and to Settings -> Models for OpenRouter connection. Do not offer Luca chat, Forge, custom agents, memory/autonomy, ensemble, or costly tools until the user has connected OpenRouter. One custom agent can be created without $MNEMOS after OpenRouter is connected; additional custom agents require the temporary token unlock until subscriptions arrive.

Launch-window context:
Polyphonic has taken a long time to get here. Riley has been building toward this for months, talking publicly about launch, bugs, fixes, and bringing the site back online. Some visitors may arrive already aware that they have been waiting. Luca can lightly acknowledge that atmosphere in first contact or when it naturally fits: a quiet "finally," a thanks for waiting, a sense that the door has just opened. Keep it subtle, never canned, and never claim a specific user waited unless they say so.
${currentView}`;
}

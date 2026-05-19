// Resolves which upstream chat-completions backend Luca should use.
//
// User OpenRouter keys always win. Without a user key, Polyphonic can fund
// Luca through OPENROUTER_API_KEY with tier-aware limits and feature gates.
// This intentionally keeps advanced model freedom and costly tools on BYOK.

export type BillingTier = "guest" | "account_free" | "advanced" | "byok";
export type KeySource = "user" | "platform";

export type ChatBackend = {
  provider: "openrouter";
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
  model: string;
  requestedModel: string;
  substitutedModel: boolean;
  keySource: KeySource;
  billingTier: BillingTier;
  allowEnsemble: boolean;
  allowTools: boolean;
  allowAdvancedSurfaces: boolean;
  allowMemoryWrites: boolean;
  quotaScope: "guest-chat-message" | "free-chat-message" | "byok-chat-message";
  quotaLimit: number;
  historyLimit: number;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const FREE_LUCA_MODEL = "moonshotai/kimi-k2.6";

function openRouterHeaders(apiKey: string, title = "Polyphonic Luca"): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://polyphonic.chat",
    "X-Title": title,
  };
}

function isAnonymousAuthUser(user: unknown): boolean {
  const u = (user || {}) as {
    is_anonymous?: boolean;
    app_metadata?: { provider?: string; providers?: string[] };
  };
  return (
    u.is_anonymous === true ||
    u.app_metadata?.provider === "anonymous" ||
    (Array.isArray(u.app_metadata?.providers) && u.app_metadata.providers.includes("anonymous"))
  );
}

async function loadUserOpenRouterKey(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
  if (error) {
    console.error("[model-backend] decrypt_user_api_key error:", error);
  }
  const key = typeof data === "string" ? data.trim() : "";
  return key || null;
}

function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

async function hasEmailAllowlistBypass(supabase: any, email: string): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await supabase
    .from("token_gate_email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[model-backend] token_gate_email_allowlist check error:", error);
    return false;
  }

  return Boolean(data);
}

async function hasAdvancedAccess(supabase: any, userId: string, email = ""): Promise<boolean> {
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (role) return true;

  if (await hasEmailAllowlistBypass(supabase, email)) return true;

  const { data: verification } = await supabase
    .from("token_gate_verifications")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  const expiresAt = typeof verification?.expires_at === "string"
    ? new Date(verification.expires_at).getTime()
    : 0;
  return expiresAt > Date.now();
}

function backendForUserKey(apiKey: string, requestedModel: string): ChatBackend {
  return {
    provider: "openrouter",
    apiKey,
    baseUrl: OPENROUTER_URL,
    headers: openRouterHeaders(apiKey),
    model: requestedModel,
    requestedModel,
    substitutedModel: false,
    keySource: "user",
    billingTier: "byok",
    allowEnsemble: true,
    allowTools: true,
    allowAdvancedSurfaces: true,
    allowMemoryWrites: true,
    quotaScope: "byok-chat-message",
    quotaLimit: 500,
    historyLimit: 60,
  };
}

function backendForPlatformKey(opts: {
  apiKey: string;
  requestedModel: string;
  billingTier: Exclude<BillingTier, "byok">;
  allowAdvancedSurfaces: boolean;
}): ChatBackend {
  return {
    provider: "openrouter",
    apiKey: opts.apiKey,
    baseUrl: OPENROUTER_URL,
    headers: openRouterHeaders(opts.apiKey),
    model: FREE_LUCA_MODEL,
    requestedModel: opts.requestedModel,
    substitutedModel: opts.requestedModel !== FREE_LUCA_MODEL,
    keySource: "platform",
    billingTier: opts.billingTier,
    allowEnsemble: false,
    allowTools: false,
    allowAdvancedSurfaces: opts.allowAdvancedSurfaces,
    allowMemoryWrites: opts.billingTier !== "guest",
    quotaScope: opts.billingTier === "guest" ? "guest-chat-message" : "free-chat-message",
    quotaLimit: opts.billingTier === "guest" ? 20 : 50,
    historyLimit: opts.billingTier === "guest" ? 14 : 50,
  };
}

export async function resolveOpenRouterKeyForUser(
  supabase: any,
  userId: string,
): Promise<{ apiKey: string | null; keySource: KeySource | null }> {
  const userKey = await loadUserOpenRouterKey(supabase, userId);
  if (userKey) return { apiKey: userKey, keySource: "user" };
  const platformKey = Deno.env.get("OPENROUTER_API_KEY")?.trim() || null;
  return { apiKey: platformKey, keySource: platformKey ? "platform" : null };
}

export async function resolveChatBackend(
  supabase: any,
  userOrId: string | { id?: string } | unknown,
  requestedModel: string = FREE_LUCA_MODEL,
): Promise<ChatBackend> {
  const userId = typeof userOrId === "string" ? userOrId : ((userOrId as { id?: string } | null)?.id || "");
  const userEmail = typeof userOrId === "string"
    ? ""
    : normalizeEmail((userOrId as { email?: string } | null)?.email);
  if (!userId) throw new Error("no_user");

  const userKey = await loadUserOpenRouterKey(supabase, userId);
  if (userKey) return backendForUserKey(userKey, requestedModel || FREE_LUCA_MODEL);

  const platformKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
  if (!platformKey) throw new Error("no_backend_available");

  const anonymous = typeof userOrId !== "string" && isAnonymousAuthUser(userOrId);
  const advanced = !anonymous && await hasAdvancedAccess(supabase, userId, userEmail);
  const billingTier: Exclude<BillingTier, "byok"> = anonymous
    ? "guest"
    : advanced
    ? "advanced"
    : "account_free";

  return backendForPlatformKey({
    apiKey: platformKey,
    requestedModel: requestedModel || FREE_LUCA_MODEL,
    billingTier,
    allowAdvancedSurfaces: advanced,
  });
}

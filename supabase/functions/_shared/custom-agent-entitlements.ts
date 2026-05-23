export const FREE_CUSTOM_AGENT_LIMIT = 1;

export const CUSTOM_AGENT_LIMIT_MESSAGE =
  "You can create one custom agent for free. Creating additional agents currently requires $MNEMOS access; subscriptions are coming soon.";

function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export async function hasTokenGateAccess(admin: any, userId: string, email?: string): Promise<boolean> {
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) console.warn("[custom-agent-entitlements] role check failed:", roleError);
  if (role) return true;

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const { data: emailBypass, error: emailError } = await admin
      .from("token_gate_email_allowlist")
      .select("email")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (emailError) console.warn("[custom-agent-entitlements] email bypass check failed:", emailError);
    if (emailBypass) return true;
  }

  const { data: verification, error: verificationError } = await admin
    .from("token_gate_verifications")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (verificationError) console.warn("[custom-agent-entitlements] token verification check failed:", verificationError);

  const expiresAt = typeof verification?.expires_at === "string"
    ? new Date(verification.expires_at).getTime()
    : 0;
  return expiresAt > Date.now();
}

export async function countEditableCustomAgents(admin: any, userId: string): Promise<number> {
  const { count, error } = await admin
    .from("agent_configs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_system", false)
    .eq("locked", false);

  if (error) {
    console.error("[custom-agent-entitlements] custom agent count failed:", error);
    throw new Error("custom_agent_count_failed");
  }

  return count ?? 0;
}

export async function ensureCanCreateCustomAgent(
  admin: any,
  userId: string,
  email?: string,
): Promise<{ ok: true; existingCount: number; tokenAccess: boolean } | { ok: false; status: number; body: Record<string, unknown> }> {
  const existingCount = await countEditableCustomAgents(admin, userId);
  if (existingCount < FREE_CUSTOM_AGENT_LIMIT) {
    return { ok: true, existingCount, tokenAccess: false };
  }

  const tokenAccess = await hasTokenGateAccess(admin, userId, email);
  if (tokenAccess) {
    return { ok: true, existingCount, tokenAccess };
  }

  return {
    ok: false,
    status: 403,
    body: {
      error: CUSTOM_AGENT_LIMIT_MESSAGE,
      code: "custom_agent_limit_requires_token",
      requires_token_gate: true,
      free_custom_agent_limit: FREE_CUSTOM_AGENT_LIMIT,
      existing_custom_agents: existingCount,
    },
  };
}

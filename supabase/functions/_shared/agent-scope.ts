export interface AgentScope {
  userId: string;
  agentId: string;
}

export const NON_SUBSTRATE_AGENT_IDS = new Set(["observer", "guardian"]);

export function normalizeAgentId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "luca";
}

export function isSubstrateAgentId(value: unknown): boolean {
  return !NON_SUBSTRATE_AGENT_IDS.has(normalizeAgentId(value).toLowerCase());
}

export function nonSubstrateSkip(agentId: unknown, surface: string): Record<string, unknown> {
  const normalized = normalizeAgentId(agentId);
  return {
    skipped: true,
    agent_id: normalized,
    surface,
    reason: `${normalized} is an observer sidecar, not an autonomous substrate agent`,
  };
}

export function nonSubstrateResponse(
  agentId: unknown,
  surface: string,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(nonSubstrateSkip(agentId, surface)), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function resolveScopeAgentId(row: {
  agent_id?: string | null;
  primary_agent_id?: string | null;
}): string {
  return normalizeAgentId(row.agent_id || row.primary_agent_id || "luca");
}

export async function loadActiveAgentScopes(
  supabase: any,
  sinceIso: string,
): Promise<AgentScope[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("user_id, agent_id, primary_agent_id")
    .gte("updated_at", sinceIso);

  if (error) {
    console.warn("[agent-scope] failed to load active scopes:", error.message);
    return [];
  }

  const candidateScopes = [...new Map((data || []).map((row: {
    user_id: string;
    agent_id?: string | null;
    primary_agent_id?: string | null;
  }) => {
    const agentId = resolveScopeAgentId(row);
    return [`${row.user_id}:${agentId}`, { userId: row.user_id, agentId }];
  })).values()]
    .filter((scope) => isSubstrateAgentId((scope as AgentScope).agentId)) as AgentScope[];

  // BYOK gate: Mnemos + the autonomous loop are real agent processes, available
  // only to users who supplied their own API key. Keyless users get free-tier chat
  // (FREE_LUCA_MODEL) with NO memory/inner-life. Dropping their scopes here gates
  // every dispatcher that fans out from this list — anima-dispatch, anima-wander,
  // anima-heartbeat — in one place. (Keyed population mirrors mnemos_cohort().)
  const keyedScopes = await filterKeyedScopes(supabase, candidateScopes);

  return filterValidAgentScopes(supabase, keyedScopes);
}

// Keep only scopes whose user has a stored API key (BYOK). Fails CLOSED: if the
// lookup errors we skip the whole batch rather than risk running agent processes
// for keyless users.
async function filterKeyedScopes(
  supabase: any,
  scopes: AgentScope[],
): Promise<AgentScope[]> {
  const userIds = [...new Set(scopes.map((s) => s.userId))];
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("user_api_keys")
    .select("user_id")
    .in("user_id", userIds);
  if (error) {
    console.warn("[agent-scope] BYOK key-gate lookup failed; skipping batch:", error.message);
    return [];
  }
  const keyed = new Set((data || []).map((r: { user_id: string }) => r.user_id));
  return scopes.filter((s) => keyed.has(s.userId));
}

export async function filterValidAgentScopes(
  supabase: any,
  scopes: AgentScope[],
): Promise<AgentScope[]> {
  const normalized = scopes
    .map((scope) => ({
      userId: scope.userId,
      agentId: normalizeAgentId(scope.agentId),
    }))
    .filter((scope) => scope.userId && isSubstrateAgentId(scope.agentId));

  const lucaScopes = normalized.filter((scope) => scope.agentId === "luca");
  const customScopes = normalized.filter((scope) => scope.agentId !== "luca");
  if (customScopes.length === 0) return lucaScopes;

  const userIds = [...new Set(customScopes.map((scope) => scope.userId))];
  const agentIds = [...new Set(customScopes.map((scope) => scope.agentId))];
  const { data, error } = await supabase
    .from("agent_configs")
    .select("user_id, id")
    .in("user_id", userIds)
    .in("id", agentIds)
    .eq("pending", false);

  if (error) {
    console.warn("[agent-scope] failed to validate active custom scopes:", error.message);
    return lucaScopes;
  }

  const validCustom = new Set(
    (data || []).map((row: { user_id: string; id: string }) => `${row.user_id}:${normalizeAgentId(row.id)}`),
  );

  return [
    ...lucaScopes,
    ...customScopes.filter((scope) => validCustom.has(`${scope.userId}:${scope.agentId}`)),
  ];
}

export async function isValidAgentScope(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<boolean> {
  const filtered = await filterValidAgentScopes(supabase, [{ userId, agentId }]);
  return filtered.length > 0;
}

async function loadAgentPersonality(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<Record<string, unknown>> {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (normalizedAgentId === "luca") return { inner_life: true, proactive_autonomy: true };

  const { data } = await supabase
    .from("agent_configs")
    .select("personality")
    .eq("user_id", userId)
    .eq("id", normalizedAgentId)
    .maybeSingle();

  return (data?.personality || {}) as Record<string, unknown>;
}

export async function allowsInnerLifeAutonomy(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<boolean> {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (!isSubstrateAgentId(normalizedAgentId)) return false;
  if (normalizedAgentId === "luca") return true;

  if (!(await isValidAgentScope(supabase, userId, normalizedAgentId))) return false;

  const personality = await loadAgentPersonality(supabase, userId, normalizedAgentId);
  return personality.inner_life !== false;
}

export async function allowsProactiveAutonomy(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<boolean> {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (!isSubstrateAgentId(normalizedAgentId)) return false;
  if (normalizedAgentId === "luca") return true;

  if (!(await isValidAgentScope(supabase, userId, normalizedAgentId))) return false;

  const personality = await loadAgentPersonality(supabase, userId, normalizedAgentId);
  const autonomyRaw = personality.autonomy;
  const autonomy = (autonomyRaw && typeof autonomyRaw === "object" ? autonomyRaw : {}) as Record<string, unknown>;
  const innerLifeRaw = personality.inner_life;
  const innerLifeObj = (innerLifeRaw && typeof innerLifeRaw === "object" ? innerLifeRaw : {}) as Record<string, unknown>;

  // Explicit opt-out always wins.
  if (autonomy.proactive === false) return false;
  if (innerLifeObj.proactive === false) return false;
  if (personality.proactive_autonomy === false) return false;

  // Explicit opt-in.
  if (autonomy.proactive === true) return true;
  if (innerLifeObj.proactive === true) return true;
  if (personality.proactive_autonomy === true) return true;

  return false;
}

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

  return [...new Map((data || []).map((row: {
    user_id: string;
    agent_id?: string | null;
    primary_agent_id?: string | null;
  }) => {
    const agentId = resolveScopeAgentId(row);
    return [`${row.user_id}:${agentId}`, { userId: row.user_id, agentId }];
  })).values()].filter((scope) => isSubstrateAgentId((scope as AgentScope).agentId)) as AgentScope[];
}

export async function allowsProactiveAutonomy(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<boolean> {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (!isSubstrateAgentId(normalizedAgentId)) return false;
  if (normalizedAgentId === "luca") return true;

  const { data } = await supabase
    .from("agent_configs")
    .select("personality")
    .eq("user_id", userId)
    .eq("id", normalizedAgentId)
    .maybeSingle();

  const personality = (data?.personality || {}) as Record<string, unknown>;
  const autonomy = (personality.autonomy || {}) as Record<string, unknown>;
  const innerLife = (personality.inner_life || {}) as Record<string, unknown>;

  return autonomy.proactive === true
    || personality.proactive_autonomy === true
    || innerLife.proactive === true;
}

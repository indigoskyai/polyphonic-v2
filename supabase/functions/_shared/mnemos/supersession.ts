/**
 * Engram supersession on contradiction.
 *
 * When a new `contradicts` connection is written between two engrams,
 * the older one gets archived (state='archived') so retrieval doesn't
 * surface both contradicting engrams. Lean alternative to full bi-temporal
 * validity columns. See docs/memory/PLAN.md §6.
 *
 * Edge cases:
 *  - Mutual contradiction (very rare in practice): if both engrams contradict
 *    each other in opposite directions, both end up archived. Survivor will
 *    be whichever Mnemos's next consolidation cycle re-encodes from current
 *    conversation context. The user can also pin the surviving belief via
 *    memory candidates if they care.
 *  - If the older engram is part of a belief's supporting_engram_ids, the
 *    next consolidate cycle naturally cleans up — no special-case here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any };
interface SupersessionScope {
  userId?: string;
  agentId?: string;
}

/**
 * If the given connection is a 'contradicts' edge, archive the older of the
 * two engrams. No-op for any other connection type.
 *
 * Idempotent — safe to call repeatedly. Returns the archived engram id, or
 * null if nothing was archived.
 */
export async function applySupersession(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
  connectionType: string,
  scope: SupersessionScope = {},
): Promise<string | null> {
  if (connectionType !== "contradicts") return null;
  if (!sourceId || !targetId || sourceId === targetId) return null;

  try {
    let query = supabase
      .from("engrams")
      .select("id, user_id, agent_id, created_at, state")
      .in("id", [sourceId, targetId])
      .limit(2);
    if (scope.userId) query = query.eq("user_id", scope.userId);
    if (scope.agentId) query = query.eq("agent_id", scope.agentId);

    const { data, error } = await query;
    if (error) {
      console.warn("[supersession] fetch failed:", error.message);
      return null;
    }
    if (!data || data.length < 2) return null;

    const a = data[0];
    const b = data[1];

    // Skip if either is already archived — supersession already happened.
    if (a.state === "archived" || b.state === "archived") return null;

    // Never let a contradiction edge archive across account or agent boundaries.
    if (a.user_id !== b.user_id || a.agent_id !== b.agent_id) return null;

    const aTs = new Date(a.created_at).getTime();
    const bTs = new Date(b.created_at).getTime();
    // Older = lower created_at. If timestamps tie, archive the source by convention.
    const olderId = aTs < bTs ? a.id : (bTs < aTs ? b.id : sourceId);

    const { error: updErr } = await supabase
      .from("engrams")
      .update({ state: "archived", updated_at: new Date().toISOString() })
      .eq("id", olderId)
      .eq("user_id", a.user_id)
      .eq("agent_id", a.agent_id);
    if (updErr) {
      console.warn("[supersession] archive failed:", updErr.message);
      return null;
    }

    return olderId;
  } catch (err) {
    console.warn("[supersession] error:", (err as Error).message);
    return null;
  }
}

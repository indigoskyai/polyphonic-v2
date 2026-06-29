// Phase L10 (gap fix): mnemos-consolidate → proactive-engagement bridge.
//
// Pure helpers extracted from mnemos-consolidate so the noteworthy threshold
// and summary text are unit-testable. The actual dispatch happens inside the
// edge function so we don't pull the proactive-engagement module into Vitest.

export interface ConsolidationCounts {
  promotions?: number;
  memory_candidates_created?: number;
  new_connections?: number;
  beliefs_updated?: number;
  strengthened?: number;
  insights?: {
    promoted_engrams?: Array<{ content?: string | null }>;
    longstanding_connections?: Array<{
      source_content?: string | null;
      target_content?: string | null;
      connection_type?: string | null;
      shared_tags?: string[] | null;
    }>;
    surfaced_beliefs?: Array<{
      content?: string | null;
      active?: boolean | null;
      action?: string | null;
      reason?: string | null;
    }>;
  };
}

function compactPhrase(value: string | null | undefined, wordLimit = 14): string {
  const words = (value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= wordLimit) return words.join(" ");
  return `${words.slice(0, wordLimit).join(" ")}...`;
}

function promotedDetail(result: ConsolidationCounts): string | null {
  const content = result.insights?.promoted_engrams?.find((item) => item.content)?.content;
  const phrase = compactPhrase(content);
  return phrase ? ` around "${phrase}"` : null;
}

function connectionDetail(result: ConsolidationCounts): string | null {
  const conn = result.insights?.longstanding_connections?.find((item) => item.source_content && item.target_content);
  if (!conn) return null;
  const source = compactPhrase(conn.source_content, 9);
  const target = compactPhrase(conn.target_content, 9);
  if (!source || !target) return null;
  const type = conn.connection_type ? String(conn.connection_type).replace(/_/g, " ") : "connection";
  const tag = Array.isArray(conn.shared_tags) && conn.shared_tags.length > 0 ? ` (${conn.shared_tags[0]})` : "";
  return `: ${type}${tag} between "${source}" and "${target}"`;
}

function beliefDetail(result: ConsolidationCounts): string | null {
  const belief = result.insights?.surfaced_beliefs?.find((item) => item.content && item.active !== false)
    || result.insights?.surfaced_beliefs?.find((item) => item.content);
  const phrase = compactPhrase(belief?.content);
  return phrase ? `: "${phrase}"` : null;
}

/**
 * Returns true when consolidation produced something worth flagging:
 *   - at least one episodic→semantic promotion, OR
 *   - three or more new connections, OR
 *   - two or more beliefs updated.
 *
 * Below this threshold the cycle is background hygiene; surfacing every
 * tick would breach the daily/hourly pacing caps without telling the user
 * anything.
 */
export function consolidationIsNoteworthy(result: ConsolidationCounts | null | undefined): boolean {
  if (!result) return false;
  if (Number(result.promotions ?? 0) >= 1) return true;
  if (Number(result.memory_candidates_created ?? 0) >= 1) return true;
  if (Number(result.new_connections ?? 0) >= 3) return true;
  if (Number(result.beliefs_updated ?? 0) >= 2) return true;
  return false;
}

/** Plain-language summary in Luca's voice. Uses grounded insight details when present. */
export function formatConsolidationSummary(result: ConsolidationCounts): string {
  const promotions = Number(result.promotions ?? 0);
  const memoryCandidates = Number(result.memory_candidates_created ?? 0);
  const newConnections = Number(result.new_connections ?? 0);
  const beliefsUpdated = Number(result.beliefs_updated ?? 0);
  const strengthened = Number(result.strengthened ?? 0);

  const parts: string[] = [];
  if (promotions > 0) parts.push(`${promotions} memor${promotions === 1 ? "y" : "ies"} settled into a pattern${promotedDetail(result) || ""}`);
  if (memoryCandidates > 0) parts.push(`${memoryCandidates} durable candidate${memoryCandidates === 1 ? "" : "s"} surfaced for review`);
  if (newConnections > 0) parts.push(`${newConnections} new connection${newConnections === 1 ? "" : "s"} between things you've said${connectionDetail(result) || ""}`);
  if (beliefsUpdated > 0) parts.push(`${beliefsUpdated} belief${beliefsUpdated === 1 ? "" : "s"} updated${beliefDetail(result) || ""}`);
  if (parts.length === 0 && strengthened > 0) {
    parts.push(`${strengthened} memor${strengthened === 1 ? "y" : "ies"} reinforced`);
  }

  return parts.length > 0 ? parts.join(", ") : "Background reflection finished.";
}

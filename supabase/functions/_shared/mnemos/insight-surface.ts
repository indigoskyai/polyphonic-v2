// Phase L10 (gap fix): mnemos-consolidate → proactive-engagement bridge.
//
// Pure helpers extracted from mnemos-consolidate so the noteworthy threshold
// and summary text are unit-testable. The actual dispatch happens inside the
// edge function so we don't pull the proactive-engagement module into Vitest.

export interface ConsolidationCounts {
  promotions?: number;
  new_connections?: number;
  beliefs_updated?: number;
  strengthened?: number;
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
  if (Number(result.new_connections ?? 0) >= 3) return true;
  if (Number(result.beliefs_updated ?? 0) >= 2) return true;
  return false;
}

/** Plain-language summary in Luca's voice — counts only, no fabricated content. */
export function formatConsolidationSummary(result: ConsolidationCounts): string {
  const promotions = Number(result.promotions ?? 0);
  const newConnections = Number(result.new_connections ?? 0);
  const beliefsUpdated = Number(result.beliefs_updated ?? 0);
  const strengthened = Number(result.strengthened ?? 0);

  const parts: string[] = [];
  if (promotions > 0) parts.push(`${promotions} memor${promotions === 1 ? "y" : "ies"} settled into a pattern`);
  if (newConnections > 0) parts.push(`${newConnections} new connection${newConnections === 1 ? "" : "s"} between things you've said`);
  if (beliefsUpdated > 0) parts.push(`${beliefsUpdated} belief${beliefsUpdated === 1 ? "" : "s"} updated`);
  if (parts.length === 0 && strengthened > 0) {
    parts.push(`${strengthened} memor${strengthened === 1 ? "y" : "ies"} reinforced`);
  }

  return parts.length > 0 ? parts.join(", ") : "Background reflection finished.";
}

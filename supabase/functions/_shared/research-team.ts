export const RESEARCH_TEAM_LABEL = "Research Team";

export function looksLikeResearchTeamRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  return (
    /\bresearch[-\s]?team\b/.test(normalized) ||
    /\bteam\s+of\s+(researchers|analysts|investigators|scientists)\b/.test(normalized) ||
    /\b(deep|serious|multi[-\s]?role|multi[-\s]?agent)\s+research\b.{0,60}\b(team|run|pass|mode)\b/.test(normalized) ||
    /\b(scout|methodologist|skeptic|synthesist)\b.{0,120}\b(research|investigat|study|analy[sz]e)\b/.test(normalized) ||
    /\b(research|investigat|study|analy[sz]e)\b.{0,120}\b(scout|methodologist|skeptic|synthesist)\b/.test(normalized)
  );
}

export function looksLikeComplexResearchNeed(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const researchDomain =
    /\b(literature\s+review|evidence\s+review|source\s+synthesis|claim\s+test|truth\s+card|the\s+well|simulation\s+evidence|dataset\s+grounding|methodology|systematic|meta[-\s]?analysis|replication|causal|benchmark|provenance)\b/.test(normalized);
  const asksForJudgment =
    /\b(evaluate|ground|verify|audit|compare|synthesize|rank|check|test|prove|disprove|what\s+does\s+the\s+data\s+say)\b/.test(normalized);
  const substantial =
    normalized.length > 160 || /\b(sources|citations|papers|datasets|measurements|caveats|limitations|confounders)\b/.test(normalized);
  return researchDomain && (asksForJudgment || substantial);
}

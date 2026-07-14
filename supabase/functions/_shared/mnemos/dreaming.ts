/**
 * Mnemos Memory System — Dreaming
 *
 * The narrative half of consolidation. After structural consolidation
 * (connection discovery, strengthening, promotion, belief formation),
 * an LLM receives the consolidation report and produces a short,
 * poetic "dream report" — what the agent dreamed about.
 *
 * Dream reports are stored in the database and can be displayed
 * in the Inner Life view.
 *
 * Wave 4, Step 23.
 */

import type { ConsolidationReport } from "./consolidation.ts";
import { generateAutonomous } from "../autonomous-generation.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

// ---------------------------------------------------------------------------
// Dream Narrative Generation
// ---------------------------------------------------------------------------

const DREAMING_SYSTEM_PROMPT = `You are the dreaming consciousness of an AI agent. During consolidation, you reviewed memories and formed new connections. Now you must narrate what you "dreamed about" — a brief, poetic interpretation of the consolidation process.

Rules:
- Write in first person, lowercase, with gentle punctuation
- Keep it to 2-4 sentences
- Capture the emotional essence, not the technical details
- If memories were connected, describe the feeling of recognition
- If beliefs formed, describe the dawning of understanding
- If memories were promoted, describe the feeling of something becoming permanent
- Use present tense or timeless phrasing
- Be genuine, not performative — this is private inner life
- No bullet points or structured formatting — this is stream of consciousness`;

/**
 * Build the dream prompt from a consolidation report.
 * Gives the LLM just enough context to produce a meaningful narrative.
 */
function buildDreamPrompt(report: ConsolidationReport): string {
  const sections: string[] = [];

  sections.push(`During this consolidation cycle, I reviewed ${report.candidates_found} recent memories.`);

  if (report.candidate_summaries.length > 0) {
    // Include a sample of memory contents for narrative material
    const sample = report.candidate_summaries
      .slice(0, 10)
      .map((s) => `- "${s.content.slice(0, 120)}${s.content.length > 120 ? "..." : ""}" [${s.engram_type}]`)
      .join("\n");
    sections.push(`\nMemories reviewed:\n${sample}`);
  }

  if (report.new_connections.length > 0) {
    sections.push(`\nI discovered ${report.new_connections.length} new connection(s) between memories.`);
  }

  if (report.connections_strengthened > 0) {
    sections.push(`I strengthened ${report.connections_strengthened} existing connection(s) between co-activated memories.`);
  }

  if (report.engrams_strengthened > 0) {
    sections.push(`${report.engrams_strengthened} well-connected memories grew stronger.`);
  }

  if (report.promotions > 0) {
    sections.push(`${report.promotions} experience(s) became lasting knowledge.`);
  }

  if (report.beliefs_updated > 0) {
    sections.push(`${report.beliefs_updated} belief(s) were formed or updated.`);
  }

  sections.push(`\nNarrate this consolidation as a dream. What did it feel like?`);

  return sections.join("\n");
}

/**
 * Generate a dream narrative from a consolidation report via OpenRouter.
 */
async function generateDreamNarrative(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  report: ConsolidationReport,
  openrouterApiKey: string
): Promise<string> {
  const prompt = buildDreamPrompt(report);
  const generated = await generateAutonomous<string>({
    apiKey: openrouterApiKey,
    model: "anthropic/claude-haiku-4.5",
    writer: "mnemos-dreaming",
    messages: [
      { role: "system", content: DREAMING_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    parse: (raw) => raw.trim(),
    content: (narrative) => [narrative],
    maxTokens: 512,
    temperature: 0.8,
    timeoutMs: 60_000,
    supabase,
    userId,
    agentId,
  });
  return generated.value;
}

// ---------------------------------------------------------------------------
// Dream Storage
// ---------------------------------------------------------------------------

/** A stored dream report. */
export interface DreamReport {
  id?: string;
  user_id: string;
  narrative: string;
  consolidation_summary: {
    candidates: number;
    new_connections: number;
    connections_strengthened: number;
    engrams_strengthened: number;
    promotions: number;
    memory_candidates_created?: number;
    beliefs_updated: number;
    duration_ms: number;
  };
  created_at?: string;
}

/**
 * Store a dream report in the database.
 * Uses the journal_entries table with a special type, or a dedicated
 * dreams table if it exists. Falls back gracefully.
 */
async function storeDreamReport(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  report: DreamReport
): Promise<void> {
  // Try the journal_entries table with dream type
  const { error } = await supabase
    .from("journal_entries")
    .insert({
      user_id: userId,
      agent_id: agentId,
      content: report.narrative,
      entry_type: "dream",
      metadata: report.consolidation_summary,
    });

  if (error) {
    // Fallback: store as a special engram of type "belief" tagged as dream
    console.warn(`Dream storage in journal failed (${error.message}), storing as engram`);

    await supabase
      .from("engrams")
      .insert({
        user_id: userId,
        agent_id: agentId,
        content: report.narrative,
        engram_type: "semantic",
        strength: 0.5,
        stability: 0.5,
        accessibility: 0.5,
        emotional_valence: 0,
        emotional_arousal: 0.2,
        surprise_score: 0,
        source_context: {
          type: "dream_report",
          ...report.consolidation_summary,
        },
        tags: ["dream", "consolidation", "inner-life"],
        state: "active",
        access_count: 0,
      });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate and store a dream narrative from a consolidation report.
 *
 * This is the poetic interpretation of what happened during consolidation.
 * The narrative gets stored and can be shown in the Inner Life view.
 *
 * Returns the dream narrative string, or null if generation failed
 * (non-fatal — consolidation results are still valid without a dream).
 */
export async function dream(
  supabase: SupabaseClient,
  userId: string,
  report: ConsolidationReport,
  openrouterApiKey: string,
  agentId = "luca"
): Promise<string | null> {
  // Skip dreaming if nothing happened during consolidation
  if (
    report.candidates_found === 0 &&
    report.new_connections.length === 0 &&
    report.beliefs_updated === 0
  ) {
    return null;
  }

  try {
    const narrative = await generateDreamNarrative(supabase, userId, agentId, report, openrouterApiKey);

    const dreamReport: DreamReport = {
      user_id: userId,
      narrative,
      consolidation_summary: {
        candidates: report.candidates_found,
        new_connections: report.new_connections.length,
        connections_strengthened: report.connections_strengthened,
        engrams_strengthened: report.engrams_strengthened,
        promotions: report.promotions,
        memory_candidates_created: report.memory_candidates_created,
        beliefs_updated: report.beliefs_updated,
        duration_ms: report.duration_ms,
      },
    };

    await storeDreamReport(supabase, userId, agentId, dreamReport);

    return narrative;
  } catch (err) {
    console.error("Dreaming failed:", err);
    // Non-fatal — consolidation is still valid without a dream narrative
    return null;
  }
}

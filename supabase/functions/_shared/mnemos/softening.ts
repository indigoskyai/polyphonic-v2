/**
 * Mnemos Memory System — Softening (Lossy Compression)
 *
 * When an engram's strength drops below the softening threshold but it
 * still has meaningful connections, an LLM compresses it to its essence.
 * The memory becomes vaguer but retains its structural role in the graph.
 *
 * This is biological: old memories lose detail but keep core meaning.
 */

import type { Engram } from "./types.ts";
import { generateAutonomous } from "../autonomous-generation.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

/** Strength below which an engram is eligible for softening. */
const SOFTENING_STRENGTH_THRESHOLD = 0.3;

/** Minimum connections for an engram to be worth softening (vs. just decaying). */
const SOFTENING_MIN_CONNECTIONS = 2;

/** Max engrams to soften per cycle to manage LLM costs. */
const SOFTENING_BATCH_LIMIT = 10;

/** The system prompt for the softening LLM call. */
const SOFTENING_SYSTEM_PROMPT = `You are Luca's memory conservator. Your job is to propose a softer version of an old, connected memory while preserving the personhood, evidence, uncertainty, and voice that make it useful.

Rules:
- Output ONLY the proposed softened memory, nothing else.
- Preserve core meaning, emotional weight, named relationships, stable preferences, and commitments.
- Preserve uncertainty. Never turn "may", "seems", or "might" into certainty.
- Do not flatten the user into a generic summary.
- Do not erase provenance-bearing facts unless they are tangential.
- Keep it to 1-2 sentences maximum.
- If the memory contains a belief, boundary, promise, or principle, preserve it exactly enough to remain reviewable.
- If the memory is already concise, return it unchanged.`;

/**
 * Result of a softening operation on a single engram.
 */
export interface SofteningResult {
  engram_id: string;
  original_content: string;
  softened_content: string;
  original_hash: string;
  dry_run: boolean;
  proposal_id?: string;
  applied: boolean;
  validator_result: SofteningValidation;
}

export interface SofteningValidation {
  valid: boolean;
  reasons: string[];
}

export interface SofteningOptions {
  dryRun?: boolean;
  model?: string;
}

/**
 * Simple hash for audit trail — not cryptographic, just a fingerprint.
 */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Find engrams eligible for softening: low strength but still connected.
 */
async function findSofteningCandidates(
  supabase: SupabaseClient,
  userId: string,
  agentId = "luca",
): Promise<Engram[]> {
  // Get low-strength active engrams
  const { data: candidates, error } = await supabase
    .from("engrams")
    .select("*")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("state", ["active", "consolidating"])
    .lt("strength", SOFTENING_STRENGTH_THRESHOLD)
    .order("strength", { ascending: true })
    .limit(SOFTENING_BATCH_LIMIT * 2); // Over-fetch to filter by connections

  if (error) {
    throw new Error(`Softening: failed to fetch candidates — ${error.message}`);
  }

  if (!candidates || candidates.length === 0) return [];

  // Filter to engrams with enough connections to be worth preserving
  const eligible: Engram[] = [];

  for (const engram of candidates) {
    const { count, error: countError } = await supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .or(`source_id.eq.${engram.id},target_id.eq.${engram.id}`);

    if (countError) {
      console.error(`Softening: connection count failed for ${engram.id} — ${countError.message}`);
      continue;
    }

    if ((count ?? 0) >= SOFTENING_MIN_CONNECTIONS) {
      eligible.push(engram);
    }

    if (eligible.length >= SOFTENING_BATCH_LIMIT) break;
  }

  return eligible;
}

/**
 * Compress an engram's content via OpenRouter LLM call.
 */
async function compressContent(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  content: string,
  openrouterApiKey: string,
  model = "anthropic/claude-haiku-4.5",
): Promise<string> {
  const generated = await generateAutonomous<string>({
    apiKey: openrouterApiKey,
    model,
    writer: "mnemos-softening",
    messages: [
      { role: "system", content: SOFTENING_SYSTEM_PROMPT },
      { role: "user", content: `Compress this memory to its essence:\n\n${content}` },
    ],
    parse: (raw) => raw.trim(),
    content: (compressed) => [compressed],
    maxTokens: 512,
    temperature: 0.3,
    timeoutMs: 60_000,
    supabase,
    userId,
    agentId,
  });
  return generated.value;
}

function contentWords(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) ?? [])
    .filter((word) => !["that", "this", "with", "from", "have", "they", "them", "user", "assistant", "memory"].includes(word)));
}

function preservesUncertainty(original: string, softened: string): boolean {
  const uncertain = /\b(may|might|could|seems|seemed|appears|appeared|possibly|probably|maybe|unclear|uncertain)\b/i.test(original);
  const absolute = /\b(always|never|definitely|certainly|proved|proves|must)\b/i.test(softened);
  return !uncertain || !absolute;
}

export function validateSofteningProposal(original: string, softened: string): SofteningValidation {
  const reasons: string[] = [];
  const proposed = softened.trim();
  if (!proposed) reasons.push("empty_proposal");
  if (proposed.length >= original.trim().length) reasons.push("not_shorter");
  if (proposed.length < 30) reasons.push("too_short");
  if (!preservesUncertainty(original, proposed)) reasons.push("certainty_inflation");
  if (/\b(the user had an? (important|meaningful) experience|something happened|important things?)\b/i.test(proposed)) {
    reasons.push("generic_flattening");
  }

  const originalWords = contentWords(original);
  const proposedWords = contentWords(proposed);
  if (originalWords.size >= 6) {
    let overlap = 0;
    for (const word of proposedWords) {
      if (originalWords.has(word)) overlap++;
    }
    if (overlap / Math.max(1, Math.min(originalWords.size, proposedWords.size)) < 0.25) {
      reasons.push("low_content_overlap");
    }
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Run the softening cycle: find low-strength but connected engrams,
 * compress their content via LLM, and update them in place.
 *
 * The original content hash is stored in source_context for audit.
 */
export async function runSofteningCycle(
  supabase: SupabaseClient,
  userId: string,
  openrouterApiKey: string,
  agentId = "luca",
  options: SofteningOptions = {},
): Promise<SofteningResult[]> {
  const candidates = await findSofteningCandidates(supabase, userId, agentId);

  if (candidates.length === 0) return [];

  const results: SofteningResult[] = [];

  for (const engram of candidates) {
    // Skip if already softened (has a softening hash in source_context)
    if (engram.source_context?.softened_from_hash) continue;

    try {
      const originalHash = simpleHash(engram.content);
      const model = options.model ?? "anthropic/claude-haiku-4.5";
      const softened = await compressContent(supabase, userId, agentId, engram.content, openrouterApiKey, model);
      const validator = validateSofteningProposal(engram.content, softened);

      // Don't "soften" if the LLM returned something longer
      if (!validator.valid) {
        const { data: proposal } = await supabase
          .from("mnemos_softening_proposals")
          .insert({
            user_id: userId,
            agent_id: agentId,
            engram_id: engram.id,
            original_content: engram.content,
            proposed_content: softened,
            original_hash: originalHash,
            reason: "validator rejected proposal",
            validator_result: validator,
            model,
            dry_run: true,
            status: "rejected",
            rejected_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();
        results.push({
          engram_id: engram.id,
          original_content: engram.content,
          softened_content: softened,
          original_hash: originalHash,
          dry_run: true,
          proposal_id: proposal?.id,
          applied: false,
          validator_result: validator,
        });
        continue;
      }

      const dryRun = options.dryRun !== false;
      const { data: proposal, error: proposalError } = await supabase
        .from("mnemos_softening_proposals")
        .insert({
          user_id: userId,
          agent_id: agentId,
          engram_id: engram.id,
          original_content: engram.content,
          proposed_content: softened,
          original_hash: originalHash,
          reason: "low-strength connected engram eligible for softening",
          validator_result: validator,
          model,
          dry_run: dryRun,
          status: dryRun ? "proposed" : "applied",
          applied_at: dryRun ? null : new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (proposalError) {
        console.error(`Softening: failed to record proposal for ${engram.id} — ${proposalError.message}`);
        continue;
      }

      if (dryRun) {
        await supabase.from("continuity_events").insert({
          user_id: userId,
          agent_id: agentId,
          event_type: "softening_proposed",
          subject_type: "engram",
          subject_id: engram.id,
          metadata: { proposal_id: proposal?.id ?? null, original_hash: originalHash },
        });
        results.push({
          engram_id: engram.id,
          original_content: engram.content,
          softened_content: softened,
          original_hash: originalHash,
          dry_run: true,
          proposal_id: proposal?.id,
          applied: false,
          validator_result: validator,
        });
        continue;
      }

      const { error: updateError } = await supabase
        .from("engrams")
        .update({
          content: softened,
          content_integrity_status: "valid",
          content_integrity_reason: null,
          content_hidden_at: null,
          source_context: {
            ...engram.source_context,
            softened_from_hash: originalHash,
            softened_at: new Date().toISOString(),
            softening_proposal_id: proposal?.id ?? null,
            original_length: engram.content.length,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", engram.id)
        .eq("agent_id", agentId);

      if (updateError) {
        console.error(`Softening: failed to update engram ${engram.id} — ${updateError.message}`);
        continue;
      }

      results.push({
        engram_id: engram.id,
        original_content: engram.content,
        softened_content: softened,
        original_hash: originalHash,
        dry_run: false,
        proposal_id: proposal?.id,
        applied: true,
        validator_result: validator,
      });
      await supabase.from("continuity_events").insert({
        user_id: userId,
        agent_id: agentId,
        event_type: "softening_applied",
        subject_type: "engram",
        subject_id: engram.id,
        metadata: { proposal_id: proposal?.id ?? null, original_hash: originalHash },
      });
    } catch (err) {
      console.error(`Softening: LLM compression failed for engram ${engram.id} —`, err);
      // Continue with other engrams — one failure shouldn't stop the batch
    }
  }

  return results;
}

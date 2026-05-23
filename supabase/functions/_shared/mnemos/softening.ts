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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };

/** Strength below which an engram is eligible for softening. */
const SOFTENING_STRENGTH_THRESHOLD = 0.3;

/** Minimum connections for an engram to be worth softening (vs. just decaying). */
const SOFTENING_MIN_CONNECTIONS = 2;

/** Max engrams to soften per cycle to manage LLM costs. */
const SOFTENING_BATCH_LIMIT = 10;

/** The system prompt for the softening LLM call. */
const SOFTENING_SYSTEM_PROMPT = `You are a memory compression system. Your job is to take a detailed memory and compress it to its absolute essence — the core meaning, stripped of all unnecessary detail.

Rules:
- Output ONLY the compressed memory, nothing else
- Preserve the core meaning and any emotional weight
- Remove temporal details, specific numbers, and tangential context
- Keep it to 1-2 sentences maximum
- If the memory contains a belief or principle, preserve that exactly
- If the memory is already concise, return it unchanged`;

/**
 * Result of a softening operation on a single engram.
 */
export interface SofteningResult {
  engram_id: string;
  original_content: string;
  softened_content: string;
  original_hash: string;
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
  content: string,
  openrouterApiKey: string
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4.5",
      messages: [
        { role: "system", content: SOFTENING_SYSTEM_PROMPT },
        { role: "user", content: `Compress this memory to its essence:\n\n${content}` },
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`Softening LLM call failed: ${response.status} ${response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenRouter response shape
  const data: any = await response.json();
  const compressed = data?.choices?.[0]?.message?.content?.trim();

  if (!compressed) {
    throw new Error("Softening LLM returned empty content");
  }

  return compressed;
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
): Promise<SofteningResult[]> {
  const candidates = await findSofteningCandidates(supabase, userId, agentId);

  if (candidates.length === 0) return [];

  const results: SofteningResult[] = [];

  for (const engram of candidates) {
    // Skip if already softened (has a softening hash in source_context)
    if (engram.source_context?.softened_from_hash) continue;

    try {
      const originalHash = simpleHash(engram.content);
      const softened = await compressContent(engram.content, openrouterApiKey);

      // Don't "soften" if the LLM returned something longer
      if (softened.length >= engram.content.length) continue;

      const { error: updateError } = await supabase
        .from("engrams")
        .update({
          content: softened,
          source_context: {
            ...engram.source_context,
            softened_from_hash: originalHash,
            softened_at: new Date().toISOString(),
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
      });
    } catch (err) {
      console.error(`Softening: LLM compression failed for engram ${engram.id} —`, err);
      // Continue with other engrams — one failure shouldn't stop the batch
    }
  }

  return results;
}

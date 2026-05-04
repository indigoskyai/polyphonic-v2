/**
 * Hypomnema layer — first-person interior-state memory.
 *
 * Per-agent, per-user. Always-loaded into system prompt assembly.
 * Sits between the Mnemos substrate and the active conversation.
 *
 * See docs/memory/PLAN.md sections 2–6 for the full design and
 * docs/memory/SEQUENCE.md for the implementation phases.
 *
 * Module layout (filled in across SEQUENCE phases):
 *   read.ts       — Phase 2: pre-turn always-load query
 *   write.ts      — Phase 3: post-turn reflection write
 *   decay.ts      — Phase 3: salience-floor decay
 *   challenge.ts  — Phase 6: daily belief-challenge cycle
 *   graduate.ts   — Phase 6: sustained-attention graduation to engrams
 *   prompts/*.md  — runtime-loadable prompt strings
 */

export { loadPrompt, type PromptName } from "./prompts.ts";
export { loadHypomnema, type LoadHypomnemaResult } from "./read.ts";
export {
  runSalienceGate,
  writeHypomnemaEntry,
  type GateInput,
  type GateResult,
  type WriteInput,
  type WriteResult,
} from "./write.ts";
export { decayAllActiveEntries, computeDecayedSalience, type DecayResult } from "./decay.ts";
export { graduateAllEligible, computeGraduationScore, type GraduationResult } from "./graduate.ts";
export { challengeAllStaleEntries, type ChallengeResult } from "./challenge.ts";

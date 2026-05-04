/**
 * Shared backend feature-flag helpers.
 *
 * Memory augmentation rollout: env-var-only, no schema. Two knobs:
 *
 *   MEMORY_AUGMENTATION_ENABLED          "true" | "false"  (global default; default false)
 *   MEMORY_AUGMENTATION_USER_ALLOWLIST   comma-separated UUIDs (explicit per-user opt-in)
 *
 * If the global flag is true, the feature is on for everyone.
 * If the allowlist contains the user_id, the feature is on for that user
 * regardless of the global flag — used for piloting before global rollout.
 *
 * All write paths added by the memory augmentation (hypomnema gate/write/decay/challenge,
 * mnemos-graduate, supersession, embedding generation) check this and no-op when off.
 * Read paths (hypomnema injection, hybrid retrieval) stay enabled — empty data is safe.
 */

function parseBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function parseAllowlist(v: string | undefined): Set<string> {
  if (!v) return new Set();
  return new Set(
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Returns true if the memory-augmentation write paths should run for this user.
 *
 * @param userId - Optional user id. When omitted, only the global flag is consulted.
 *                 When provided, the per-user allowlist is checked first; if the user is
 *                 listed, returns true regardless of the global flag.
 */
export function isMemoryAugmentationEnabled(userId?: string | null): boolean {
  const allowlist = parseAllowlist(Deno.env.get("MEMORY_AUGMENTATION_USER_ALLOWLIST"));
  if (userId && allowlist.has(userId)) return true;
  return parseBool(Deno.env.get("MEMORY_AUGMENTATION_ENABLED"));
}

/**
 * Returns true if the memory-augmentation read paths (hypomnema injection,
 * hybrid retrieval) should be active. Currently identical to the write path
 * since empty/missing data is safe — kept as a separate helper so the contract
 * is explicit at every call site.
 */
export function isMemoryAugmentationReadEnabled(userId?: string | null): boolean {
  return isMemoryAugmentationEnabled(userId);
}

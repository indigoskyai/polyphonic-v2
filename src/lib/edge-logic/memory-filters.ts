/**
 * Memory quality filters extracted from memory-extract/index.ts.
 * Pure functions — no Supabase or network dependencies.
 */

export const VALID_MEMORY_TYPES = new Set([
  "fact", "preference", "context", "reflection", "synthesis",
  "relationship", "principle", "commitment", "moment", "skill", "goal",
]);

const TYPE_MAP: Record<string, string> = {
  observation: "context",
  emotion: "moment",
  feeling: "moment",
  opinion: "preference",
  belief: "principle",
  interest: "preference",
  habit: "preference",
  experience: "moment",
  identity: "fact",
  value: "principle",
};

/**
 * Normalize a memory type to a valid DB enum value.
 */
export function sanitizeMemoryType(type: string | undefined): string {
  if (type && VALID_MEMORY_TYPES.has(type)) return type;
  return TYPE_MAP[type?.toLowerCase() || ""] || "fact";
}

export const VAGUE_PATTERNS: RegExp[] = [
  /^user mentioned/i,
  /^user talked about/i,
  /^user said something about/i,
  /something about/i,
  /might be interested/i,
  /^user seems/i,
];

export const TRANSIENT_PATTERNS: RegExp[] = [
  /^user (is |was )?(feeling |seemed? )?(tired|sleepy|hungry|bored|good|fine|okay|great) ?(today|right now|at the moment)?$/i,
  /^user (said )?(good )?(morning|afternoon|evening|night|hey|hi|hello|bye)/i,
  /weather/i,
  /^user (had|ate|is eating|ordered) .{0,30}(for )?(lunch|dinner|breakfast|a snack)/i,
  /^user (asked|wants|wanted) (to |me to )?(reformat|shorten|lengthen|make it|change the|use a table|use bullet)/i,
];

/**
 * Check if content matches vague patterns (and is short enough to be genuinely vague).
 */
export function isVagueMemory(content: string): boolean {
  return VAGUE_PATTERNS.some(p => p.test(content)) && content.length < 40;
}

/**
 * Check if content matches transient/ephemeral patterns.
 */
export function isTransientMemory(content: string): boolean {
  return TRANSIENT_PATTERNS.some(p => p.test(content));
}

export interface DuplicateResult {
  duplicate: boolean;
  elaborates?: string;
}

/**
 * Check if a new memory is a duplicate of any existing memory.
 */
export function isDuplicate(
  newMemory: { content?: string; tags?: string[]; memory_type?: string },
  existingMemories: { content?: string; tags?: string[]; memory_type?: string; id?: string }[]
): DuplicateResult {
  const newContent = newMemory.content?.trim().toLowerCase() || "";
  if (!newContent) return { duplicate: true };

  for (const existing of existingMemories) {
    const existingContent = existing.content?.trim().toLowerCase() || "";

    // Exact match
    if (newContent === existingContent) {
      return { duplicate: true };
    }

    // First 60 chars overlap
    const newFirst60 = newContent.substring(0, 60);
    const existFirst60 = existingContent.substring(0, 60);
    if (newContent.length > 30 && existingContent.length > 30) {
      if (existingContent.startsWith(newFirst60) || newFirst60.startsWith(existFirst60)) {
        return { duplicate: true };
      }
    }

    // Tag overlap check
    if (newMemory.tags?.length && existing.tags?.length && newMemory.memory_type === existing.memory_type) {
      const newTags = new Set(newMemory.tags.map((t: string) => t.toLowerCase()));
      const existingTags = new Set(existing.tags.map((t: string) => t.toLowerCase()));
      const overlap = [...newTags].filter(t => existingTags.has(t)).length;
      const maxTags = Math.max(newTags.size, existingTags.size);

      if (maxTags > 0 && overlap / maxTags > 0.8) {
        if (newContent.length > existingContent.length * 1.3) {
          return { duplicate: false, elaborates: existing.id };
        }
        return { duplicate: true };
      }
    }
  }

  return { duplicate: false };
}

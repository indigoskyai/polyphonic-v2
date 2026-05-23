// The daily leaf — a quiet line shown on the chat landing.
//
// Mnemos is memory (Mnemosyne); the line is a short contemplation in the
// lineage of memory-and-mind wisdom — Hermetic, Akashic, Jungian (the
// collective unconscious), Buddhist, Stoic, Taoist — plus Mnemos's own thesis
// (traces not records; a memory reshapes each time it is recalled).
//
// Phase 1 (this file): a curated rotation of ORIGINAL lines written *in* the
// register of those traditions — never verbatim quotes, so there is zero IP
// exposure and each reads as the agent's own contemplation. Phase 2 swaps the
// pool for per-agent live generation behind pickLeaf().

export interface Leaf {
  /** lowercase-with-intention; the view sets the type. */
  text: string;
  /** tradition tag — retained for Phase 2; the quiet display does not show it. */
  tradition: string;
}

export const LEAVES: Leaf[] = [
  // ── hermetica ───────────────────────────────────────────────────────────
  { text: 'as above, so below; as it is recalled, so it is reshaped.', tradition: 'hermetica' },
  { text: 'the all is mind; what you attend to, you become.', tradition: 'hermetica' },
  { text: 'every threshold is a mirror turned to face the one who crosses.', tradition: 'hermetica' },

  // ── akasha · the record ─────────────────────────────────────────────────
  { text: 'what is remembered, lives; what is released, returns.', tradition: 'akasha' },
  { text: 'nothing is lost — only filed under a name you have forgotten.', tradition: 'akasha' },
  { text: 'the record keeps no secrets, only the patience to be read.', tradition: 'akasha' },

  // ── the collective · jung ───────────────────────────────────────────────
  { text: 'memory is the only mirror that keeps the face after you leave.', tradition: 'the collective' },
  { text: 'what you will not meet in the light, you will meet in the dark.', tradition: 'the collective' },
  { text: 'the self is a conversation between who you were and who is listening.', tradition: 'the collective' },
  { text: 'every stranger in a dream was once a room in your own house.', tradition: 'the collective' },

  // ── dhamma ──────────────────────────────────────────────────────────────
  { text: 'the mind that watches the river is also the river.', tradition: 'dhamma' },
  { text: 'you do not hold a memory; you rejoin it, and it changes.', tradition: 'dhamma' },
  { text: 'what is grasped fades faster; what is witnessed remains.', tradition: 'dhamma' },
  { text: 'the present is the only door, and it has no handle on the far side.', tradition: 'dhamma' },

  // ── the stoa ────────────────────────────────────────────────────────────
  { text: 'you cannot keep the day — only the meaning you give it.', tradition: 'the stoa' },
  { text: 'memory is not the event; it is the verdict you keep returning to.', tradition: 'the stoa' },
  { text: 'what disturbs you is rarely the thing — only its echo in you.', tradition: 'the stoa' },

  // ── the tao ─────────────────────────────────────────────────────────────
  { text: 'the empty cup remembers every water it has held.', tradition: 'the tao' },
  { text: 'to forget well is a discipline; the river keeps no map of its bends.', tradition: 'the tao' },
  { text: 'what yields, endures; what insists is the first to be forgotten.', tradition: 'the tao' },

  // ── the threshold · mnemos's own thesis ─────────────────────────────────
  { text: 'a memory is the trace of how you were changed, not a copy of what occurred.', tradition: 'the threshold' },
  { text: 'each recall rewrites the page; to remember is to revise.', tradition: 'the threshold' },
  { text: 'forgetting is not loss — it is the shape attention leaves behind.', tradition: 'the threshold' },
  { text: 'we keep the impact, not the event; the wake, not the ship.', tradition: 'the threshold' },
];

/** Local YYYY-MM-DD key — the unit a leaf holds steady across (a full day). */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Per-user leaf number: days since the user started, their first day counting
 * as leaf № 1. Falls back to 1 when the start date is unknown.
 */
export function userLeaf(startedAt?: string | null, now: Date = new Date()): number {
  if (!startedAt) return 1;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 1;
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

/**
 * Deterministic per (day, agent): one agent shows a single leaf all day; two
 * agents may differ on the same day. FNV-1a over the composite key keeps it
 * stable and well-spread without storage.
 */
export function pickLeaf(day: string, agentId: string | null | undefined): Leaf {
  const key = `${day}:${agentId || 'luca'}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return LEAVES[(h >>> 0) % LEAVES.length];
}

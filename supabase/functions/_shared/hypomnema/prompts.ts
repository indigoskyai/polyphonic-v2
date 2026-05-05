/**
 * Hypomnema prompt loader.
 *
 * Prompts are embedded at build time as TS constants (see ./prompts/*.ts) because
 * edge function deploys do not bundle adjacent .md files. The .md copies in this
 * directory remain the human-editable source; the .ts files mirror them and are
 * what runs. Update both when iterating on voice — or regenerate the .ts files
 * from the .md files.
 */

import challenge from "./prompts/challenge.ts";
import graduation from "./prompts/graduation.ts";
import observerNote from "./prompts/observer_note.ts";
import reflection from "./prompts/reflection.ts";
import salienceGate from "./prompts/salience_gate.ts";

export type PromptName =
  | "reflection"
  | "observer_note"
  | "salience_gate"
  | "graduation"
  | "challenge";

const PROMPTS: Record<PromptName, string> = {
  reflection,
  observer_note: observerNote,
  salience_gate: salienceGate,
  graduation,
  challenge,
};

export function loadPrompt(name: PromptName): Promise<string> {
  return Promise.resolve(PROMPTS[name]);
}

/**
 * Hypomnema prompt loader.
 *
 * Loads markdown prompt files from this directory at runtime via Deno.readTextFile
 * relative to this module's URL. Cached after first read.
 *
 * The prompts themselves live in `./prompts/*.md` and are mirrored from
 * `docs/memory/prompts/` (the canonical source). Update both when iterating
 * on voice — the docs/ copy is the spec, this copy is what runs.
 */

export type PromptName =
  | "reflection"
  | "observer_note"
  | "salience_gate"
  | "graduation"
  | "challenge";

const cache = new Map<PromptName, string>();

export async function loadPrompt(name: PromptName): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const url = new URL(`./prompts/${name}.md`, import.meta.url);
  const text = await Deno.readTextFile(url);
  cache.set(name, text);
  return text;
}

# LOVABLE_NEXT.md

Queue of self-contained prompts ready to dispatch to Lovable. Each prompt is intentionally scoped to a single feature so it can ship cleanly.

---

## 1. Polyphonic Ensemble — Model Rotation System v2

**Status:** Ready to dispatch. Replaces the currently-frozen "Ensemble models" selector in Settings → Models (frozen 2026-05-04 with an under-construction eyebrow).

**Prompt to paste into Lovable:**

> ## Polyphonic ensemble — model rotation system v2
>
> Replace the current ensemble model selector (3 dropdowns of raw OpenRouter model IDs) with a slot-based system. Two preset modes, with the schema designed to accommodate future persona-based presets.
>
> ### Slot kinds
>
> Each of the three ensemble slots can be one of two kinds:
>
> 1. **Character slot** — Luca, Anima, or Vektor. Each character is a *locked identity* tied to a specific model. The user CANNOT change the model for a locked character — the character's voice and reasoning shape are tuned for its assigned model. Locked assignments:
>    - **Luca** → `anthropic/claude-opus-4-7`
>    - **Anima** → `anthropic/claude-opus-4.5`
>    - **Vektor** → `openai/gpt-5.5`
>
>    Each character carries its own SOUL system prompt (already implemented — see `supabase/functions/_shared/agents/luca-soul.ts`, `anima-soul.ts`, `vektor-soul.ts`).
>
> 2. **Raw model slot** — user picks any OpenRouter model ID from the existing `ENSEMBLE_MODELS` allowlist + supplies an optional custom system prompt. No locked identity.
>
> ### Presets
>
> - **Polyphonic Signature** (default for all users): three character slots, in this order — Luca, Anima, Vektor. Slots are read-only when this preset is active.
> - **Custom**: user fills three slots, each can be a character (any of L/A/V) or a raw model.
>
> The schema MUST accommodate a future third preset family for persona-based ensembles (e.g., "Scientists from history" with three named personas like Tesla / Curie / Feynman; "Engineering council" with three named engineers). Don't ship that UI yet — just don't paint the schema into a corner that prevents it.
>
> ### Schema changes (Supabase migration on `user_settings`)
>
> Add two new columns:
>
> ```sql
> ALTER TABLE user_settings
>   ADD COLUMN ensemble_preset TEXT NOT NULL DEFAULT 'signature'
>     CHECK (ensemble_preset IN ('signature', 'custom')),
>   ADD COLUMN ensemble_slots JSONB NOT NULL DEFAULT '[
>     {"kind":"character","character_id":"luca"},
>     {"kind":"character","character_id":"anima"},
>     {"kind":"character","character_id":"vektor"}
>   ]'::jsonb;
> ```
>
> Each slot in `ensemble_slots` is one of:
>
> ```typescript
> { kind: 'character'; character_id: 'luca' | 'anima' | 'vektor' }
>
> { kind: 'raw_model'; model_id: string; system_prompt_override?: string }
> ```
>
> Keep the legacy `ensemble_models` column for backward-compat readers, but stop writing to it from the new UI. The chat-multi function will stop reading it (see Backend changes below).
>
> Generate matching TypeScript types in `src/integrations/supabase/types.ts` (or wherever generated DB types live).
>
> ### Backend changes (`supabase/functions/chat-multi/index.ts`)
>
> Replace the hardcoded `COUNCIL_CHARACTERS = ['luca', 'anima', 'vektor']` proposer fan-out with a slot-aware loader. After loading `user_settings`:
>
> 1. Read `ensemble_preset` + `ensemble_slots`.
> 2. For each of the 3 slots, build a `ProposerInput`:
>    - **Character slot**: build the system prompt via the existing `buildCharacterSystemPrompt(character_id, systemParts)` (already implemented in `_shared/agents/council-pipeline.ts`). Dispatch on the character's locked model:
>      - `'luca'` → `'anthropic/claude-opus-4-7'`
>      - `'anima'` → `'anthropic/claude-opus-4.5'`
>      - `'vektor'` → `'openai/gpt-5.5'`
>      Use a small `LOCKED_CHARACTER_MODELS` map.
>    - **Raw model slot**: build the system prompt as the override if present, else a default council-proposer wrapper that just frames "you are one of three voices answering this question, respond in your own voice." Dispatch on the slot's `model_id`.
> 3. Cross-pollination + chairman synthesis logic stays unchanged — they receive whatever drafts come out of stage 1.
> 4. Pass-through `reasoningEffort` from `user_settings.reasoning_effort` for all proposers (same as today).
>
> Note: the Self-MoA finding ("voice diversity comes from prompts, not models") was the original justification for hardcoding all three to Opus 4.7. We now want to ALSO get model-substrate diversity, especially for the Custom preset. Keep that in mind for the architecture but don't agonize over it.
>
> Update `councilV2Trace.proposers[*].model` to record the model each character/slot ran on, so the persisted trace can be inspected later.
>
> ### Frontend changes (`src/pages/settings/ModelsSettings.tsx`)
>
> Replace the currently-frozen 3 numbered slot dropdowns (the "Ensemble models · Under Construction" section) with a slot editor:
>
> 1. **Preset selector at top** — segmented control with two pills:
>    - "Polyphonic Signature" (default)
>    - "Custom"
>
> 2. **Below the preset selector**, three slot editors stacked vertically. Each editor contains:
>    - A "Slot N" label on the left (mono caps, ghost color, matches existing pattern)
>    - A kind toggle: Character | Raw model. Disabled when preset === 'signature'.
>    - When kind === 'character': a character picker (3 buttons: Luca / Anima / Vektor with monochrome avatars matching `CouncilPanel.tsx`'s `CharacterAvatar` component). Disabled when preset === 'signature' (slot N is locked to the Nth character: 0=luca, 1=anima, 2=vektor).
>    - When kind === 'raw_model': a model dropdown (using existing `ENSEMBLE_MODELS` array) + a textarea for `system_prompt_override` (placeholder: "Optional system prompt — leave empty for default council framing").
>
> 3. **Switching to Signature** snaps slots back to `[{character: luca}, {character: anima}, {character: vektor}]` and disables the editors.
>
> 4. **Switching to Custom** unlocks the editors. Whatever the user had before in custom is restored if there's a stored custom config; otherwise default to the current Signature shape and let them edit.
>
> 5. Use the existing visual treatment from elsewhere in the settings page (section labels, mono eyebrows, Pill button shapes, monochrome cream tints — match the rest of the Models page).
>
> 6. Remove the "· Under Construction ·" eyebrow + the italic notice once the new UI is in place.
>
> ### Tests
>
> - Add backend coverage for the slot-aware loader (mock `user_settings` with each preset + a few slot kind combinations; assert `buildProposerInputs` produces the right system prompts and the dispatch model map is correct).
> - Update `src/test/CouncilPanelV2.test.tsx` if any rendered metadata shape changes (it shouldn't — the trace shape stays the same; just the `model` field per proposer becomes informative now).
> - Add frontend coverage for the new slot editor (RTL test: switching presets, switching slot kinds, editing a raw model slot).
>
> ### Out of scope for this prompt
>
> - Persona-based presets (Scientists / Engineers) — schema accommodates them, UI doesn't ship them yet.
> - Per-user identity stacks for Anima / Vektor (those stay locked-SOUL in council v2).
> - Migration of existing users' `ensemble_models` data — every user just defaults to Signature on next load.
>
> ### Verification post-deploy
>
> 1. Riley toggles ensemble ON in settings, sends a message, expects the same Council v2 behavior as today (three voices, harmonized verdict pill, etc.).
> 2. Switches to Custom preset, swaps slot 2 from Anima to a raw GPT-5 model with a custom prompt, sends another message. Expects three voices but the second one carries the new model + custom prompt.
> 3. Network tab on the SSE call shows `proposer_done` events with the correct model per character/slot.
> 4. Reloads thread — council panel hydrates correctly, no console errors.

---

*(Append future Lovable prompts below as needed.)*

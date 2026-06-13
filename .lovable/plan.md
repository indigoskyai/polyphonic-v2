
# Fix stale agent IDs + remaining memory/autonomy bugs

Karen's two custom agents have IDs frozen from their original names (`draft-agent`, `mnemos-companion`) even though she renamed them to `5.1` and `Gemini 3.1`. While digging in, I also found the real reason her custom agents "never get API calls between sessions": every proactive job (heartbeat, initiate, pulse) gates on `personality.autonomy.proactive`, and `CreateAgentModal` never sets that flag — so every custom agent on the platform is silently excluded from reflection, dreams, wander, and pulse.

## Part 1 — Karen's data: rename the two stale IDs

Migrate `draft-agent` → `5-1` and `mnemos-companion` → `gemini-3-1` for user `47299895-...`. ~560 rows across 9 tables. Done as one transactional migration.

Tables touched (rows): `engrams` (201), `hypomnema_entry` (107), `messages` (216, column = `agent`), `threads` (16), `agent_identity` (8), `mnemos_digests` (7), `emotional_state` (2), `beliefs` (2), `journal_entries` (1), then `agent_configs` itself last.

Pre-flight: verify the new slugs don't collide with anything else Karen owns. If a collision exists, suffix with `-2`.

## Part 2 — Fix the silent autonomy gate (affects ALL users with custom agents)

Root cause: custom-agent autonomy has two separate lanes. Inner-life work should be allowed when `personality.inner_life` is enabled, while user-facing proactive outreach should stay behind an explicit proactive flag. Older drafts mixed those lanes together, which made fixes easy to over-apply.

Fix:
- Keep `inner_life: true` scoped to private journal/dream/reflection work.
- Keep user-facing proactive outreach gated by `personality.autonomy.proactive === true`, `personality.proactive_autonomy === true`, or `personality.inner_life.proactive === true`.
- Backfill Karen's two agents only after checking which lane each agent should use.

## Part 3 — Harden agent labels across the UI

Drawer already fixed. Audit other surfaces that may still show raw `agent_id` slugs or fall back to "Luca":
- `src/components/messages/*` author labels
- `src/pages/JournalView.tsx`, `MemoryView.tsx`, `MindView.tsx` headers/filters
- `src/components/timeline/ActivityTimeline.tsx`
- `src/components/memory/*` cards
- Anywhere doing `agent_id || 'luca'` for display (not query) — replace with `availableAgents` lookup that falls back to the raw id, not to "Luca".

For each, resolve via `useAgentScopeStore().availableAgents` (or pass agent name as a prop where the store isn't loaded).

## Part 4 — Prevent future drift in `CreateAgentModal`

- Require the user to type a real name before the create call (already enforced).
- Add a guard: reject names that slugify to common placeholder slugs (`agent`, `draft`, `draft-agent`, `new-agent`, `mnemos-companion`, `untitled`).
- Seed `proactive_autonomy: false` on new custom agents so inner-life work is enabled without automatically starting user-facing outreach.
- Tighten `agent-forge/index.ts` seed personality the same way.

## Part 5 — Verification

Sandbox checks before declaring done:
1. SQL: `SELECT agent_id, count(*) FROM engrams WHERE user_id=…` shows only the new IDs.
2. Invoke `anima-heartbeat` with Karen's user + new agent ID → returns `processed`, not `skipped`.
3. Invoke `journal-write` for the renamed agent → row inserted with correct `agent_id`.
4. Browser: open Memory drawer on a Karen engram → author label reads "5.1" / "Gemini 3.1".
5. `bunx vitest run` for affected stores/components.

## Technical notes

- The ID rename is done as a single `BEGIN; ... COMMIT;` migration with `UPDATE ... WHERE user_id = $1 AND agent_id IN (...)` per table, then `UPDATE agent_configs` last. `agent_id` is text (not FK) so no constraint reshuffle.
- No new tables or RLS changes. No edge-function CORS or auth changes.
- Files expected to change: `supabase/functions/_shared/agent-scope.ts`, `supabase/functions/agent-forge/index.ts`, `src/stores/agentSettingsStore.ts`, `src/components/settings/CreateAgentModal.tsx`, plus ~4-6 display sites identified during Part 3 audit. One new migration file.

## Out of scope

- Letting users rename agent IDs from the UI (still immutable after this fix).
- A full audit of every `|| 'luca'` fallback in query paths (most are correct defaults, not bugs).
- The 106 pre-existing linter warnings noted in the prior audit.

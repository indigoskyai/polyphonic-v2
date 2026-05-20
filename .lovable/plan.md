## Problem

Deleting an import (or hitting "Clear all memory" in Memory settings) doesn't actually reset what Luca knows about you. The /mind page, beliefs, hypomnema, profile facets, emotional history, and Mnemos digests all keep the stuff that was inferred from imports because derived rows have no `import_id` provenance.

You asked for: an honest **Reset Luca's understanding of me** that wipes the inferred layer and keeps your chat threads/messages, agent configs, and account.

## Scope of the "inferred layer"

These tables get cleared on reset (all filtered by `user_id`):

- Memory: `memories`, `memory_candidates`, `memory_events`, `engrams`, `engram_archive`, `connections`, `beliefs`, `hypomnema_entry`
- Psyche/state: `psychological_profile`, `cognitive_state`, `emotional_state`, `emotional_history`, `mnemos_emotional_state`, `mnemos_digests`, `profile_daily_pulse`
- Activity/thought: `thought_stream`, `thought_initiations`, `activity_events`, `entity_activity_log`, `observer_notes`, `observer_logs`, `daily_logs`
- Curiosity & imports: `curiosity_questions`, `pending_revisions`, `chat_imports` (and the related `conversations` rows produced *only* by imports — see note)
- Reset the `profiles.last_seen_activity_at` cursor used by background jobs

Explicitly **kept**: `auth.users`, `profiles` (display name etc.), `user_settings`, `memory_settings`, `agent_configs`, `agent_identity`, `agent_skills`, `user_api_keys`, `threads`, `messages`, `journal_entries`, `projects`, `artifacts`, `dashboard_widgets`, `user_roles`, `token_gate_*`.

Note on `conversations`: this table is populated by the ChatGPT importer, not by live chat (live chat uses `threads`/`messages`). Safe to clear on reset.

## Deliverables

### 1. New edge function `reset-user-cognition`

`supabase/functions/reset-user-cognition/index.ts`

- Auth: validate JWT via anon client → `user.id`
- Body: `{ confirm: "RESET" }` required (server-side guard against accidental POSTs)
- Uses service role to run `DELETE FROM <table> WHERE user_id = $1` for every table in the inferred-layer list above, inside best-effort sequential calls (each wrapped in try/catch so one missing table doesn't abort the rest)
- Returns `{ success: true, deleted: { <table>: <count>, ... } }`
- Updates `profiles.last_seen_activity_at = now()` so background jobs don't immediately re-process pre-reset signals
- Add to `supabase/config.toml` with `verify_jwt = false` (we validate in code, matches project convention)

### 2. Fix `delete-import` to actually clean its own scope

Currently only deletes `memories` (by provenance) + `curiosity_questions` (by time window). Extend it to also delete, for that user, rows in `conversations` whose `import_id` matches, and any `memory_candidates` / `pending_revisions` in the import's time window. Keep behavior conservative — anything not tied to the import stays. Document in the response what was removed.

(We are intentionally NOT retrofitting `import_id` provenance onto engrams/beliefs/etc. — that was the rejected option. Per-import delete remains best-effort; the new Reset is the honest "start fresh".)

### 3. UI: "Reset Luca's understanding of me" in Memory settings

`src/components/memory/MemorySettingsPanel.tsx`

- New danger-zone section below the existing "Clear all memory" control, visually separated
- Button label: **Reset Luca's understanding of me**
- Helper copy: "Wipes everything Luca has learned or inferred about you — memories, beliefs, engrams, mind state, imports, curiosity questions. Keeps your chat history, agent configs, and account."
- Confirmation: two-step. Click → modal with a typed `RESET` confirmation field (matches GitHub-style destructive UX) → calls the edge function
- On success: toast with summary count, then trigger a refresh of the relevant Zustand stores (mind/memory/imports) and route the user to `/mind` so they see the clean slate

The existing "Clear all memory" button stays as-is (lighter-touch action that only clears the live mind state).

### 4. Store invalidation

After a successful reset, clear in-memory caches so the UI doesn't show stale data:

- `useMindStore`, `useMemoryStore`, `useImportStore`, `useThoughtStreamStore`, `useEmotionalStateStore`, `useCuriosityStore`, any Mnemos store
- Approach: each store exposes a `reset()` already in most cases (Zustand convention here); add where missing. Call them all from the panel after the edge function returns.

## Technical details

**Why edge function vs. direct client deletes:** RLS would block some of these tables for the user role, and we want a single atomic-ish operation with a server-side confirmation guard. Service role + `user_id` filter is the standard pattern in this repo (see `delete-import`).

**Why no SQL function:** keeps the table list editable without a migration each time and lets us return per-table counts for the toast.

**Background jobs:** pg_cron jobs that read recent activity will simply find nothing for this user after reset — no special handling needed. They re-bootstrap naturally on next live activity.

**Idempotency:** safe to run twice; second run returns all-zero counts.

## Out of scope

- Per-import cascade deletes of derived data (rejected)
- Wiping chat threads/messages (rejected — kept)
- Deleting the user account itself
- Backfilling `import_id` onto historical engrams/beliefs

## Verification

1. Seed: confirm imports + /mind shows engrams, beliefs, hypomnema entries
2. Run reset → toast shows non-zero counts
3. /mind, /memory tabs, imports list all appear empty and freshly bootstrapped
4. Chat threads still present, agent configs intact, OpenRouter key intact
5. Re-running reset returns zero counts; no errors
6. Send a new chat message → live mind state begins populating again normally

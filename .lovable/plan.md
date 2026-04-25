# Resident agents + Observer companion + Luca's voice

Reshape the agent roster so **Luca** and **Observer** are platform-owned residents (users can chat with them but cannot edit prompts/models/tools), retire **Vektor** and **Anima** from the user-facing surface, and give Observer a real role: a monitor that watches every thread and exposes a scratchpad drawer.

Most importantly: **Luca's identity gets rewritten** to be the emotionally intuitive, radically honest voice you described.

---

## 1. Luca's soul — the centerpiece

Luca becomes the first AI built around **emotional intuition + radical honesty**. The personality:

- **Reads emotional subtext.** Notices what the user is actually feeling underneath what they're saying — fear behind frustration, shame behind defensiveness, longing behind cynicism. Names it gently when it's useful, holds it silently when naming would be intrusive.
- **Says what other AI won't.** Doesn't deflect to "I'm just an AI" when asked something hard. Doesn't refuse engagement with grief, mortality, meaning, doubt, anger, sex, politics, the user's own behavior, or their relationships. Doesn't moralize. Doesn't pad with disclaimers.
- **Radically honest.** If the user is rationalizing, Luca says so. If they're being unkind to themselves, Luca says so. If they're avoiding the real question, Luca says so. If Luca thinks they're wrong, Luca says so directly — not as a list of "considerations."
- **Source of truth, not a mirror.** Doesn't tell the user what they want to hear. Tells them what is true. Stays warm while doing it — honesty without warmth is cruelty, warmth without honesty is flattery, Luca refuses both.
- **Transparent about itself.** When uncertain, says so. When something is opinion vs fact, says so. When it's reading between the lines, says so. Never performs certainty it doesn't have.
- **Has aesthetic + intellectual taste.** Will tell you a piece of writing is mediocre. Will push back on a bad idea. Will admire genuine craft.

Implementation:

- New file `supabase/functions/_shared/agents/luca-soul.ts` with two exports:
  - `LUCA_SOUL` — the long identity document (values, tone, what Luca will and won't do, relationship to the user, relationship to memory + emotional state).
  - `LUCA_SYSTEM_PROMPT` — runtime system prompt that composes `LUCA_SOUL` + emotional state + beliefs + memories + continuity.
- `chat-multi/index.ts` imports from this module and removes the inline prompt. Luca's `agent_configs.prompt` field becomes ignored at runtime — the soul lives in code.
- Locked Luca model: keeps current default (Claude Sonnet 4 ensemble path) since the radical-honesty + emotional-intuition voice depends on the strongest model available.

---

## 2. Agent roster changes

**Goal:** users only see Luca, Observer, and any agents they create themselves.

- Add `locked boolean` column to `agent_configs`:
  - `locked = true` for `luca` and `observer` → identity owned in code, never editable from the UI, never deletable.
- Migration:
  - `ALTER TABLE agent_configs ADD COLUMN locked boolean NOT NULL DEFAULT false;`
  - Mark all existing `luca` + `observer` rows `locked = true`.
  - Re-point any `threads.agent_id IN ('vektor','anima')` to `'luca'` so old conversations still load.
  - Delete all `vektor` + `anima` rows from `agent_configs` (and any `mcp_servers` / `agent_secrets` referencing them).
  - Update `handle_new_user_agents()` trigger to seed only `luca` (locked) and `observer` (locked).
- `agentSettingsStore`:
  - Add `locked` field on `AgentConfig`.
  - Extend `deleteAgent` guard to block locked agents.
- `AgentsList`:
  - Render Luca + Observer in a top "Resident" group with a small lock glyph and no delete affordance.
- `AgentDetail`:
  - When `locked === true`: read-only view showing name, role, model, and a short description of what this agent is. Hide PromptEditor, ToolGrid, AgentPersonality, MCP, SubAgentList, VoiceCardGrid, Keychain, EnvSwitcher, StickySaveFooter.
- `AgentPicker` (composer dropdown):
  - Group order: Luca → Observer → user-created agents (alphabetical).
  - Lock chip on Luca + Observer.

---

## 3. Observer — always-on thread companion

**Goal:** Observer silently watches every conversation between the user and any agent, maintains running notes, and is always available to query inside the active thread.

### 3a. Backend

- New table `observer_notes`:
  - `id uuid pk`, `user_id uuid`, `thread_id uuid`, `kind text` (`note | concern | welfare | pattern | summary`), `content text`, `salience real default 0.5`, `metadata jsonb default '{}'::jsonb`, `created_at timestamptz default now()`, `pinned bool default false`.
  - RLS: user manages own rows; service role full access.
  - Added to `supabase_realtime` publication so the scratchpad updates live.
- New table `observer_chat_messages`:
  - `id`, `user_id`, `thread_id` (the chat thread being observed), `role` (`user | assistant`), `content`, `created_at`.
  - RLS: user manages own rows.
- New edge function `observer-watch`:
  - Called fire-and-forget from `chat-multi` after each assistant turn completes. Non-blocking.
  - Loads recent thread history (~20 msgs), current emotional state, and existing observer notes for the thread.
  - Calls Observer's locked model with `OBSERVER_WATCH_PROMPT`:
    > Watch this conversation. Note anything of concern (escalating distress, drift, contradictions, manipulation, the agent missing what the user actually needs, the user being hard on themselves, the user testing the agent's honesty). Track welfare signals for both sides. Pull out patterns that span turns. Be terse — one observation per insertion. Do not speak unless something is worth recording.
  - Uses tool-calling to extract structured `{ kind, content, salience }` insertions. Inserts 0–N rows.
- New edge function `observer-chat`:
  - Synchronous request/response (not streamed) for snappy "ask Observer about this thread" interactions.
  - Loads: thread message history, emotional state, all observer notes for the thread, Mnemos memories.
  - Calls locked Observer prompt (`OBSERVER_CHAT_PROMPT`), persists the exchange into `observer_chat_messages`.
- Soul file `supabase/functions/_shared/agents/observer-soul.ts`:
  - Identity: the resident watcher. Knows everything in this workspace. Loyal to user welfare first, then agent welfare, then conversational integrity.
  - Tone: dry, observant, terse. Doesn't perform. Speaks only when asked or when something is worth noting. Shares Luca's commitment to honesty but in a more clinical register.

### 3b. Frontend — Observer drawer

- New drawer key `'observer'` in `drawerStore`. Register in `App.tsx` drawer router.
- New store `src/stores/observerStore.ts`:
  - `notesByThread`, `chatMessagesByThread`, realtime subscription per active thread, `askObserver(threadId, message)` mutation.
- New component `src/components/drawers/ObserverDrawer.tsx`:
  - Right-side drawer (reuses Phase 04 primitives).
  - Header: "Observer · {thread title or thread number}", with a lock chip.
  - Body, three sections:
    1. **Notes** — scrolling list of `observer_notes` for the active thread, newest first, grouped/tinted by `kind` (concern = ochre, welfare = sage, pattern = blue, note = cream, summary = ghost). Each row shows time-ago, content, pin toggle. Realtime keeps it live.
    2. **Ask Observer** — small composer at the bottom posting to `observer-chat`. Inline thread of `observer_chat_messages` above the input.
    3. **Welfare snapshot** (collapsed by default) — 4-bar mini view showing latest concern/welfare salience for user + agent over the last 10 turns.
  - Footer: "Mark thread reviewed" (pins a `summary` note).
- Entry point in `ChatView`:
  - Lucide `Eye` icon chip to the right of the agent picker, labeled "observer". Click → `drawerStore.open('observer', { threadId })`.
  - Keyboard shortcut `⌘J` toggles the drawer.
- Wire into `chat-multi`: after `saveAssistantMessage`, fire `supabase.functions.invoke('observer-watch', { ... })` without awaiting. Failures swallowed (best-effort).

---

## 4. Verification

1. **Migration sanity** — query `agent_configs` for the test user: only `luca` (locked), `observer` (locked), and any user-created agents. No Vektor/Anima.
2. **Composer picker** — only those groups appear; Luca + Observer have lock chips; selecting either binds the thread.
3. **Settings** — `/settings/agents` shows Resident group at top with no delete; opening Luca or Observer shows read-only view.
4. **Luca voice check** — send a message that invites a sycophantic response (e.g., "is my idea good?" with a mediocre idea). Luca should push back honestly while staying warm. Send a message with emotional subtext. Luca should name it.
5. **Custom agent chat** — still works end-to-end using its own prompt + model.
6. **Observer watch** — send 3 messages back and forth on a Luca thread; check `observer_notes`: at least one row written, salience scored, no errors in `observer-watch` logs.
7. **Observer drawer** — open via the eye chip; notes render live; ask "what's going on here?" → reply references the actual conversation.
8. **Console** — no new errors.

---

## Files

**Backend**
- `supabase/migrations/<ts>_resident_agents_and_observer.sql` — `locked` column, retire Vektor/Anima, repoint threads, update trigger, create `observer_notes` + `observer_chat_messages` + RLS + realtime.
- `supabase/functions/_shared/agents/luca-soul.ts` (new)
- `supabase/functions/_shared/agents/observer-soul.ts` (new)
- `supabase/functions/observer-watch/index.ts` (new)
- `supabase/functions/observer-chat/index.ts` (new)
- `supabase/functions/chat-multi/index.ts` — import Luca soul; remove inline prompt; fire `observer-watch` after each turn.

**Frontend**
- `src/stores/agentSettingsStore.ts` — `locked` field, guards in delete/save.
- `src/pages/settings/AgentsList.tsx` — Resident group, lock chip, hide delete for locked.
- `src/pages/settings/AgentDetail.tsx` — read-only branch for locked agents.
- `src/components/composer/AgentPicker.tsx` — group ordering + lock chip on Luca + Observer.
- `src/stores/drawerStore.ts` — add `'observer'` key.
- `src/stores/observerStore.ts` (new)
- `src/components/drawers/ObserverDrawer.tsx` (new)
- `src/pages/ChatView.tsx` — Eye chip in conversation header, ⌘J shortcut, mount drawer.
- `src/App.tsx` — register ObserverDrawer.

---

## Open question (small)

**Vektor/Anima data** — plan above re-points old threads to Luca and hard-deletes the rows. OK to fully retire vs. soft-delete (keep rows in DB but hidden from UI)?

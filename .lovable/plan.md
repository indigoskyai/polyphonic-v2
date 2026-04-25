# User-creatable agents

Build a system where users can create their own agents (and ask Luca to create one for them) that actually behave differently in chat. MCP, sub-agents, voice, tools, and keychain stay as visual stubs with a "Coming soon" treatment so the page is honest.

## What you'll be able to do when this ships

1. Hit **+ New agent** in `/settings/agents`, name it, pick a color, pick a model, write a system prompt + personality, save → it appears in the list immediately.
2. Edit any user-created agent's name, model, prompt, and personality. Delete user-created agents (the 4 system agents — Luca, Vektor, Anima, Observer — are protected).
3. Pick which agent to chat with from a small picker on the chat composer. The agent's prompt + model actually drive the response.
4. Ask Luca in chat: *"Make me a research agent that's terse and skeptical"* — Luca proposes a config in a card inside the message, you approve, and the new agent appears in your settings.

## Phases

### Phase A — Make agents real records (schema + create UI)

**Schema changes to `agent_configs`:**
- Add `name text` (display name)
- Add `role text` (short label like "orchestrator", "analyst", "custom")
- Add `avatar_color text` (hex/HSL stored as string; defaults to a neutral cream)
- Add `is_system boolean default false` (true for Luca/Vektor/Anima/Observer; protects from delete)
- Add `created_by text` (`'system' | 'user' | 'luca'`)
- Add `personality jsonb` (mirrors legacy `agent_config.personality`: `{ inner_life, thought_verbosity, voice_description }`) so we collapse the two-table mess
- Add seed trigger: on new auth user, insert the 4 system agents

**Store changes (`agentSettingsStore.ts`):**
- Drop the `AGENT_DISPLAY` constant. Read everything from `agent_configs`.
- Add `createAgent(input)` and `deleteAgent(id)` methods.
- Block deletes when `is_system = true`.

**UI changes:**
- `/settings/agents`: add a **+ New agent** button at the top. Each row gets a delete affordance (hidden for system agents).
- New `CreateAgentModal` component: name, color swatch picker (6 preset cream/ochre/blue/magenta/sage/violet), model dropdown, prompt textarea, personality fields. Submits → creates row → routes to detail.
- `AgentDetail`: editable name field at the top (instead of hardcoded display name). Personality controls move from legacy `agent_config` table to the unified `agent_configs.personality` field.
- Add a "Coming soon" pill to the **MCP servers**, **Sub-agents**, **Voice**, **Tools**, **Keychain** sections so the visual stubs read as intentional.

### Phase B — Wire prompt + model into chat-multi (the runtime that makes A meaningful)

- Add an `agent_id` column to `threads` (nullable; defaults to user's "luca" agent).
- `chat-multi` accepts `agent_id` in the request body and on the thread.
- Loads the matching `agent_configs` row. Uses its `prompt` (falls back to the existing hardcoded Luca prompt when missing) and its `model` (falls back to `user_settings.default_model`).
- Personality fields (`inner_life`, `thought_verbosity`, `voice_description`) are appended to the system prompt.
- Add a small **agent picker** to the chat composer: clickable dot+name that opens a popover listing all agents. Selecting one updates the thread's `agent_id`.
- Visual: chat header shows the active agent's color dot + name. Messages keep their existing styling.

### Phase C — Luca creates agents (the magical bit)

- Add a `create_agent` tool definition Luca can call mid-conversation. Schema: `{ name, role, model, prompt, personality_description, avatar_color }`.
- When Luca calls it, the tool inserts a `agent_configs` row with `created_by = 'luca'` in a **pending** state (new column `pending boolean default false`).
- A **proposal card** renders inline in the message stream: shows the proposed config with **Approve** / **Tweak** / **Discard** buttons.
- Approve flips `pending = false` and adds the agent to the list. Tweak opens the create modal pre-filled. Discard deletes the row.
- Tool wiring lives in `chat-multi` — when the synthesis model emits a `create_agent` tool call (parsed from the response), the function inserts the pending row and emits a `tool_use` SSE event the frontend renders as the proposal card.

### Phase D — Polish

- Empty state for the agents list when only system agents exist: subtle hint "Create your first custom agent".
- Toast on successful create / delete.
- Keyboard: Cmd+K palette gets "Create agent" entry.
- Disabled-state styling for "Coming soon" sections (lower opacity, non-interactive).

## Key technical details

**Migration (Phase A) adds to `agent_configs`:** `name`, `role`, `avatar_color`, `is_system`, `created_by`, `personality jsonb`, `pending boolean`. Plus a `handle_new_user_agents()` trigger that seeds Luca/Vektor/Anima/Observer rows on signup. Existing rows backfilled via the migration itself.

**Files touched:**
- `supabase/migrations/<new>` — schema + seed trigger
- `src/stores/agentSettingsStore.ts` — drop `AGENT_DISPLAY`, add `createAgent`/`deleteAgent`, switch loader to read all rows
- `src/pages/settings/AgentsList.tsx` — + New agent button, delete affordance
- `src/pages/settings/AgentDetail.tsx` — editable name, "Coming soon" pills, unified personality
- `src/components/settings/CreateAgentModal.tsx` (new)
- `src/components/settings/AgentPersonality.tsx` — point at `agent_configs.personality` instead of legacy table
- `supabase/functions/agent-config-save/index.ts` — accept new fields
- `supabase/functions/agent-create/index.ts` (new) — POST `{ name, role, model, prompt, personality, avatar_color }`
- `supabase/functions/agent-delete/index.ts` (new) — POST `{ id }`, blocks system agents
- `supabase/functions/chat-multi/index.ts` — load agent config by `agent_id`, use its prompt + model, parse `create_agent` tool calls
- `src/components/ChatComposer.tsx` (or wherever the composer lives) — agent picker popover
- `src/components/messages/AgentProposalCard.tsx` (new) — inline approve/tweak/discard card

**Two-table cleanup:** `agent_config` (singular, legacy) is left alone for `chat-guardian` reads, but the personality fields move to `agent_configs.personality` so the new flow has a single source of truth. Future cleanup pass can migrate Guardian over and drop the legacy table.

## What we're explicitly NOT building this round

- Real MCP server connections (stays a stub)
- Sub-agent orchestration (stays a stub)
- Voice / TTS (stays a stub)
- Tool gating enforcement (toggles still cosmetic)
- Per-agent keychain (stays a stub)
- Agent sharing / marketplace
- Versioning agent configs

## Suggested build order

A and B ship together (creating an agent that doesn't behave differently is worse than no feature). C ships next. D rolls in as small follow-ups.

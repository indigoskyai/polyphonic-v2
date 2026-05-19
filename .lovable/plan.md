# Disable new agent creation

## Goal
Stop users from creating new custom agents in Settings. Every agent already in `agent_configs` (resident + user-built) keeps working exactly as before — chat, edit, delete, configure are all unaffected.

## Why this is safe
Agent creation has **one entry point**: the "+ New agent" button in `src/pages/settings/AgentsList.tsx` → `CreateAgentModal` → `agentSettingsStore.createAgent()` → insert into `agent_configs`. No Luca tool, edge function, or other UI calls `createAgent`. Chat reads existing `agent_configs` rows in `chat-multi`, so existing agents are untouched by removing the create path.

## Changes

### 1. `src/pages/settings/AgentsList.tsx`
- Remove the `+ New agent` button (and its `createOpen` state + `<CreateAgentModal>` mount).
- Optionally replace with a small muted line under the roster: "Custom agent creation is paused. Existing agents remain fully editable." — confirms intent so users don't think it's a bug.

### 2. `src/components/settings/CreateAgentModal.tsx`
- Leave file in place but unused (avoid churn). Or delete if you'd rather keep the tree clean — call it out and I'll remove it.

### 3. `src/stores/agentSettingsStore.ts` — `createAgent`
- Short-circuit at the top: return `{ ok: false, error: 'Agent creation is disabled.' }` without hitting Supabase. Belt-and-suspenders in case any stale code path still calls it.

### 4. (Optional, recommended) Database guard
- Add a migration that revokes insert on `agent_configs` for the `authenticated` role, OR adds an RLS policy denying inserts where `is_system=false`. This makes the lock enforceable server-side so a future code regression can't accidentally re-enable creation.
- Existing rows: untouched. Updates/deletes/selects: untouched.

## What does NOT change
- `AgentDetail` page — full edit access for every existing agent.
- Delete button on the roster — still works for user-built agents.
- `chat-multi`, `agent-config-save`, `agent-identity-save` — unchanged.
- Resident agents (Luca, Anima, Vektor) — unchanged.
- `agentSettingsStore.load`, `deleteAgent`, `updateAgent` — unchanged.

## Reversal
To re-enable later: revert the AgentsList edit, remove the short-circuit in the store, and (if applied) drop the RLS guard. No data migration needed.

## Open question
Want the DB-level guard (#4)? I'd recommend yes for safety, but it's optional. Default if you don't answer: yes, add the migration.

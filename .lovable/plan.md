## What's actually happening

I traced the full revise path: `AgentForgeCard.onRevise` → `reviseForgeProposal` (`ChatView.tsx:1595`) prefills the composer with *"Revise this Forge proposal for {name}. Please keep the full Open Clause shape, but change: …"*. That message contains "open clause", so `looksLikeAgentForgeRequest` returns true in `chat-multi/index.ts:461` and `forceForgeRequest` is set. The legacy tool planner runs in forge-only mode (`anima-tool-execute` with `force_forge_only=true`), `agent-forge` inserts a new `permission_request` row, and `chat-multi` returns `{duplicate:true}` so the client calls `loadMessages(tid)`.

I checked the database for the user's two recent Muse revise attempts. Both rows exist with `kind=permission_request`, `metadata.forge_kind=agent_forge_proposal`, and the second blueprint actually does incorporate the user's edits (different role/summary, different blueprint hash). So the cards *are* being created and *should* render.

The bug the user is reporting is real, but it isn't "no card appears" — it's that **Luca, on the very next turn, has no memory of what was in the blueprint** and so apologizes and says "i don't know if the Forge tool actually fired." The assistant message stored for a Forge proposal is the literal stub `"I drafted Muse. Review the Forge proposal below."` (`supabase/functions/agent-forge/index.ts:271`). `loadThreadHistory` (`supabase/functions/_shared/continuity/kernel.ts:432`) only selects `id, role, content, agent, created_at` — it never reads `metadata`. So when Luca sees its own prior turn, all it sees is that 9-word stub with no blueprint, no status, no link between turn-N and turn-N+1. From that vantage point Luca's apology is correct: it genuinely cannot tell that anything happened.

There are also two secondary issues worth fixing in the same pass:

1. The revise prompt template doesn't include the proposal's `message_id` or a stable "this revises proposal X" reference, so even if Luca could read metadata it has no anchor to know "this revise targets the most recent proposal." The model has been re-emitting near-identical blueprints because it doesn't know which one to diff against.
2. The first planner call in `anima-tool-execute` (`supabase/functions/anima-tool-execute/index.ts:583`) does *not* set `tool_choice` on the initial attempt even when `forceForgeOnly` is true. It relies on the leak detector + a repair pass. For revise turns specifically, we should force the tool call on the first attempt — the intent is unambiguous.

## Plan

### 1. Make Forge proposals visible in Luca's own context

`supabase/functions/_shared/continuity/kernel.ts`

- Extend `ContinuityHistoryMessage` and the `loadThreadHistory` select to include `kind` and `metadata`.
- In `normalizeThreadHistoryForAgent` (or a new helper called from it), when an assistant row is a Forge proposal (`kind === 'permission_request'` and `metadata.forge_kind === 'agent_forge_proposal'`), rewrite its `content` before it hits the model so Luca sees a compact, structured recap instead of the stub:

  ```
  [Forge proposal #<message_id> · status=<pending|approved|canceled|failed> · action=<create|update>]
  Name: <name> · Role: <role> · Model: <model>
  Summary: <summary>
  Runtime instructions: <first ~500 chars of prompt>
  Identity docs: soul (Nc), convictions (Nc), user_model (Nc), self_model (Nc)
  ```

  Keep it compact (don't dump 4×32KB docs back into context) — counts + the role/summary/first chunk of the runtime prompt is enough for Luca to know what it submitted, what status it's in, and reason about what to revise.

- The same select change lets us also hide canceled/failed Forge proposals from the user-visible recap if we want later — out of scope here, just leaving the door open.

### 2. Anchor revise turns to the specific proposal

`src/pages/ChatView.tsx` — `reviseForgeProposal` (line 1595)

- Include the proposal message id and the previous blueprint name *and* a one-line summary anchor in the prefilled composer text. Something like:

  ```
  Revise the previous Forge proposal for {name} (proposal id: {msg.id}).
  Keep the full Open Clause shape and the parts I don't change. Change:
  ```

- This gives the planner an explicit "this is a revise of proposal X" signal so it diffs against the prior blueprint instead of starting from scratch.

### 3. Force the tool call on revise turns

`supabase/functions/anima-tool-execute/index.ts`

- When `forceForgeOnly === true`, pass `tool_choice: { type: "function", function: { name: "forge_agent" } }` and `parallel_tool_calls: false` on the *first* planning call, not only in the repair pass. The repair pass is a workaround for a failure mode we can avoid entirely on forge-forced turns.
- Keep the existing repair pass as a safety net for the rare case where even forced tool choice returns no tool calls.

### 4. Improve the stored stub so users (and Luca) can tell revisions apart

`supabase/functions/agent-forge/index.ts` — `insertProposal`

- Change the stored `content` to include the blueprint name **and** a short revision marker when `action === "update"` or when there is an in-thread prior proposal for the same name. Example:
  - `create`: `Drafted ${blueprint.name} — review the Forge proposal below.`
  - `update`: `Drafted updates to ${blueprint.name} — review the revised Forge proposal below.`
  - For a create that follows a prior pending/canceled create of the same name in the same thread, write: `Drafted a revised ${blueprint.name} — review the new Forge proposal below.`

  (Lightweight: do a single `select id from messages where thread_id=$ and user_id=$ and metadata->>'forge_kind'='agent_forge_proposal' and metadata->'blueprint'->>'name'=$ order by created_at desc limit 1`.)

  This is purely a copy fix; the card still keys off metadata.

### 5. Verification

After the edits I will:

1. Deploy `chat-multi`, `anima-tool-execute`, `agent-forge`.
2. From the preview, create a fresh agent via Luca, click Revise, type a clear change, send. Confirm:
   - A new Forge card appears with the revised blueprint.
   - On the next user turn, Luca correctly references what it just proposed (no "i don't know if the Forge tool fired" apology).
3. Run `bunx vitest run src/test/agentForge.test.ts` and any continuity-kernel tests touched.

## Non-goals

- No schema migrations. `kind`/`metadata` already exist on `messages`.
- Not changing the card UI, the genesis/celebration shimmer, the commit/cancel paths, or the agent-forge entitlement checks.
- Not touching the SDK-runtime path (`openRouterAgentSdkStream`) — `forceForgeRequest` already routes around it.

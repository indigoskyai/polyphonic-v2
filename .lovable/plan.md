# Classic Chat double-label fix

## Symptom
In Classic Chat (`thread.runtime_mode='classic'`), every assistant turn renders **twice** in the list — once labeled `LUCA`, once labeled with the selected model (e.g. `CLAUDE OPUS 4.7`).

Confirmed with the live thread `63feac70-167f-4ad0-ada7-8a663243a4fe`:
- `threads.runtime_mode = 'classic'`, `selected_model = 'anthropic/claude-opus-4-7'`
- Only one assistant row in `public.messages` (`agent` is null, `model = 'anthropic/claude-4.7-opus-20260416'`)
- So both bubbles render from the same DB row — this is a frontend display + dedupe bug, not duplicate inserts.

## Root causes

1. **MessageItem mislabels classic rows as "Luca"** — `src/components/messages/MessageItem.tsx:31-37`
   `getAgentDisplayName(null)` unconditionally returns `'Luca'`. In Classic Chat, the server intentionally persists `agent = null` (`persistedAgentId: classicRuntime ? null : agentId`), but MessageItem has no awareness of `runtime_mode`/`selected_model`, so the canonical row reads as `Luca`.

2. **Streaming-bubble dedupe filter compares against the wrong field** — `src/pages/ChatView.tsx:2768-2774`
   The hide-during-stream check uses `(msg.agent ?? null) === (activeAgentId ?? null)`. In classic mode `activeAgentId = 'luca'` but the persisted row has `agent = null`, so the canonical row is never hidden under the streaming bubble. The same logic at line 997 already uses the correct `activeMessageAgent` (which is `null` for classic) — only the dedupe filter is wrong.

3. (Cosmetic, same family) **Snapshot recovery defaults to `'luca'`** — `src/pages/ChatView.tsx:1132-1138`
   `agent: snap.agent || 'luca'` reintroduces a `luca` label for any recovered classic message. Should default to `activeMessageAgent`.

## Fixes

### `src/components/messages/MessageItem.tsx`
- Subscribe to the current thread (`useThreadStore(s => s.threads.find(t => t.id === s.currentThreadId))`).
- Compute display label:
  - If `msg.role === 'assistant'` AND thread `runtime_mode === 'classic'` AND `!msg.agent` → use `getChatModelLabel(msg.model || thread.selected_model)`.
  - Otherwise keep existing logic (`Observer` for guardian, store lookup, capitalized fallback, `Luca` for null in non-classic threads).

### `src/pages/ChatView.tsx`
- Line 2772: change `(msg.agent ?? null) === (activeAgentId ?? null)` → `(msg.agent ?? null) === (activeMessageAgent ?? null)` so the canonical classic row (agent=null) is hidden under the streaming bubble.
- Line 1137 snapshot recovery: change `agent: snap.agent || 'luca'` → `agent: snap.agent ?? activeMessageAgent` so recovered classic snapshots don't reintroduce a Luca label.

## Related agent/model surfaces swept (no change needed)

- `chat-multi` `persistedAgentId: classicRuntime ? null : agentId` — correct.
- `findRecentDuplicateAssistantMessage` already issues `.is("agent", null)` when `persistedAgentId` is null — correct.
- Streaming bubble label (`currentResponderLabel`) already picks the model name in classic mode — correct.
- Optimistic stub at line 2179-2189 uses `agent: activeMessageAgent` (null in classic) — correct.
- Sidebar/thread title model badge already keys off `selected_model` — correct.
- Orphan-artifact fallback at line 2961 hardcodes "Luca" — extremely rare path, not classic-specific. Out of scope for this turn.

## Verification

1. Reload `/chat/63feac70-167f-4ad0-ada7-8a663243a4fe` — expect a single assistant bubble labeled `Claude Opus 4.7`, not two.
2. Send a new message in that thread — streaming bubble shows `Claude Opus 4.7`, settles into one canonical bubble with the same label; no `LUCA` row appears.
3. Open a Luca Agent Mode thread, send a message — still labeled `Luca`, full agent pipeline still runs.
4. Switch a thread's model mid-conversation — newest assistant row uses the new model's label; older rows keep their original model label (since the fix uses `msg.model` first).
5. Browser console: no new errors; no duplicate assistant inserts in `public.messages`.

## Out of scope
- Migration / edge-function deploys (done last turn, verified).
- Thread creation flow.
- Any non-classic agent identity behavior.

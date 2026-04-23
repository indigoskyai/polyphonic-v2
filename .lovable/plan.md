

# Ensemble as a Per-Message Skill

Turn the always-on/always-off ensemble into something the user activates per message — like a skill they can toggle for the next send. When active, Luca consults multiple models in parallel and synthesizes a single voice; the user can expand to see each model's raw response.

---

## What changes for the user

- A new **"Ensemble"** toggle pill sits next to the agent pills in the composer footer, right beside the thinking-effort selector.
- Clicking it arms ensemble mode for the **next send only** (it auto-disarms after the message is sent — preventing accidental ensemble spam).
- Optional: shift+click (or long-press) **locks it on** until clicked again, for users who want a streak of ensemble messages.
- When armed, the input shell gets a subtle accent shimmer + the placeholder shifts to "Message Luca (ensemble)…" so it's obvious what will happen.
- After Luca replies, the existing **"N model responses"** disclosure already shows each variant's content + thinking — that stays exactly as it is.
- Messages sent without ensemble armed go through a normal single-model path (faster, cheaper).

---

## Architecture

### Frontend (`ChatView.tsx`)

- New local state: `const [ensembleArmed, setEnsembleArmed] = useState(false)` and `const [ensembleLocked, setEnsembleLocked] = useState(false)`.
- New compact pill component rendered in both the empty-state and conversation-state input footers:
  - Idle: faint outline, label "ensemble"
  - Armed: accent border + soft glow, label "ensemble · armed"
  - Locked: filled accent, label "ensemble · on"
- `sendMessage()` reads `ensembleArmed || ensembleLocked` and passes a new `ensemble: true` field in the request body. After send, `setEnsembleArmed(false)` (locked stays).
- Tiny tooltip on hover: "Consult multiple models for this message. Click to lock."

### Backend (`supabase/functions/chat-multi/index.ts`)

- Accept new field `ensemble?: boolean` in the request body.
- **Resolution rule**: if `ensemble` is explicitly `true` → run ensemble path. If explicitly `false` → run single-model path. If omitted → fall back to the user's `multi_model_enabled` setting (preserves current behavior for any older clients).
- The existing fan-out + synthesis logic stays as-is; we're just changing the gate that selects between `singleModelStream()` and the multi-model flow.
- Stream events (`variant`, `synthesizing`, `content`, `thinking`, `done`) remain unchanged — the frontend's `VariantsPanel` continues to render per-model responses with no work needed.

### Settings (`settingsStore.ts` + `SettingsModal`)

- The global `multi_model_enabled` toggle is **kept** but relabeled to **"Default ensemble to on"** (controls the default state of the per-message arm, for users who want every message ensembled).
- No DB migration needed — the existing column does the job, just with a different semantic meaning surfaced in the UI.

---

## Visual / interaction details

- Pill placement (left → right in footer): `luca | guardian` · `ensemble` · `effort` · `send`
- Keyboard shortcut: **⌘E** toggles `ensembleArmed` while the composer is focused — for power users.
- When ensemble is armed, the send button gets the same faint accent halo as the pill, so the connection is visually obvious.
- The "synthesizing" + "N/3 models responded" indicators that already render during streaming stay — they're now the natural reward for arming ensemble.

---

## Why this is the right shape

- **No new agent abstraction** — ensemble is a *modifier* on Luca, not a separate agent. This matches the user's mental model: "Luca, but think harder this time."
- **Reuses every existing piece**: `chat-multi`, `VariantsPanel`, the variant streaming events, the synthesis prompt — all unchanged.
- **Per-message default = off** keeps cost predictable; **per-message arm + lock toggle** makes intentional ensemble use a one-click action.
- **No schema changes**, so this ships as a pure code change.

---

## Files touched

1. `src/pages/ChatView.tsx` — add `ensembleArmed` / `ensembleLocked` state, pill UI in both empty-state and conversation-state footers, ⌘E shortcut, pass `ensemble` flag in `sendMessage`.
2. `src/index.css` — add `.ensemble-pill`, `.ensemble-pill.armed`, `.ensemble-pill.locked` styles (matching existing `.agent-pill` aesthetic).
3. `supabase/functions/chat-multi/index.ts` — read `ensemble` from request body, override the `multiModelEnabled` gate when present.
4. `src/components/SettingsModal.tsx` — relabel the existing multi-model toggle to "Default ensemble to on" with an updated description.

No DB migration. No new edge function. No new table.


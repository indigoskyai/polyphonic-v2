## Problem

Two regressions surfaced after the M0–M7 memory-augmentation wave:

1. **Duplicated Luca message.** Database confirms only ONE assistant row exists for the latest turn (id `16aca0aa…`). So the duplicate in the screenshot is purely a render bug: the persisted DB message and the lingering streaming bubble are both visible at the same time. The two visible bodies even differ slightly ("graduation" vs "graduation mechanism", "with rather than fetched" vs "opened with rather than fetched") — that text drift is the smoking gun.
2. **Streaming animations lost their polish.** The typewriter cadence, fade-in, settle, and cursor-fade transitions feel choppier than after the previous round of polish.

## Root cause — the duplicate

In `ChatView.tsx`:

- The chairman streams `content` chunks → `streamingContent` → `lingeringStream` mirror.
- Council v2 then runs the **voice-fidelity critique** which can emit a `revised_content` event. That replaces `fullContent` with the revised text and pushes it into `setStreamingContent` (line 967-973).
- On `done`, `addMessage({ content: fullContent, … })` records the local stub.
- Realtime delivers the canonical DB row (which the edge function persisted with `synthesizedContent` = the revised text).
- `messages.map` hides the duplicate via strict equality: `msg.content === lingeringStream` (line 1389).

The strict content equality is fragile:
- Streaming buffer may carry trailing whitespace or a partial last token that the DB row doesn't.
- If `revised_content` arrives after `addMessage` was queued or while React batches, the `lingeringStream` snapshot can be the **pre-revision** text while the persisted row holds the **revised** text. They're now permanently mismatched → both render.
- This is exactly what the screenshot shows: two slightly-different bodies of the same reply.

## Plan

### 1. Fix the duplicate render (correctness)

Replace the brittle string-equality dedupe in `ChatView.tsx` with an identity- and recency-based one:

- When the streaming bubble is mounted (`isStreaming || lingeringStream`), hide the **last assistant message** in the list if its `created_at` is within ~5s of "now" AND its `agent` matches `activeAgentId`. No content comparison.
- On `StreamingText.onSettled`, clear `lingeringStream` AND set a one-frame `justSettled` flag so the swap from streaming bubble → persisted message is atomic (no in-between frame where neither or both render).
- Once `lingeringStream` is null and `justSettled` flips off (next frame), the persisted message becomes visible with its own `msgEnter` animation suppressed (it's the same content the user was just reading — no re-animate).

Also tighten `threadStore.addMessage` dedupe so it accepts a small content delta (normalize trailing whitespace) when matching against a realtime row in the 30s window. This makes the stub→canonical replacement reliable when `revised_content` and `done` race.

Edge-function side: in `chat-multi`, ensure `revised_content` is always emitted **before** `done` (verify order; today it is, but assert it explicitly with a single `await` boundary so the SSE writes can't reorder under back-pressure).

### 2. Audit and restore the streaming animation polish

Cover every surface that contributes to the perceived "smoothness" of a Luca reply landing.

**a. Typewriter cadence (`useSmoothTypewriter`)**
- Re-tune the EMA + tier curve so it ramps from ~180 cps → ~520 cps proportional to buffer gap, with a soft ceiling. Today's 220/360/600 step function feels staircase-y on long bursts.
- Skip the rAF tick entirely when the buffer is empty AND not active, instead of running an idle loop.
- Reset `gapEmaRef` on a new message instead of carrying over from the prior reply.

**b. Streaming bubble lifecycle (`StreamingText`)**
- Drive cursor opacity with a CSS transition (240ms ease-out) instead of a class-toggle that fights React's render cycle.
- On `onSettled`, animate the bubble height to its persisted equivalent (no shift).
- Memoize the `RichBody` tree with a chunk size threshold (e.g. only re-parse when displayed grew by ≥8 chars or contains a fence delimiter) — today it reparses every char, which becomes expensive on long markdown replies and drops the framerate well below 60fps.

**c. Message enter animation**
- The `msgEnter` keyframe is fine, but the per-message `animationDelay: i * 30ms` (capped 150ms) re-runs on every list change. Gate it so only **newly added** messages animate, not the entire list when one row is appended. Track previously-rendered IDs in a ref.

**d. ThinkingBlock state machine**
- The 4-state transition (waiting → streaming → settling → complete) currently has hard-cuts on label changes. Cross-fade the label text with a 180ms opacity dip.
- Keep the dots animation running through the entire isActive window with a single keyframe, not restarted per state change.

**e. Auto-scroll**
- Throttle to rAF (currently throttled, but verify the throttle unsubscribes when streaming ends).
- Use `scrollTo({ behavior: 'auto' })` during active streaming, switch to `'smooth'` only at settle. Smooth-during-streaming compounds with the reveal cadence and feels laggy.

**f. Reduced motion**
- Verify `@media (prefers-reduced-motion: reduce)` collapses the typewriter to instant reveal and skips the cursor fade.

**g. Performance verification**
- Open the affected thread, send a long reply, profile with browser perf tools. Confirm: no layout thrash during streaming, JS task durations < 16ms during reveal, stable 60fps.

### 3. Verification

- Reproduce the duplicate by running a council reply that triggers a critique revision; confirm only one body renders.
- Send a 1500-char reply, screenshot before/after to confirm the typewriter ramp feels even.
- Console clean.
- Reduced-motion check.

## Files touched

- `src/pages/ChatView.tsx` — dedupe rewrite, typewriter retune, StreamingText polish, msgEnter gating, scroll behavior.
- `src/stores/threadStore.ts` — normalize content comparison in `addMessage` + `subscribeMessages`.
- `src/components/messages/MessageItem.tsx` — accept a `suppressEnter` prop for the just-settled persisted row.
- `supabase/functions/chat-multi/index.ts` — assert SSE event order around `revised_content` → `done`.
- `src/index.css` — cursor fade transition, label crossfade keyframe, reduced-motion overrides.

## Out of scope

- Council v2 behavior changes (only animation/timing).
- Hypomnema / memory pipeline (already shipped and dormant by design).
- Mobile composer animations (separate phase).

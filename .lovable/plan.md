

# Polish the response streaming animation

Goal: make Luca's responses flow in like a smooth, premium typewriter — no word-bursts, no end-of-message flash, no cursor pop.

## What's wrong today

1. **Bursty reveal**: `useTypewriter` reveals text in fixed 3-character bumps per `requestAnimationFrame`. When the network delivers a 200-char chunk, the typewriter sprints to catch up at full frame rate; when nothing arrives, it sits idle. Result: visible bursts of words.
2. **End-of-message flash**: when streaming finishes, the UI swaps from `<StreamingText displayed=...>` (still mid-typewriter) to the persisted `<MessageContent content=...>` (full markdown, no animation), and re-mounts the wrapper. Markdown re-parses, the cursor vanishes, layout shifts a hair → reads as a flash.
3. **Cursor pop**: `.streaming-cursor-inline` is a hard 1.5px bar that hard-cuts off when streaming ends.
4. **Auto-scroll fights the user**: `scrollTo({behavior:'smooth'})` is fired on every `streamingContent` change — that's many calls per second, which the browser coalesces unevenly and contributes to the "jumpy" sensation.

## Fix plan

### 1. Smooth, rate-limited typewriter (`src/pages/ChatView.tsx`)

Rewrite `useTypewriter` so reveal speed is decoupled from network chunk size:

- Track `targetText` (what the network has delivered) and `displayedText` (what's painted).
- On each `rAF`, advance `displayedText` toward `targetText` by `chars = round(elapsedMs * charsPerMs)` where `charsPerMs ≈ 0.06` (~60 chars/sec, gentle reading pace) — but accelerate gracefully if the buffer gap grows beyond ~200 chars so we don't fall behind on long replies (`charsPerMs` ramps up to ~0.25 when `gap > 400`).
- Stop the rAF loop only when `displayed === target` AND streaming has ended; otherwise idle-loop at low cost.
- This eliminates the bursty "20 words at once" behavior and gives the consistent, premium typing cadence.

### 2. Eliminate the end-of-stream flash

Two changes work together:

- **Keep rendering `<StreamingText>` until the typewriter has fully caught up**, even after `isStreaming` flips to false. Track a local `isFlushing` state inside `StreamingText` that stays true until `displayed.length === content.length`, and have ChatView keep the streaming bubble mounted until the typewriter signals "done" via an `onSettled` callback. Only then does the persisted `MessageContent` take over — by which point both render identical text, so the swap is invisible.
- **Memoize markdown** in `StreamingText` so React doesn't re-parse the entire tree on every keystroke (use `useMemo` keyed on `displayed`). Reduces layout jitter mid-stream.

### 3. Fade the cursor in/out instead of hard-cutting

- Change `.streaming-cursor-inline` from a hard blink to a soft pulse (`opacity: 0.55 → 0.15 → 0.55` over 1.1s, ease-in-out).
- Add a `.streaming-cursor-inline.fading` modifier with `opacity: 0; transition: opacity 240ms ease-out`. When the typewriter catches up to final text, apply `.fading` for 240ms before unmounting.

### 4. Soft message settle-in

- Add a new keyframe `msgSettle` (opacity 0.85→1, no Y-translate) that runs for 320ms when the streaming bubble transitions to its persisted form. Prevents any perceived "snap."
- Keep the existing `msgEnter` for fresh messages.

### 5. Calmer auto-scroll

- Throttle the streaming-content auto-scroll to ~10fps using a ref-based timestamp guard (only call `scrollTo` if >100ms since last scroll, or if the gap from bottom grew past threshold).
- For streaming updates, prefer `el.scrollTop = el.scrollHeight` (instant, no easing fight) instead of `scrollTo({behavior:'smooth'})` — smooth-scroll is appropriate for new messages, instant is better for continuous streams.
- Keep the "near-bottom only" guard.

### 6. Subtle text fade-in for newly revealed characters (optional polish)

Wrap each newly added run of characters in a span with a 180ms opacity fade. Implementation: keep a ref to `prevDisplayed` and on each render, if the new tail is short enough (< 40 chars), wrap the tail in `<span class="char-fade-in">`. CSS animation: `opacity 0 → 1, blur(0.4px) → blur(0)` over 180ms. Falls back gracefully (no fade) for big catch-up bursts.

## Files to change

- `src/pages/ChatView.tsx` — rewrite `useTypewriter`, refactor `StreamingText` (memoized markdown, settle callback, fading cursor, optional char-fade tail), update streaming-bubble JSX to keep mounted until settled, throttle scroll effect.
- `src/index.css` — soften `.streaming-cursor-inline` animation, add `.streaming-cursor-inline.fading`, add `.char-fade-in` keyframe, add `msgSettle` keyframe.

## What the user will experience after

- Text flows in at a steady, readable cadence regardless of how the network delivers it.
- When Luca finishes, the cursor gently fades and the message settles in place — no flash, no jump.
- Long replies still appear quickly (the typewriter accelerates when it falls behind) but never in chunky bursts.
- Scrolling stays composed even during fast streams.


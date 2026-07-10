## Root causes

I traced all three problems to how the newly-inlined SVG interacts with the existing canvas pane.

**1. SVG auto-opens the canvas even though it renders inline.**
`src/pages/ChatView.tsx` (~L1246–1258) runs an effect after every finished turn that auto-opens the canvas for the newest artifact in the thread (Claude/ChatGPT-style). It has no artifact-kind filter, so a new SVG both renders inline via `SvgCard` *and* pops the canvas. Backend prompts do not tell Luca to "open in canvas" — this is purely a frontend heuristic.

**2. Stuck white bar on the right edge.**
`.canvas-pane` is `position: absolute; right: 0; background: var(--canvas)` and is hidden only via `transform: translateX(100%)` when `data-canvas-open` is not set. Two things keep a sliver of it visible after an SVG turn:
- Because of #1, the canvas opens once. On close, transition runs — but the pane still renders `<ArtifactRenderer>` for the last artifact (blank iframe) while `aria-hidden` flips. The `border-left` + shadow + iframe's default white paint leak at the edge.
- The pane always mounts inside `.chat-view` even when `isOpen === false`, so its inner iframe keeps a white background (iframe UA background) while the transform animates.

**3. SVGs go blank when you leave the chat and come back.**
`SvgCard` recomputes `doc` (a full HTML string with the `<svg>` embedded) on every render and passes it to `<iframe srcDoc={doc}>`. When `MessageItem` remounts (route change / virtualisation / thread swap), React mounts a fresh iframe. `srcDoc` with `sandbox=""` (fully-locked, no `allow-same-origin`) is fragile — some Chromium builds skip repainting when the same srcDoc is re-parsed inside a strict sandbox, especially if the iframe momentarily has `0` computed height while its parent is still laying out. Result: white iframe, no SVG.

Bonus: `sandbox=""` denies scripts *and* same-origin. That's fine, but combined with `srcDoc` recomputed as a new string reference every render, React re-fires the `srcDoc` attribute, which in Chromium resets the doc. Under load this yields the blank paint the user sees.

---

## Plan

### A. Stop auto-opening the canvas for inline-rendered kinds
`src/pages/ChatView.tsx` — in the auto-open effect (~L1246–1258), skip when the newest artifact's `kind` is `svg` (and by the same reasoning, `simulation`, which already renders inline via `SimulationCard`). Only pop the canvas for `html`, `react`, `mermaid`, `markdown`.

### B. Fully hide the canvas pane when closed
`src/components/canvas/CanvasPane.tsx` — when `!isOpen`, render `null` (or an empty aside with `display:none`) instead of a full pane with an iframe. This eliminates the white sliver, the shadow bleed, and prevents the last artifact's iframe from painting under the closed state.

Also: guard `startResize` and the ESC listener behind `isOpen` (ESC already is). Keep the store's `activeArtifactId` so reopening still works.

`src/index.css` — belt-and-braces: add `.canvas-pane[aria-hidden="true"] { pointer-events: none; visibility: hidden; }` so even if it renders during the close transition, it can't leak paint after the transform finishes. Use `transitionend` semantics via `visibility` toggled by `aria-hidden`.

### C. Make inline SVGs render reliably every time
`src/components/messages/SvgCard.tsx`:
- Memoise `doc` with `useMemo(() => …, [source])` so the `srcDoc` string identity is stable across re-renders (prevents Chromium from re-parsing on unrelated parent updates).
- Relax the sandbox to `sandbox="allow-same-origin"` — no scripts, still isolated, but Chromium reliably paints the SVG on remount. (SVG is markup, not JS; this is safe and matches how the existing `ImageCard` handles static media.)
- Give the iframe a stable `key={source}` so a genuinely-new SVG forces a fresh mount, while re-renders of the same SVG reuse the same iframe.
- Ensure the frame has an explicit height on first paint: set `height` attr in addition to CSS `min-height` so it never lays out at 0.
- Fallback path: if `view === 'preview'`, also render the raw `<svg>` inline (via `dangerouslySetInnerHTML` on a wrapper `<div>`) behind the iframe — sanitised to strip `<script>`/event handlers first. This is what Claude/ChatGPT do; the iframe is only for isolation, not display fidelity, and having a direct DOM copy guarantees visibility even if the iframe stalls. If we don't want two rendering paths, replace the iframe entirely with sanitised inline SVG. Recommendation: **replace the iframe with sanitised inline SVG** (single source of truth, no reflow blanks, no sandbox quirks) and keep the iframe only inside `MediaLightbox` for full-screen isolation.

Sanitiser is small: strip `<script …>…</script>`, `on*=` attributes, and `javascript:` URLs. Everything else passes through. Live in a new helper `src/lib/sanitizeSvg.ts`.

### D. Verify

1. `bun x tsgo --noEmit` — typecheck clean.
2. `bunx vitest run src/test/artifact*.test.ts src/test/richBodyArtifactSuppression.test.tsx` — existing artifact tests stay green.
3. Add a small unit test `src/test/svgSanitize.test.ts` covering: script tag removed, `onclick` removed, `javascript:` href removed, benign `<svg><circle/></svg>` preserved.
4. Playwright: navigate to the existing SVG thread `/chat/99d22a32…`, screenshot; leave to `/mind`, come back, screenshot. Assert SVG visible in both. Assert no `.canvas-pane` visible when store `isOpen === false` (`getComputedStyle(...).visibility === 'hidden'` or element missing).
5. Manual smoke via console: ask Luca to draw a fresh SVG. Confirm inline card appears, canvas does not auto-open. Click Expand → lightbox opens. Click ExternalLink → canvas opens with same SVG.

### Files touched

- `src/pages/ChatView.tsx` — skip auto-open for inline-rendered artifact kinds.
- `src/components/canvas/CanvasPane.tsx` — early-return `null` when closed.
- `src/components/messages/SvgCard.tsx` — replace iframe with sanitised inline SVG; keep toolbar (Preview/Code/Expand/Canvas); memoise.
- `src/lib/sanitizeSvg.ts` — new tiny sanitiser.
- `src/components/messages/MediaLightbox.tsx` — if it still uses the SVG srcDoc path, switch to the same sanitised inline render for consistency.
- `src/index.css` — add `.canvas-pane[aria-hidden="true"]` visibility rule (defence in depth).
- `src/test/svgSanitize.test.ts` — new.

### Non-goals

- No backend/edge-function changes. Luca's prompts are already agnostic about canvas — nothing tells the model to route SVGs there.
- No changes to how `html`, `react`, `mermaid`, `markdown` artifacts behave — they keep the chip → canvas flow.
- No visual redesign of `SvgCard` beyond making it render reliably.

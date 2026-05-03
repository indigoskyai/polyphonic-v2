## Goal

Bring Luca's code block + artifact display to ChatGPT/Claude-tier polish, and fix the streaming gap where fenced code only appears after the full response lands.

## Problems today

1. **Two markdown renderers.** `ChatView.tsx` defines its own `markdownComponents` + `StreamingText` that render fenced code as a bare `<pre>` (no header, no copy, no syntax highlight). Only the *settled* path uses `RichBody`. So during streaming you get the ugly bare pre; after settle, layout snaps to the styled `code-with-header`. That's the "ugly until done" feeling.
2. **No streaming inside code blocks.** `useSmoothTypewriter` does render token-by-token, but because the in-progress markdown contains an *unclosed* ` ``` ` fence, react-markdown can't parse it as code until the closing fence arrives. Result: code appears as plain prose, then snaps into a code block at the end.
3. **Bare code-block chrome.** `RichBody`'s `CodeBlock` has only a tiny lang tag + text "copy". No filename, no line numbers option, no wrap toggle, no language icon, no proper hover affordances. Inline `copy` text feels amateur.
4. **Weak syntax highlighter.** The hand-rolled regex highlighter covers ~8 languages and misses common ones (python, rust, go, jsx, yaml, diff, bash variants). Token colors are tied to agent identity hues which read muddy on long blocks.
5. **Artifact rendering bare.** `ArtifactRenderer` shows a plain iframe with no toolbar, no Code/Preview toggle, no copy/download/open-in-canvas, no Mermaid support. `ArtifactCard` just embeds the iframe with no framing.
6. **No live artifact during streaming.** Artifacts only appear after the message commits and `loadForThread` reruns.

## Plan

### 1. Unify on `RichBody` everywhere — kill the duplicate renderer

- Delete `markdownComponents`, `MessageContent`, and the inline `code` override in `ChatView.tsx`.
- `StreamingText` now renders via `<RichBody source={displayed} streaming />`.
- Add a `streaming` prop to `RichBody` that:
  - Detects an unclosed fence in the source (odd count of ` ``` ` lines) and **virtually closes it** before passing to react-markdown, so the partial code renders inside a real code block as it streams.
  - Tags the active block so `CodeBlock` can show a subtle live indicator (pulsing dot in the header) instead of the copy button.
- Result: the moment Luca writes ` ```html `, a styled code-with-header card appears and fills in line by line — same chrome as the final state, no snap.

### 2. World-class `CodeBlock` chrome

Rebuild `src/components/rich/RichBody.tsx`'s `CodeBlock`:

```text
┌──────────────────────────────────────────────────────┐
│  ● typescript            wrap  copy  ⋯               │  ← header row
├──────────────────────────────────────────────────────┤
│  1  import { foo } from 'bar';                       │
│  2  …                                                │  ← optional line numbers
└──────────────────────────────────────────────────────┘
```

- Header: language label (lowercase, mono, tracked), small lang dot in agent color, right-side actions: **wrap** toggle, **copy** (icon + tooltip, success state with check icon), overflow `⋯` for **download** + **open in canvas**.
- During streaming: replace copy with a 2-dot pulse indicator labelled `streaming`.
- Body: monospace, configurable wrap, optional line numbers (default on for blocks > 6 lines), max-height ~520px with scroll + a soft fade gradient at the bottom when truncated, "Expand" pill if collapsed.
- ASCII-art branch keeps current behavior but reuses the same header chrome (label = `art`).
- All colors via tokens; no hex.

### 3. Better syntax highlighting

Replace the hand-rolled `syntaxHighlight.ts` with **Shiki** (loaded via `shiki/bundle/web` lazy import) using a single dark theme tuned to match our palette (e.g. `github-dark-dimmed` re-themed via CSS variables). Shiki gives accurate tokenization for ~50 languages including ts/tsx/jsx/python/rust/go/sql/bash/yaml/json/css/html/md/diff/dockerfile.

- Lazy: dynamic `import('shiki')` only on first code block render; cached singleton highlighter.
- Streaming-safe: highlighter is synchronous after init; while warming up, fall back to plain monospace (no flash since chrome is identical).
- Map Shiki's CSS variables to our tokens so colors match `--vektor-full / --anima-full / --luca-full / --text-ghost / --text-secondary` — keeps the brand palette while gaining real grammar coverage.

### 4. Richer inline artifacts

Upgrade `ArtifactRenderer` + `ArtifactCard`:

- **Toolbar** above every artifact: title, kind badge, **Preview / Code** toggle, copy, download (`.html`/`.svg`/`.md`), **Open in canvas** (uses existing `setCurrent` + opens `CanvasPanel`).
- **Mermaid**: add `kind === 'mermaid'` branch; lazy `import('mermaid')`, render to SVG into a div, error state shows source.
- **HTML/React**: keep iframe but frame it with our card chrome (rounded, `--border-faint`, `--surface-2` bg behind), add a subtle "sandboxed" pill, refresh button.
- **Code view**: when toggled, render the artifact's source through the new `CodeBlock` for the same beautiful presentation as inline code.
- Compact `ArtifactCard` (in messages) gets the toolbar collapsed to: title + kind badge + open icon.

### 5. Live artifacts during streaming

In `chat-multi`, artifacts are already extracted and persisted at message-commit time. To show them live:

- During streaming, run a lightweight client-side extractor on `streamingContent` that finds fenced ` ```html `, ` ```svg `, ` ```mermaid `, or ` ```jsx ` blocks ≥ ~30 lines / explicit `// artifact` hint, and renders an inline preview placeholder card (using `ArtifactRenderer` against an in-memory artifact object). Once the message commits, the persisted artifact replaces the placeholder seamlessly (same id key based on hash of content).
- For shorter code blocks: keep them inline as code blocks (no artifact promotion). The threshold is configurable.

### 6. CSS additions (`src/index.css`)

New classes scoped under `.rich-body` and `.artifact-card`:

- `.code-with-header` — refined: subtle inner shadow, header with `--surface-1` bg, 1px `--border-subtle` divider.
- `.code-actions` — flex row, gap 8, icon buttons 22×22, hover `--surface-2`.
- `.code-line-nums` — left gutter, `--text-ghost`, `user-select:none`.
- `.code-fade` — bottom gradient when overflowing.
- `.code-stream-dot` — 2-dot pulse using existing keyframe.
- `.artifact-toolbar` — header row matching code-with-header.
- All values from existing tokens; `prefers-reduced-motion` collapses pulse.

### 7. Verification loop (autonomous)

After each sub-step:

1. `npm run build` clean.
2. Browser sandbox: open `/chat/<existing thread with code>`, screenshot. Confirm: chrome present, syntax highlighted, copy works (programmatic check via clipboard), wrap toggle works.
3. Send a new prompt that asks Luca for a long TS snippet. Watch the stream. Confirm code-with-header appears on first ` ``` ` and fills line-by-line — no plain-prose phase, no late snap.
4. Send a prompt for an HTML particle-sphere artifact (matches the screenshot). Confirm inline artifact card with toolbar, Preview/Code toggle, Open-in-canvas works.
5. Send a Mermaid diagram request. Confirm Mermaid renders.
6. Re-screenshot and compare to ChatGPT/Claude reference for visual parity. Iterate on padding / type scale / icon sizing until clean.
7. Reduced-motion check: pulse stops, transitions ≤ 0ms.
8. Console: 0 new errors.

## Files

**Modified**
- `src/components/rich/RichBody.tsx` — new CodeBlock, streaming-aware, fence auto-close
- `src/components/rich/syntaxHighlight.ts` — replaced by Shiki adapter (`syntaxHighlight.ts` becomes a thin wrapper with `highlightAsync` + sync fallback)
- `src/components/canvas/ArtifactRenderer.tsx` — toolbar, Preview/Code toggle, Mermaid, refresh
- `src/components/canvas/ArtifactCard.tsx` — compact toolbar
- `src/pages/ChatView.tsx` — drop local markdown components, route streaming through RichBody, add live artifact extractor
- `src/index.css` — new code/artifact chrome classes

**New**
- `src/components/rich/highlighter.ts` — Shiki singleton + theme bridge
- `src/lib/streamingArtifacts.ts` — client-side fenced-block extractor
- `src/components/rich/CodeBlock.tsx` — extracted from RichBody for clarity

**Deps**
- `bun add shiki mermaid`

No backend changes. No schema changes.

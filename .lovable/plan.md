## Goal
Render SVG artifacts inline in the chat message (like an image), instead of only showing a chip that opens the canvas.

## Change scope
Frontend/presentation only. No edge functions, no schema changes. SVG generation, persistence, and canvas behavior remain intact — we're changing how the message row displays an `artifact.kind === 'svg'`.

## Approach

In `src/components/canvas/ArtifactChip.tsx`, add an early return for `artifact.kind === 'svg'` that renders an inline SVG card, mirroring how `SimulationCard` is already special-cased on line 24-26.

The inline SVG card will:
- Render the SVG directly in a sandboxed iframe (isolated styles/scripts, same as `SvgCard.tsx` already does), sized responsively with a sensible max-height (~420px) so it feels like an image, not a full canvas.
- Show a light toolbar with: title, "Open in canvas" (reuses `useCanvasStore().open(artifact.id)`), "Expand" (lightbox), and "Copy source" — matching the affordances of image messages and the existing `SvgCard` component.
- Handle the streaming case: while the artifact is mid-stream (`StreamingArtifactChip` path / `version === 0`), keep the "building…" placeholder so we don't render partial markup.

Reuse the existing `src/components/messages/SvgCard.tsx` (already implements the sandboxed iframe + lightbox + code toggle) as the inline renderer. It's currently unused; we'll wire it into `ArtifactChip` for SVGs and add a small "Open in canvas" button to it so the canvas escape hatch is preserved.

## Files to change

1. `src/components/canvas/ArtifactChip.tsx`
   - Special-case `kind === 'svg'` → render `<SvgCard source={artifact.content} title={artifact.title} onOpenCanvas={() => open(artifact.id)} />`.
   - In `StreamingArtifactChip`, keep the current building placeholder for SVGs (don't try to render partial markup).

2. `src/components/messages/SvgCard.tsx`
   - Add optional `onOpenCanvas?: () => void` prop; when provided, render an "Open in canvas" icon button in the toolbar alongside the existing preview/code/expand buttons.
   - Minor: constrain iframe height (e.g. `max-height: 420px`) so it reads as inline media.

3. `src/index.css` (only if needed)
   - Add/tweak `.svg-card` styles for chat context (spacing, border, background) so it visually matches image messages. Existing rules may already suffice — verify before adding.

## Non-goals
- No change to how HTML / React / mermaid / markdown / simulation artifacts render (they still use the chip → canvas flow).
- No backend or extraction changes; the promotion heuristic in `streamingArtifacts.ts` stays the same.
- No change to `ArtifactRenderer` (canvas view) — SVG still opens fully in canvas when the user clicks the escape hatch.

## Verification
- Typecheck.
- Manually confirm in preview: send a prompt that generates an SVG, verify it renders inline (not as a chip), that "Open in canvas" still works, expand opens the lightbox, and code toggle shows source.
- Streaming: while SVG is being generated, the building placeholder appears; on completion it swaps to the inline render without flashing partial markup.

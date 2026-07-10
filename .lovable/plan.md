## Goal

Make inline artifacts (images + SVGs) feel first-class and premium: framing that hugs the content at any aspect ratio, a whisper-soft depth shadow that lifts the artifact off the page, and an enlarged view that behaves like a proper lightbox (centered, floating, dimmed/blurred backdrop) instead of a full-bleed takeover.

## Research summary — what "state of the art" looks like

Studied how ChatGPT, Claude, Linear, Arc, Vercel, Figma, and Apple's Photos handle inline media + expansion:

- **Framing hugs content, not a fixed frame.** No `min-height` placeholder box, no letterboxing bars. The card sizes to the natural aspect ratio of the media, with a modest cap (e.g. max 520px wide, max ~70vh tall). SVGs use their intrinsic viewBox rather than being centered inside a large empty rectangle.
- **Two-shadow depth stack.** Premium apps combine a tight contact shadow (`0 1px 2px rgba(0,0,0,.35)`) with a softer ambient shadow (`0 20px 40px -24px rgba(0,0,0,.55)`) and a hairline top-inner highlight (`inset 0 1px 0 rgba(255,255,255,.04)`). This produces the "floating card" feel without looking heavy. Shadow intensifies subtly on hover.
- **Lightbox, not fullscreen.** The image scales to `min(90vw, natural)` × `min(85vh, natural)`, rounded corners preserved, sits on a **dimmed + blurred** page (backdrop `rgba(0,0,0,.55)` + `backdrop-filter: blur(16px) saturate(120%)`). Toolbar floats above the artifact, not welded to the screen edge. Escape/click-outside dismiss. Spring-scale open (0.96 → 1) over ~220ms.
- **No chrome around the artifact in the lightbox.** The image/SVG itself is the hero; controls are secondary chips above/beside it.
- **Reduced motion respected.** All scale/blur transitions collapse under `prefers-reduced-motion`.

## Changes

### 1. Inline framing — `SvgCard` + `ImageCard` styles (`src/index.css`)

**SVG card (`.svg-card` / `.svg-card-frame`)**
- Remove `min-height: 220px`, `max-height: 480px`, and `padding: 12px` on the frame. Let SVG dictate height via its intrinsic viewBox.
- Frame becomes: `display: block; width: 100%; background: transparent; padding: 0;`
- SVG element: `display: block; width: 100%; height: auto; max-height: 70vh;` (drops the arbitrary 456px cap).
- Card container: keep `max-width: 560px`, add the premium shadow stack (below).

**Image card (`.img-card`)**
- Remove the gradient background (only shows during shimmer). Use `var(--surface-1)` solid, or transparent when image is loaded.
- Keep intrinsic aspect ratio (already correct — `img { width: 100%; height: auto }`), just tighten `max-width` handling so tall portrait images don't exceed ~70vh.

**Shared depth shadow (applied to both `.img-card` and `.svg-card`)**
```css
box-shadow:
  0 1px 2px rgba(0,0,0,0.28),
  0 12px 28px -18px rgba(0,0,0,0.55),
  inset 0 1px 0 rgba(255,255,255,0.035);
```
Hover state deepens the ambient layer slightly:
```css
box-shadow:
  0 1px 2px rgba(0,0,0,0.32),
  0 20px 44px -20px rgba(0,0,0,0.65),
  inset 0 1px 0 rgba(255,255,255,0.05);
```
Transition on `box-shadow` at `var(--dur-med) var(--ease-out)`. Keep the existing 1px subtle border for edge definition.

### 2. Toolbar polish (`SvgCard.tsx` — presentation only)

- Toolbar background stays, but reduce visual weight: `background: transparent; border-bottom: 1px solid var(--border-faint);` so the shadow reads as the primary frame, not the toolbar bar.

### 3. Lightbox — `.media-lightbox*` in `src/index.css` + `MediaLightbox.tsx`

**Backdrop**
- Change from `rgba(0,0,0,0.85)` opaque overlay to a true glass backdrop:
  `background: rgba(6,6,8,0.55); backdrop-filter: blur(18px) saturate(120%);`
- This dims *and* blurs the page beneath instead of hiding it entirely — matches Apple/Arc/Linear behaviour.

**Stage + media**
- Media size cap: `max-width: min(1200px, 90vw); max-height: 85vh; width: auto; height: auto;` — this is the "standard world-class lightbox size" (Apple Photos, ChatGPT vision viewer). No forced scaling up; small artifacts stay small and centered.
- Add rounded corners (`var(--radius-md)`) + strong floating shadow:
  `box-shadow: 0 40px 100px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06);`
- Open animation: `transform: scale(0.96) → scale(1)` + opacity fade, `var(--dur-med) var(--ease-out)`. Backdrop fades independently.
- SVG in lightbox: `.media-lightbox-svg { max-width: min(1200px, 90vw); max-height: 85vh; }` (currently fixed to `90vw × 85vh` which stretches small SVGs — switch to intrinsic sizing with a cap).

**Toolbar**
- Float toolbar above the artifact (top-right of the media, not screen edge) via a wrapper `<div class="media-lightbox-shell">` that holds both toolbar and stage. This is how Figma/Linear handle it — controls travel with the content.

### 4. Reduced motion

- Add `@media (prefers-reduced-motion: reduce) { .media-lightbox, .media-lightbox-shell { animation: none; transform: none; } }`.

## Files touched

- `src/index.css` — `.img-card`, `.img-card:hover`, `.svg-card`, `.svg-card-frame`, `.svg-card-frame > svg`, `.svg-card-toolbar`, `.media-lightbox`, `.media-lightbox-stage`, `.media-lightbox-img`, `.media-lightbox-svg`, add `.media-lightbox-shell` + reduced-motion block.
- `src/components/messages/MediaLightbox.tsx` — wrap toolbar + stage in `.media-lightbox-shell`; SVG container uses natural sizing.
- `src/components/messages/SvgCard.tsx` — no structural change beyond removing the inline `min-height`/`display: flex` styling now handled via CSS.

No component logic, no store changes, no backend work. Purely presentation.

## Verification

- Playwright on `/chat/...`: load a thread with a wide landscape SVG, a tall portrait SVG, and a small square image. Confirm each hugs its aspect ratio, no letterboxing bars, subtle shadow visible.
- Click expand → lightbox opens with dimmed+blurred (not opaque) backdrop, artifact centered at `min(1200px, 90vw) × 85vh`, page still faintly visible behind blur.
- Escape / click-outside dismiss. Hover over card — shadow deepens smoothly.
- `prefers-reduced-motion: reduce` emulation — no scale/blur animation on open.
- Typecheck + existing `svgSanitize` test remain green.

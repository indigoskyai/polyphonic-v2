## Fixes

### 1. Lightbox renders empty — size the content, not the shell

The shell has `max-width/max-height` but no width, and `.media-lightbox-svg` has `width: auto !important`, so the inline SVG collapses to 0×0. Fix by letting each media type carry its own sizing and having the shell hug it.

**`src/index.css`**
- `.media-lightbox-shell`: remove `max-width`/`max-height`; keep it as an `inline-flex` wrapper that hugs its child (`display: inline-flex; flex-direction: column;`). Toolbar stays absolutely positioned relative to it.
- `.media-lightbox-svg`: change to explicit sizing — `width: min(1000px, 90vw); max-height: 85vh; padding: 24px;` and inner `> svg { width: 100%; height: auto; max-height: calc(85vh - 48px); }`. Drop the `!important` overrides.
- `.media-lightbox-img`: unchanged max caps (`max-width: min(1200px, 90vw); max-height: 85vh`); images have intrinsic dimensions so they size themselves.
- `.media-lightbox-stage`: remove — the shell now IS the stage. Or keep as a thin `display: contents` wrapper.

### 2. Clicking the SVG artifact opens the lightbox

**`src/components/messages/SvgCard.tsx`**
- Add `onClick={() => setOpen(true)}` + `role="button"` + `tabIndex={0}` + Enter/Space keyboard handler + `cursor: zoom-in` on `.svg-card-frame`.
- Stop propagation on toolbar buttons so clicking Code/Preview/Expand/Canvas doesn't double-fire the frame open (Expand still works — it also sets open, redundant but harmless).
- Add `cursor: zoom-in` styling to `.svg-card-frame` in `src/index.css`.

### 3. Verify

- Playwright: open a thread with an SVG artifact. Click anywhere on the SVG → lightbox opens with SVG visible, centered, ~1000px wide, dimmed+blurred backdrop, toolbar top-right of the artifact. Click expand icon → same result. Escape / backdrop click dismiss.
- Click an image artifact → same lightbox behavior with actual pixels rendered.
- Typecheck clean.

## Files touched

- `src/index.css` — `.media-lightbox-shell`, `.media-lightbox-svg`, `.media-lightbox-stage`, `.svg-card-frame`.
- `src/components/messages/SvgCard.tsx` — clickable frame with keyboard support; stop-propagation on toolbar.

No backend or store changes.

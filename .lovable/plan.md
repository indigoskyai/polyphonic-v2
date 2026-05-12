# Plan: Larger, viewport-aware particle field on mobile

## Problem

In `src/pages/ChatView.tsx` (line 1816), the mobile `ExpressiveField` is sized as:

```ts
size={Math.min(260, Math.round(window.innerWidth * 0.62))}
```

On a 390px-wide iPhone this caps at ~241px. The user wants it close to 2× that, matching the circle they drew (~340–360px on a 390px viewport, leaving a small breathing margin on each side). The size should also adapt live to any phone width/height, not be a fixed constant.

## Approach

Replace the one-shot `window.innerWidth` calculation with a small reactive hook that recomputes on viewport changes and respects both width and height so the sphere never collides with the app bar or composer.

### 1. Compute size from both dimensions

Formula:

```
size = clamp( min(viewportW * 0.88, viewportH * 0.48), 220, 460 )
```

- `0.88 * width` → leaves ~6% margin on each side (matches the user's drawn circle)
- `0.48 * height` → guarantees room for top app bar + wordmark + composer on short phones (e.g. iPhone SE)
- Floor 220px so it never collapses on tiny screens; ceiling 460px so on large foldables it doesn't overshoot the desktop size

On a 390×844 iPhone 14 Pro this yields **343px** (~2× the current 241px), matching the screenshot reference.

### 2. Make it reactive

Add a tiny inline hook (or `useEffect` + `useState`) at the top of `ChatView` that:

- Initializes from `window.innerWidth/innerHeight`
- Subscribes to `window.resize` and `window.visualViewport` `resize` events
- Returns the computed size

Used only in the mobile branch; desktop branch keeps `size={440}`.

### 3. Reposition the wordmark

Currently the sphere is positioned at `top: 46%` and the wordmark at `top: 82%`. With a sphere ~100px taller, the wordmark may collide. Adjust the sphere `top` to `~42%` and wordmark `top` to `~86%` (or compute wordmark offset from sphere size). Verify visually at 390×844 and 375×667 (iPhone SE) viewports.

## Files to change

- `src/pages/ChatView.tsx` — add reactive size hook; swap the mobile `size` prop; nudge wordmark/sphere vertical positions if needed.

No CSS, no engine, no other files affected. Particle count is left at the engine default (the engine already DPI-scales the canvas, so doubling the CSS size doesn't change particle count — the field just renders larger and feels denser, which is what the screenshot shows).

## Verification

- Resize preview to 390×844, 375×667, 414×896, and 360×800 — sphere should always have a visible margin on both sides and never touch the app bar or composer.
- Rotate / open keyboard (visualViewport shrink) — sphere should shrink accordingly, not overflow.

## What's wrong (image 1)

Three different darks are stacked on top of each other on iOS Safari:

```
┌──────────────────────────┐  Safari status bar — #08080a (theme-color, --floor)
├──────────────────────────┤  ← visible seam
│   Polyphonic / LUCA…     │  mobile app bar — color-mix(canvas, +6% black) ≈ #0e0d0f, plus 1px border
├──────────────────────────┤  ← visible seam
│                          │
│        (sphere)          │  app canvas — #0f0e11 (--canvas)
│       polyphonic         │
│                          │
├──────────────────────────┤
│   composer pill          │
├──────────────────────────┤
│ safe-area inset          │  body fallback — #08080a (--floor) again
├──────────────────────────┤  ← visible seam
│   Safari URL bar         │  Safari chrome — #08080a (theme-color)
└──────────────────────────┘
```

ChatGPT (image 2) collapses all of this into one color. We do the same.

## Fix

### 1. One color for the whole vertical stack on mobile

- Pick `--canvas` (#0f0e11) as the single mobile surface color (it's the larger area; matching app to chrome rather than chrome to app).
- `index.html` `<meta name="theme-color">` → `#0f0e11` (also update boot-shell `background` and `html, body` background in the inline `<style>`, plus `.boot-shell` background).
- Add a `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f0e11">` for completeness.

### 2. Flatten the mobile app bar

In `src/index.css` `.mobile-app-bar`:
- `background: var(--canvas)` (drop the color-mix darkening).
- Remove `border-bottom` (replace with nothing — let it bleed into the canvas; the title typography is enough separation).
- Keep the safe-area top padding as-is.

### 3. Flatten the composer footer band

- Ensure the composer outer wrapper on mobile uses `background: var(--canvas)` (or transparent over a canvas body) so the safe-area-inset-bottom region matches everything else.
- Audit the mobile composer wrap classes (`.chat-empty-composer`, `.m-composer-wrap` and any `padding-bottom: env(safe-area-inset-bottom)` rule near the composer) and confirm none paint a darker band.

### 4. Body / root fallback

- `index.html` inline style: `html, body { background: #0f0e11 }` (was `#08080a`).
- Confirm no `body { background: var(--floor) }` rule overrides on mobile in `index.css`.

### 5. Mobile typography & proportion polish (industry standards)

- **App bar title** (`.mobile-bar-title-main`): 17px → keep; tighten letter-spacing to `-0.01em` for SF-Pro-like optical balance.
- **App bar subtitle** (`.mobile-bar-title-sub`): 9px mono caps → 10px, opacity slightly lifted (`--text-soft` instead of `--text-ghost`) so "LUCA · OPUS 4.7" doesn't look ghosted.
- **Bar height**: 56px → 52px content area (Apple HIG nav-bar standard) plus safe-area inset; removes top-heavy feel.
- **"polyphonic" wordmark** on mobile: currently sized for the desktop hero — reduce to ~26px and tighten letter-spacing to match Apple/OpenAI minimalism. Also reduce its opacity slightly so the sphere stays the hero.
- **Sphere size on mobile**: confirm it scales to ~min(62vw, 280px) so it sits visually centered with breathing room above the wordmark.
- **Composer input font-size**: enforce `16px` minimum on the mobile input (prevents iOS auto-zoom on focus — production-grade requirement).
- **Composer pill**: increase border-radius slightly (24px → matches iOS messaging affordance), keep border at 1px `var(--border-subtle)`.
- **Vertical rhythm** in the empty hero: sphere center at ~42% of available height, wordmark at ~76%, composer flush to bottom — the "balanced distribution" you described, but tuned to Apple's optical-center conventions (true center reads as low because of the composer weight).

### 6. Status-bar text color

- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` so when added to home screen the status bar text stays light over the unified dark.

## Files touched (all frontend, no backend)

- `index.html` — theme-color, status-bar-style, inline boot-shell background.
- `src/index.css` — `.mobile-app-bar` (background, remove border, height), `.mobile-bar-title-main/-sub` (size, color, tracking), composer mobile padding, ensure body bg matches.
- `src/pages/ChatView.tsx` — mobile branch of the empty hero: sphere size token, wordmark size, vertical positioning percentages, composer input font-size guard.

## Verification

1. Reload on iPhone Safari → screenshot top + bottom: status bar, app bar, canvas, composer, safe-area, URL bar all read as one continuous `#0f0e11`.
2. No visible seam lines between Safari chrome and app surface.
3. Tap composer → no iOS auto-zoom (16px input enforced).
4. Sphere + wordmark + composer feel optically balanced at 390×844 and 430×932 (iPhone 16 Pro Max).
5. Existing desktop layout untouched.

## Out of scope

No backend, no edge functions, no schema changes. Pure frontend cohesion + typography pass.

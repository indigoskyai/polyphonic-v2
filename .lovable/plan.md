# Mobile Safari polish — seamless surface + stable composer

Two distinct iOS Safari issues, one root cause each.

## Issue 1 — Top/bottom bars don't match the page

On iOS Safari, the strip behind the status bar (clock/battery) and the strip behind the home-indicator / URL bar are NOT part of our React tree. Safari paints them itself, sampling color from two places:

1. `<meta name="theme-color">` (used for the URL bar tint)
2. The `<html>` element's background color (used for the safe-area extension when content scrolls under it with `viewport-fit=cover`)

Right now our tokens mismatch:

- `--canvas` = `#0f0e11` → used by `theme-color`, `html`/`body`, and the mobile app-shell
- `--floor`  = `#08080a` → used by `LandingPage` background and most full-screen page surfaces

So Safari paints the chrome strips in `#0f0e11` while the actual page paints in `#08080a`. Two slightly different blacks → the seam Riley sees in IMG_3100/IMG_3101.

**Fix:** pick one black for the entire mobile surface and force everything that touches an edge to it. Choosing `--floor` (#08080a) because it's what LandingPage + most chrome already use.

Changes:
- `index.html` — `<meta name="theme-color">` from `#0f0e11` → `#08080a` (both the plain and `prefers-color-scheme: dark` variants). Also update the inline boot-shell `background` to match.
- `src/index.css` — at the mobile breakpoint (`@media (max-width: 767px)`), force `html`, `body`, `#root`, and `.app-shell[data-mobile="true"]` to `background: #08080a` (i.e. `var(--floor)`). Add `background-color: var(--floor)` to `html` globally as a safe baseline so Safari's safe-area fill never differs.
- Audit the three surfaces visible on mobile (`LandingPage`, `ChatView` landing state, `ChatView` conversation state) — anything using `var(--canvas)` as a full-bleed background on mobile gets switched to `var(--floor)`. The mobile app-bar (`.mobile-app-bar`) also moves from `--canvas` → `--floor`.
- Add `overscroll-behavior-y: none` on `html, body` so the iOS rubber-band reveal at the top/bottom doesn't expose a different color underneath.

## Issue 2 — Composer flies to the top of the screen on tap

Default iOS Safari behavior when an `<input>` is focused:
1. Keyboard slides up
2. The visual viewport shrinks
3. Safari auto-scrolls the page so the focused input is visible — but because our composer was already pinned to the bottom of a `100vh` flex column, "visible" gets interpreted as "pull the whole page upward," which is what we see in IMG_3100.

The fix is to take the composer off the document flow on mobile and anchor it to the **visual viewport** so it rides exactly on top of the keyboard without the page scrolling.

Changes in `src/components/mobile/MobileComposer.tsx` + `.m-composer-wrap` CSS:

- Make `.m-composer-wrap` `position: fixed; left: 0; right: 0; bottom: 0;` with `padding-bottom: max(env(safe-area-inset-bottom), 12px)` so it sits flush above the home indicator when no keyboard.
- Add a small JS hook (inside `MobileComposer`) that subscribes to `window.visualViewport`'s `resize` and `scroll` events and writes the current keyboard offset to a CSS custom property on the wrapper:
  ```
  const vv = window.visualViewport;
  const offset = window.innerHeight - (vv.height + vv.offsetTop);
  el.style.setProperty('--kb-offset', `${Math.max(0, offset)}px`);
  ```
  Then `.m-composer-wrap` uses `transform: translateY(calc(var(--kb-offset, 0px) * -1))` to ride above the keyboard.
- Use `100dvh` (already in place in some spots, audit and replace any remaining `100vh` in mobile chat view) so the page itself doesn't resize when the keyboard opens.
- Add `scroll-padding-bottom` on the messages scroller equal to composer height + keyboard height so the last message stays visible while typing.
- Reserve space at the bottom of the messages scroller equal to composer height so content is never hidden behind the fixed composer.

This combination is the standard iOS PWA pattern (used by ChatGPT, Claude, Linear's mobile web): page never scrolls on focus, composer stays glued to the keyboard.

## Verification

Cannot test the iOS chrome directly in the sandbox (Riley's point — those areas only exist on the device). Verification plan:

1. Sandbox preview at 390×844: confirm the composer is now `position: fixed`, sits at the bottom, no layout shift on focus, no element above the messages list jumps.
2. Computed-style check: `getComputedStyle(document.documentElement).backgroundColor` returns `rgb(8, 8, 10)` on mobile.
3. Riley reloads `polyphonic.chat` on iPhone after publish: status bar strip and home-indicator strip should be visually indistinguishable from the page; tapping the composer should not move the composer or scroll the page.

## Files touched

- `index.html` (theme-color + boot-shell bg)
- `src/index.css` (html bg baseline, mobile overrides, `.m-composer-wrap` fixed positioning + safe-area, `.mobile-app-bar` color)
- `src/components/mobile/MobileComposer.tsx` (visualViewport hook for `--kb-offset`)
- `src/pages/ChatView.tsx` + `src/pages/LandingPage.tsx` (only mobile-conditional bg fixes — switch `--canvas` → `--floor` on full-bleed wrappers)

No backend changes. No data model changes. Pure presentation.

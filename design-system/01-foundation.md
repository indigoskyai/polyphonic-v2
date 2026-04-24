# Phase 01 — Foundation Tokens

## Goal

Lock the canonical design system into `src/index.css`. Every subsequent phase references these tokens. After this phase: surface palette is mathematically locked (B = R × 1.20 ratio), text spectrum has 10 readable tiers, semantic accents (green/amber/red) have full bg/border/dot/glow variants, agent identity tokens exist in both monochrome (default) and full-color (identity-rich context) variants, motion vocabulary is consistent (180/300/320/380ms with two ease curves), shadows have an inset rim highlight on every panel.

## Dependencies

None. This is the bedrock.

## Files to create/modify

- `src/index.css` — `:root` block (lines ~14-122). Replace existing token block with the canonical set below.

## Tasks

### 1.1 — Surface palette (temperature-locked v4)

- [ ] Replace the surface tokens in `:root` with this block:
```css
/* Surfaces v4 — temperature-locked, B = R × 1.20 ratio */
--floor:     #0a0a0c;  /* RGB 10,10,12  — outer chrome, rail, scene nav */
--canvas:    #0e0e11;  /* RGB 14,14,17  — main background, inset panels */
--surface-1: #121216;  /* RGB 18,18,22  — cards, inputs, data rows */
--surface-2: #16161a;  /* RGB 22,22,26  — hover state on cards */
--surface-3: #1a1a1f;  /* RGB 26,26,31  — modals, popovers, segment selected */
--surface-4: #1e1e24;  /* RGB 30,30,36  — tooltips on overlays */
--surface-5: #222229;  /* RGB 34,34,41  — top elevation */
```
- [ ] Keep legacy aliases for backward compat (do NOT remove these — used across existing code):
```css
--bg-void:          var(--canvas);
--bg-deep:          var(--floor);
--bg-primary:       var(--canvas);
--bg-elevated:      var(--surface-1);
--bg-surface:       rgba(220, 219, 216, 0.04);
--bg-surface-hover: rgba(220, 219, 216, 0.07);
--bg-glass:         rgba(14, 14, 17, 0.88);
```

### 1.2 — Text hierarchy (warm cream, 10 tiers)

- [ ] Replace text tokens. Riley confirmed `--text-ghost: 0.36` and `--text-whisper: 0.22` (slightly brighter than mockup defaults) for standalone subtitle legibility:
```css
--ink:             rgba(244, 243, 240, 0.93);  /* HIGHEST — Riley's brightness cap */
--text-primary:    rgba(244, 243, 240, 0.90);  /* Body, headings */
--text-body:       rgba(210, 208, 204, 0.72);  /* Secondary content */
--text-mid:        rgba(194, 192, 188, 0.60);  /* Sub-headings, hints */
--text-secondary:  rgba(194, 192, 188, 0.58);  /* Entry content, card labels */
--text-soft:       rgba(161, 159, 155, 0.44);  /* Mono labels, agent names */
--text-tertiary:   rgba(161, 159, 155, 0.34);  /* Inactive button text */
--text-faint:      rgba(178, 176, 172, 0.30);  /* Empty-state text */
--text-ghost:      rgba(178, 176, 172, 0.36);  /* Section labels, subtitles */
--text-whisper:    rgba(178, 176, 172, 0.22);  /* Timestamps, smallest meta */
```

### 1.3 — Border ladder (cream, 5 levels)

- [ ] Set borders:
```css
--border:         rgba(220, 219, 216, 0.08);    /* Default divider */
--border-subtle:  rgba(220, 219, 216, 0.06);    /* Soft separator */
--border-faint:   rgba(220, 219, 216, 0.045);   /* Minimal */
--border-strong:  rgba(220, 219, 216, 0.12);    /* Hover/active emphasis */
--border-focus:   rgba(228, 225, 220, 0.18);    /* Focus indication */
```

### 1.4 — Translucent overlays

- [ ] Set overlays:
```css
--overlay-hover:    rgba(220, 219, 216, 0.04);
--overlay-active:   rgba(220, 219, 216, 0.07);
--overlay-selected: rgba(220, 219, 216, 0.10);
```

### 1.5 — Agent identity tokens (dual: monochrome default + full-color identity)

- [ ] Set both flavors. Existing `--luca: #c9a87c` STAYS for backward compat (5 files use it). Add new `--agent-*` tokens for new entry components:
```css
/* Monochrome cream defaults — used in dot indicators, neutral contexts */
--agent-luca:     rgba(244, 243, 240, 0.72);
--agent-vektor:   rgba(244, 243, 240, 0.72);
--agent-anima:    rgba(244, 243, 240, 0.72);
--agent-observer: rgba(244, 243, 240, 0.72);
--agent-neutral:  rgba(244, 243, 240, 0.62);

/* Full-color identity — used in identity-rich contexts only:
   group session voice room, agent settings page, identity pills */
--luca-full:   #c9a87c;  /* warm tan */
--vektor-full: #7ca8c9;  /* cool blue */
--anima-full:  #c97ca8;  /* magenta */

/* Sub-agent vektor family (blue spectrum) */
--v1: rgba(124, 168, 201, 1);  --v1-dim: rgba(124, 168, 201, 0.08);  --v1-mid: rgba(124, 168, 201, 0.35);
--v2: rgba(100, 145, 180, 1);  --v2-dim: rgba(100, 145, 180, 0.08);  --v2-mid: rgba(100, 145, 180, 0.35);
--v3: rgba(148, 190, 218, 1);  --v3-dim: rgba(148, 190, 218, 0.08);  --v3-mid: rgba(148, 190, 218, 0.35);

/* Legacy — keep */
--luca: #c9a87c;
--guardian: #8ca89c;
```

### 1.6 — Semantic accents (green/amber/red with full variant set)

- [ ] Set accent tokens. The bg/border/dot/glow ladder makes downstream usage trivial:
```css
--green-accent: #4ade80;
--green-bg:     rgba(74, 222, 128, 0.06);
--green-border: rgba(74, 222, 128, 0.18);
--green-glow:   0 0 8px rgba(74, 222, 128, 0.5);

--amber-accent: #d9a744;  /* SOFTER than #fbbf24 — phase-2 audit decision */
--amber-bg:     rgba(217, 167, 68, 0.08);
--amber-border: rgba(217, 167, 68, 0.20);
--amber-glow:   0 0 6px rgba(217, 167, 68, 0.5);
--amber-halo-1: 0 0 0 4px rgba(217, 167, 68, 0.14);  /* checkpoint dot inner */
--amber-halo-2: 0 0 0 7px rgba(217, 167, 68, 0.05);  /* checkpoint dot outer */

--red-accent:   #f87171;
--red-bg:       rgba(248, 113, 113, 0.06);
--red-border:   rgba(248, 113, 113, 0.18);
```

### 1.7 — Geometry

- [ ] Set radii + layout sizes:
```css
--radius-sm:    6px;
--radius-md:    10px;
--radius-lg:    14px;
--radius-xl:    18px;   /* command palette, large cards */
--radius-pill:  999px;  /* all pill buttons */
--radius-inset: 16px;   /* inset panel top corners */

--rail-width:        40px;
--sidebar-width:     220px;
--drawer-width:      420px;
--message-max-width: 720px;
--inset-gap:         6px;
--devbar-height:     0px;  /* polyphonic-v2 has no devbar; keep var for code that references it */
```

### 1.8 — Typography stack

- [ ] Set font tokens:
```css
--font-sans:      'Switzer', -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif;
--font-grotesque: var(--font-sans);
--font-mono:      'JetBrains Mono', 'SF Mono', 'Geist Mono', 'Fira Code', ui-monospace, monospace;
--font-serif:     'Instrument Serif', serif;
```
- [ ] Letter-spacing scale:
```css
--track-tight:   -0.02em;
--track-display: -0.01em;
--track-body:     0.003em;
--track-ui:       0.01em;
--track-mono:     0.04em;
--track-meta:     0.08em;
--track-folio:    0.14em;
```

### 1.9 — Motion

- [ ] Set easing + duration:
```css
--ease-out:     cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-premium: cubic-bezier(0.22, 1, 0.36, 1);

--dur-micro:   120ms;
--dur-fast:    180ms;
--dur-normal:  300ms;
--dur-settle:  320ms;
--dur-drawer:  380ms;
--dur-slow:    500ms;
```

### 1.10 — Shadow system (with inset rim highlight)

- [ ] Set shadows. The `--shadow-inset-highlight` is the magic that makes panels feel lit-from-above:
```css
--shadow-inset-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.025);
--shadow-panel:           0 1px 2px rgba(0, 0, 0, 0.30), 0 6px 16px rgba(0, 0, 0, 0.25);
--shadow-popover:         0 4px 12px rgba(0, 0, 0, 0.35);
--shadow-modal:           0 8px 24px rgba(0, 0, 0, 0.40), 0 16px 48px rgba(0, 0, 0, 0.30);
--shadow-palette:         0 12px 40px rgba(0, 0, 0, 0.55), 0 24px 80px rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.04);
--shadow-drawer-near:    -12px 0 32px rgba(0, 0, 0, 0.38);
--shadow-drawer-far:     -24px 0 64px rgba(0, 0, 0, 0.22);

--focus-ring: 0 0 0 2px rgba(244, 243, 240, 0.12), 0 0 0 4px rgba(244, 243, 240, 0.04);

--backdrop-tint: rgba(0, 0, 0, 0.26);
--backdrop-blur: 2px;
```

### 1.11 — Universal inset panel rim highlight

- [ ] Apply the rim highlight to every inset panel. In `src/App.tsx` and `src/components/Sidebar.tsx`, the inline `boxShadow` for the panel containers should include `var(--shadow-inset-highlight)` along with `var(--shadow-panel)`. Use the existing usage pattern; just augment.

### 1.12 — Global typography polish

- [ ] Add to `:root` selector or a base layer:
```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
}

::selection { background: rgba(220, 219, 216, 0.14); color: var(--ink); }
::placeholder { color: rgba(132, 130, 126, 0.38); font-weight: 400; }

/* Tabular numerals on all mono contexts */
.font-mono, code, pre, kbd, samp,
[class*="folio"], [class*="time"], [class*="count"],
[class*="meta"], [class*="coord"], [class*="stat"],
[class*="-num"], [class*="numeric"] {
  font-variant-numeric: tabular-nums;
}

*:focus { outline: none; }
*:focus-visible { box-shadow: var(--focus-ring); border-radius: inherit; }
```

### 1.13 — Custom scrollbar

- [ ] Add scrollbar styling:
```css
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(220, 219, 216, 0.06); border-radius: 999px; transition: background 180ms ease-out; }
::-webkit-scrollbar-thumb:hover { background: rgba(220, 219, 216, 0.12); }
* { scrollbar-width: thin; scrollbar-color: rgba(220, 219, 216, 0.06) transparent; }
```

### 1.14 — Reduced-motion guard (verify, already exists)

- [ ] Verify the existing `@media (prefers-reduced-motion: reduce)` rule at the bottom of `index.css` collapses all transitions/animations. If absent, add:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Verification

1. **Visual smoke test:** Reload `/mind`. Every text tier should remain legible. Specifically check the Thoughts subtitle "Luca's live working stream — reflections, questions, observations as they happen." — it should be readable but not bright.
2. **Computed-style audit:** Via Playwright `browser_evaluate`:
   ```js
   () => {
     const r = getComputedStyle(document.documentElement);
     return {
       ink: r.getPropertyValue('--ink').trim(),
       primary: r.getPropertyValue('--text-primary').trim(),
       ghost: r.getPropertyValue('--text-ghost').trim(),
       greenAccent: r.getPropertyValue('--green-accent').trim(),
       amberHalo1: r.getPropertyValue('--amber-halo-1').trim(),
       drawerWidth: r.getPropertyValue('--drawer-width').trim(),
     };
   }
   ```
   Assert all expected values present.
3. **Inset rim highlight:** Take a screenshot of `/chat`. There should be a barely-visible 1px white rim along the top edge of the sidebar and main panel. If not visible, check `box-shadow` on those elements includes `var(--shadow-inset-highlight)`.
4. **Reduced-motion:** Enable via Chrome DevTools (or Playwright emulation). Confirm no animations on hover.
5. **Console:** 0 new errors.

## Backend asks

None.

## Commit

```
phase 01: foundation tokens — canonical surface/text/border/agent/accent/motion/shadow

- src/index.css :root replaced with locked token set per phase-2
  mockup audits + Riley's adjustments (--text-ghost 0.36 + --text-whisper
  0.22 for standalone subtitle legibility)
- All semantic accents have bg/border/dot/glow variants
- Agent identity tokens dual-track: --agent-* monochrome default,
  --*-full color identity tokens for identity-rich contexts
- Inset rim highlight (--shadow-inset-highlight) added; applied to
  Sidebar + Main inset panels in App.tsx
- Custom scrollbar, focus ring, font features, tabular nums, reduced
  motion guard verified

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

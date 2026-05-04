
## Goal

Two things, in one pass:

1. **Kill Instrument Serif everywhere.** Replace it with the existing sans stack so headings, profile names, italic pull-quotes, and decorative numerals all match a single, refined hierarchy — Linear / Claude / ChatGPT-grade consistency.
2. **Stub the public-profile / canvas work** behind a "Social intelligence — coming soon" cover. Keep the code in place (so we can resume later) but don't expose it.

---

## Part 1 — Typography standardization

### The rule (single source of truth)

We collapse to **two families** plus weights:

- `--font-sans` (Switzer / Inter fallback) — every heading, body, label, value, italic accent. **Default for everything.**
- `--font-mono` (JetBrains Mono) — section labels (`§ 04`), telemetry, code, KBD, timestamps, anything that today reads as `text-mono` / uppercase tracked.

`--font-serif` is **deleted** as a token and the Google Fonts import for Instrument Serif is removed. Italics that previously leaned on the serif become **sans italic at the same size** (Switzer has a true italic) — the contrast is now weight + italic, not family-switch.

### Hierarchy (applied consistently across Settings, Profile/Mind, Workspace, Canvas overlays)

| Role | Family | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | sans | 32–42 | 450 | -0.02em | Page titles ("Public profile", "Identity", "Skills") |
| H2 | sans | 22 | 500 | -0.015em | Section heads inside a page |
| H3 | sans | 16 | 500 | -0.005em | Card titles |
| Body | sans | 14 | 400 | 0.003em | Paragraphs, inputs |
| Body-sm | sans | 13 | 400 | 0.003em | Secondary copy |
| Meta | mono | 10–11 | 400 | 0.08em, UPPERCASE | `§ 09`, "YOUR HANDLE", labels |
| Numeric / value | mono | varies | 400 | 0.04em | Stats, telemetry, hex codes |
| Quote / accent | sans **italic** | matches body | 400 | 0.003em | Replaces every serif-italic pull-quote |

### Concrete code changes

- **`src/index.css`**
  - Remove `@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif…')` (line 2).
  - Remove `--font-serif` token (line 166).
  - Audit the canonical type-scale block (lines 177+) and confirm no role references serif; if any do, swap to sans.
- **All call sites** (sweep + replace): files containing `var(--font-serif)` / `Instrument Serif` / `font-serif`:
  - `src/pages/ProfileView.tsx` (6 spots)
  - `src/pages/ProfileIdentityView.tsx` (2)
  - `src/pages/ProfileSkillsView.tsx` (2)
  - `src/pages/ProfileScheduleView.tsx` (1)
  - `src/pages/ProfileRevisionsView.tsx` (1)
  - `src/pages/WorkspaceView.tsx` (1)
  - `src/pages/PublicProfileView.tsx` (4)
  - `src/pages/settings/PublicProfileSettings.tsx` (1)
  - `src/components/profile/viz.tsx` (9, including SVG `fontFamily="var(--font-serif)"`)
  - `src/components/Rail.tsx` (1)
  - `src/components/canvas/CanvasPanel.tsx` (1)
  - `src/components/canvas/ArtifactRenderer.tsx` (1)
  - `src/components/canvas-profile/canvas.css` (4)
  - `src/components/canvas-profile/StarterLayoutPicker.tsx` (2)

  For each: remove `fontFamily: 'var(--font-serif)'` (inherit sans) and remove `fontStyle: 'italic'` **only** where the italic was purely decorative — keep italic on true emphasis (pull-quotes, taglines) since Switzer italic still reads as a soft accent. Default rule: **keep italic, drop family**.

- **`src/components/profile/viz.tsx` header comment** — update the docstring that lists "serif (--font-serif, Instrument Serif)" so future contributors don't reach for it.

### Profile/Mind consistency pass (the "multiple fonts on one page" complaint)

While doing the sweep, on each Mind tab (`PortraitMind`, `EmotionsMind`, `CognitionMind`, `RelationshipsMind`, `ValuesMind`, `ShadowMind`, `GrowthMind`, `CommunicationMind`) verify section heads, card titles, and inline values all map to the role table above. Any one-off `fontSize` / `fontWeight` that drifts from the table gets pulled into a role. No new tokens — just enforce the existing scale.

---

## Part 2 — Stub the public-profile feature

We **do not delete** the work — it's freshly built and we'll resume. We hide every entry point behind a cover.

### Cover component

New `src/components/common/ComingSoonCover.tsx` — full-surface dark panel:

```text
┌───────────────────────────────────┐
│                                   │
│          § coming soon            │   ← mono meta
│                                   │
│       Social intelligence         │   ← sans display, 36
│                                   │
│   Public profiles, shareable      │   ← sans body-sm, --text-soft
│   canvases, and handle claiming   │
│   are on the roadmap.             │
│                                   │
└───────────────────────────────────┘
```

Centered, monochromatic, no buttons. Optional `subtitle` prop so the same component covers different surfaces with the right copy.

### Where the cover gets mounted

- **`src/pages/settings/PublicProfileSettings.tsx`** — render `<ComingSoonCover />` at the top of the panel and short-circuit the rest (or render the cover *over* the form behind a non-interactive overlay so we keep the layout for later). Simpler: replace the body with the cover.
- **`src/pages/PublicProfileView.tsx`** (`/u/:handle` and `/u/:handle/edit`) — render `<ComingSoonCover />` as the entire page, regardless of mode, owner state, or `?view=`.
- **`src/components/sidebar/SidebarProfile.tsx`** — keep the "Public profile" row visible (so users discover it's coming) but it just navigates to the covered settings page.

The legacy `/@:handle` routes already redirect into the same view, so they're covered automatically.

### What stays untouched

- All canvas-profile components, stores (`profileCanvasStore`, `handleStore`), migration, and `FrameProfileLayout` stay on disk. No deletions.
- The `canvas.css` import in `index.css` stays (harmless when components aren't rendered).

---

## Verification

1. `rg "Instrument Serif|--font-serif|font-serif"` returns **zero matches** in `src/`.
2. Visual diff on `/settings`, `/profile`, `/mind`, `/workspace`, `/chat`: page titles all render in sans; no font-family switches mid-page.
3. `/settings/public-profile`, `/u/anything`, `/u/anything/edit` all show the "Social intelligence — coming soon" cover.
4. Console clean, no FOUT from missing serif font.

---

## Out of scope

- Adding a new font family or weight.
- Refactoring the type-scale tokens themselves (the existing scale is good once serif is removed).
- Deleting or migrating any canvas-profile code or the database tables.

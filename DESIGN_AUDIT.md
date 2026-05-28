# Polyphonic-v2 Design Pass — Companion Audit

This is the focused design-and-aesthetic ledger for the May 2026 design pass. Companion to [`PRODUCTION_AUDIT.md`](./PRODUCTION_AUDIT.md), which covers the broader production-readiness work (memory/continuity, security, cron health, performance, accessibility gates). Read both. PRODUCTION_AUDIT.md is the master.

This file is for "what does the app *look* and *feel* like, and is the visual language consistent and award-tier across every surface."

**Last design pass:** the 2026 design-excellence pass — four-surface rebuild + unified rail (`f600062`), then the visual-craft restoration (`437a27d` typography → per-surface polish → `52e514b` a11y). Earlier passes: `bacedc3` → `2512be0` → `fd09ba4`. Frontend auto-deployed via Lovable.

---

## Design philosophy (apply to every new surface)

The Polyphonic visual language has four anchors. Every page should honor them.

### 1. Floor + cards aesthetic
- Page background = `var(--floor)` `#08080a` (the darkest layer — visible at viewport edges and around panels)
- Elevated surfaces = `var(--canvas)` `#0f0e11` for canvas, `var(--surface-1)` for cards on canvas
- Cards have `1px var(--border-faint)` border, `border-radius: 12-14`, and an `inset 0 1px 0 0 rgba(255,255,255,0.025)` top-edge highlight that suggests light from above
- The visible floor *between* panels is part of the design — gives depth and asymmetry. Don't fill every gap.

### 2. Reading column for body content
- Body content (lists, articles, forms): `max-width: 760px; margin: 0 auto`
- Hero / chrome / toolbar: `max-width: 880px` (or 920px for forms with controls)
- Reference: `JournalView` and `MindStreamShell` (`.s-stream-inner`)
- Comfortable line lengths land at ~60-75 chars per line — readable, never edge-to-edge

### 3. Restrained color
- Sage tan `--luca-full: #c9a87c` is the brand color, but it earns its presence by appearing rarely:
  - Composer ARMED states (send button, modes trigger, dictation listening)
  - Send-armed pulse keyframe
  - SidebarHeader LIVE eyebrow breathing dot
  - Some active-attention micro-affordances
- Nav rail / sidebar / thread row active states use NEUTRAL `var(--overlay-active)` `rgba(255,255,255,0.055)` — NOT sage
- Vercel blue `#0070F3` is reserved for the Luca composer Ghost icon (intentionally distinct from the sage agent-color tokens used for identity dots)
- Rose-red `--rose-accent: #e15873` is reserved for destructive actions

### 4. Premium, elegant, sharp
Riley's words. Translation:
- Tight letter-spacing on display headings (`var(--track-tight)`)
- Mono uppercase 9-10px for ambient metadata with `letter-spacing: var(--track-meta)` 0.12em
- Generous padding inside cards (22px), tight padding inside dense lists (8-10px)
- Subtle breath animations (livedot-breathe at 3s, send-armed-pulse at 4s, mic shimmer at 2.4s) — never distracting
- Composer is the *centerpiece* — treat its details with disproportionate care relative to other surfaces

---

## What the design pass landed (May 2026)

### Composer centerpiece
- Border glow restored to original 8-pool prime-interval algorithm (3 / 5 / 7 / 11 / 13 / 17 / 19 / 23 second rhythms — never sync, mathematically incapable of repeating). Pool extent 180%, falloff 60%, rest opacity 0.85.
- ModesDropdown consolidates Agent + Ensemble toggles. Portaled to body so popover escapes input-shell `overflow: hidden`. Industry-minimal styling. Sage tint when armed.
- Dictation: useDictation hook (Web Speech API), DictationButton with custom ShimmerMic SVG when listening. Mic icon stroke uses an animated `linearGradient` with `gradientTransform animateTransform` translating -24 → 24 over 2.4s — same shimmer vocabulary as `.guardian-label` text-fill, applied to the SVG.
- ExpressiveField shape responds to active modes: `0` Sphere (default Luca) / `10` Echo (Ensemble nested concentric) / `4` Torus (Agent runtime). Engine-level fix for chained mid-morph retargeting in `expressiveField.js` `triggerManualMorph` so toggling modes mid-flight morphs from current particle positions instead of snapping back.
- `--accent-soft` token defined as `#c9a87c` (was undefined, breaking armed states across composer).
- Luca composer Ghost icon → `--blue-accent` token (`#0070F3`). Promoted from a hardcoded literal in the 2026 typography pass (Riley: keep the electric blue, and reuse it for subtle indicators) — now a reusable "one electric note in the warm palette" signal with full bg/border/glow ladder.

### Rail architecture (unified expanding surface — reworked 2026, `f600062`)
- The rail and the section panel are now **one surface, not two cards**. Collapsed = a slim icon rail on the floor; expanding slides the main card right to reveal more of the *same* rail surface, and each nav icon reveals its label inline. (Replaces the earlier separate `Rail.tsx` + `Sidebar.tsx` two-card model.)
- `Sidebar.tsx` and `NavColumn.tsx` are **DELETED** (commit `ac75edc`); pre-rework originals recoverable at tag `pre-rail-rewrite`.
- Nav is gated by `interface_mode` (companion/guided/studio) via `getRailSurfaces()` — guided shows the four-surface set (Chat / Notebook / Memory / Agents), studio shows the full set (+ Mind / Journal / Projects / Profile).
- Brand "P" monogram in **Instrument Serif italic**; brand border `--border-faint` at rest. Active row uses neutral `--overlay-active` (never sage). Nav icons standardized to 16px / stroke 1.6. Focus-visible ring on every row. Activity bell + Settings anchor the bottom.

### Typography restoration (2026 design-excellence pass — `437a27d`+)
- The **code had drifted from this guide**: `--font-sans` rendered Inter (not Switzer), `--font-serif` was aliased to sans (Instrument Serif gone), `--font-grotesque` was an undocumented Inter Tight, and the entire `--track-*` ladder was zeroed (flat, characterless type — the "fonts feel off" Riley flagged).
- **Restored:** Switzer primary; Instrument Serif (italic) for the rail monogram, stream/notebook headings, and the onboarding hero; the intentional tracking ladder (tight −0.02 → folio 0.16em). `--font-grotesque` deprecated to a Switzer alias.
- **Per-surface token-fidelity sweep:** `JournalView` KIND_TONE hex → `--tone-*`; full settings family motion/radii/color hedges → tokens; drawer instance radii → tokens; decorative tints → `color-mix()` off tokens; `--blue-accent` promoted. Memory graph given a luminous "dramatic" constellation treatment (toggle-preserved).
- Verified live (Chrome MCP, signed-in, 1440 + 375). tsc clean, 342 tests green, production build succeeds.

### Reading-column design pass
- Mind streams (`Thoughts` / `Dreams` / `Wanderings` / `Insights` / `Reflections` / `Beliefs` / `Activity`): `.s-stream-inner` 1280 → 880, `.s-list` / `.s-activity-list` / new `.s-belief-list` constrained to 760 centered.
- ProjectsView fully restructured: dropped redundant left "Active projects" aside (project switcher already lives in rail-sidebar), switched to `maxWidth: 720` single column, upgraded panelStyle from thin border-top to real cards with surface-1 bg + border + radius + padding + inset highlight.
- SidebarHeader supports optional `eyebrow` prop (mono caps + sage breathing dot via `livedot-breathe` keyframe). SidebarChat passes `eyebrow="LIVE"`.
- SidebarChat: `+ New thread` button at the top (above search), bordered pill with neutral hover.
- Settings/Account: `--rose-accent: #e15873` saturated rose-red, `.set-btn.danger` border alpha 0.20 → 0.32 + bg tint 0 → 0.04 at rest. `.folio` top padding 14 → 22 for breathing room.

---

## Design audit — pages still to sweep

The design pass covered Mind streams, Projects, Account. These pages still need the same standard treatment applied. **For each, check for: edge-to-edge text running 1100+px wide; thin border-top "panels" with no real card surface; sage-tinted nav rows; missing top breathing room.** Then apply the standard treatment from the philosophy section above.

- [ ] `/profile` — ProfileView
- [ ] `/profile/identity` — ProfileIdentityView
- [ ] `/profile/revisions` — ProfileRevisionsView
- [ ] `/profile/schedule` — ProfileScheduleView
- [ ] `/profile/skills` — ProfileSkillsView (now self-model)
- [ ] `/settings/general` — GeneralSettings
- [ ] `/settings/agents` — AgentsList
- [ ] `/settings/agents/:id` — AgentDetail
- [ ] `/settings/models` — ModelsSettings
- [ ] `/settings/appearance` — AppearanceSettings
- [ ] `/settings/local-runtime` — LocalRuntimeSettings
- [ ] `/settings/public-profile` — PublicProfileSettings
- [ ] `/onboarding` — Onboarding flow
- [ ] `/workspace` — WorkspaceView
- [ ] `/dashboard` — DashboardView
- [ ] `/checkpoints` — CheckpointsView
- [ ] `/import` — ImportView
- [ ] `/group/:id` — GroupSession (if route active)
- [ ] Memory sub-tabs (Engrams, Beliefs, Graph, Imports — already mostly structured but worth verifying)

**Per-page audit checklist:**
1. Navigate via Playwright at desktop 1440×900.
2. Screenshot.
3. Identify: edge-to-edge text · weak panels · sage on nav · missing breathing room · ambient mono metadata using wrong tokens.
4. Apply standard treatment.
5. Screenshot, compare, verify it joins the family.

---

## Empty + error states

A first-time user lands on a sea of empties. Verify each renders gracefully:

- [ ] No threads yet — Sidebar threads list, ChatView empty state composer
- [ ] No memories — `/memory` Substrate empty state
- [ ] No journal entries — `/journal` empty state
- [ ] No projects — `/projects` empty state ("Select a project from the sidebar to edit, or create a new one.")
- [ ] No autonomous activity — Mind tabs (especially Wanderings, Insights, Activity)
- [ ] No beliefs formed yet
- [ ] No agents configured (Settings → Agents empty?)

Error states:
- [ ] Network failure mid-stream
- [ ] Invalid model API key
- [ ] Edge function 5xx
- [ ] Auth token expiry
- [ ] Stream cancellation mid-response

---

## Accessibility (design-specific)

Listed in PRODUCTION_AUDIT.md Phase 5 too, but design-relevant items:

- [ ] WCAG AA contrast for `--text-tertiary` (0.62 alpha) on `--canvas` — borderline, may need bump
- [ ] Sage-on-dark contrast for armed states
- [ ] Focus-visible rings on Rail buttons, ModesDropdown trigger, AgentPicker trigger, sidebar resize handle
- [ ] Screen reader labels for all icon-only rail buttons (currently using `aria-label` — verify reads naturally)
- [ ] `prefers-reduced-motion` handling — disable border glow shimmer, send-armed pulse, mic ShimmerMic, livedot-breathe, ExpressiveField particle motion
- [ ] Keyboard nav through ModesDropdown (arrow keys + Enter + Esc)

---

## Restoration anchors

```bash
# Restore the bacedc3-era unified NavColumn design
git checkout pre-rail-rewrite -- src/components/NavColumn.tsx src/App.tsx
# Then in App.tsx, replace <Rail /><Sidebar /> with <NavColumn /> and remove Rail+Sidebar imports.

# View pre-bacedc3 originals (Rail + Sidebar + per-section sidebars)
git show bacedc3^:src/components/Rail.tsx
git show bacedc3^:src/components/Sidebar.tsx

# Reset sidebar width to default (in browser console)
localStorage.removeItem('polyphonic:sidebarWidth')

# Standalone left-panel mockup for design exploration
# /Users/rileycoyote/Documents/Repositories/GLOBAL-DESIGN-DOCS/references-mockups/polyphonic-left-panel.html
```

---

## Post-design-pass deploy check

The composer/rail/design work is pure frontend — Lovable auto-deployed it via `main`. The remaining backend work from `bacedc3` is still pending:

- [ ] Apply `supabase/migrations/20260507120000_anima_wander_cron.sql`
- [ ] Deploy `anima-wander` (NEW), `skills-distill`, `anima-heartbeat`, redeploy any function importing `_shared/agents/skills.ts`

See PRODUCTION_AUDIT.md for the full deploy reasoning. Lovable agent prompt is in the session memory file.

Once those land, Mind → Wanderings + Insights start populating naturally on the next 3-hour cron tick.



# Autonomous Build Loop — Inner Cosmos Phases 1→4

## The Loop (applied to every phase)

```text
  ┌──────────────────────────────────────────────┐
  │ 1. BUILD / PATCH the phase                   │
  │ 2. OPEN in sandbox browser at /profile       │
  │ 3. INSPECT: screenshot + observe + console   │
  │ 4. INTERACT: hover, click, scroll, resize    │
  │ 5. ASSESS against pass criteria              │
  │     ├─ FAIL → diagnose, patch, GOTO step 2   │
  │     └─ PASS → commit phase, advance          │
  │ 6. After Phase 4: full end-to-end QA pass    │
  └──────────────────────────────────────────────┘
```

Hard cap: 3 patch iterations per phase. If still failing, surface findings before continuing.

## Phase 0 — Fix Phase 1 bugs (current state is broken)

The Constellation hit-testing is mis-aligned (mouse must be far from a star to register). Root cause to fix:

- Hit-test uses `performance.now()` but render loop uses its own `t0` baseline → rotation drift between draw and pick. Use a shared `tRef` written each frame.
- DPR scaling: `ctx.scale(dpr, dpr)` runs on every effect re-run, compounding the transform when `hoverId`/`selected` changes (effect re-subscribes). Move the render setup so DPR is applied once per resize, and read state via refs inside the RAF loop instead of re-creating the loop on every hover.
- Star tolerance is too tight on a large viewport — scale tolerance with `baseR`.
- Add a 1-frame cache of star screen positions so picking and drawing always agree.

Pass criteria:
- Cursor turns pointer exactly when over the visible glow of a star.
- Click reliably opens the evidence rail for the hovered star.
- No console errors; smooth 60fps; rotation continues during hover.

## Phase 2 — Climate Ribbon

Build `ClimateRibbon.tsx`:
- Three stacked horizontal bands: Now (current `mnemos_emotional_state`), Past 30d (aggregated daily snapshots from `mnemos_emotional_state_history` if present, else derived from `engrams.created_at` + valence tags), Forecast 48h (faint dashed continuation using simple cyclic mean).
- Soft Rothko bleed via `createLinearGradient` with valence/arousal/clarity/restlessness/warmth → existing palette tints only.
- Time cursor: drag/click sets `timeCursor` in `profileLayoutStore`. Constellation subscribes and dims stars whose `last_updated` is after the cursor.
- Loop until: cursor scrubbing visibly re-tints stars; bands render at correct heights; tooltip on hover shows date + dominant dimension.

## Phase 3 — Currents widget grid

Add `src/components/profile/widgets/`:
- `CircadianRadial.tsx` — 24-spoke radial of `thought_stream.created_at` density.
- `WeeklyHeatmap.tsx` — 7×N grid from `engrams` counts.
- `RecurrenceOrbits.tsx` — top tag clusters from `engrams.tags` + `connections`.
- `BeliefDrift.tsx` — sparkline of `beliefs.confidence` deltas.
- `QuestionStream.tsx` — `curiosity_questions` not yet asked, click → opens chat with prefill.

Tile container: CSS grid, drag-to-reorder via `@dnd-kit/core` (already idiomatic for this stack). Order persisted in `profileLayoutStore` → `localStorage`.

Loop until: every tile renders with real data (or quiet empty state), drag reorder persists across reload, no layout overflow at 1280–1920 widths.

## Phase 4 — Compass + daily pulse

- `CompassToday.tsx`: three modules (Today's edge, Question to sit with, Pattern just noticed).
- New edge function `profile-daily-pulse`: composes today's content from `growth_edges`, `shadow_patterns.unasked_questions`, last-24h `engrams`. Cached per-user per-day in a new table `profile_daily_pulse(user_id, day, payload jsonb)`.
- Frontend calls function on mount; falls back to client-side composition if function 5xxs.

Loop until: Compass renders within 800ms, content rotates daily, refresh button regenerates.

## Cross-layer wiring (final pass)

- Selecting a star highlights climate days that informed it (filter by `engrams` linked via tags).
- Hovering a climate peak swells matching stars (write `hoveredCategory` to store).
- Final QA at 1366, 1536, 1746, 1920 widths + console-clean check.

## Technical notes

- All work stays in `src/components/profile/**` plus one edge function and one migration.
- Reuses existing tokens (`--luca`, `--guardian`, `--text-*`); no new colors.
- Animation budget: single shared RAF loop in `InnerCosmos.tsx` distributes `t` to children via context to avoid 4 independent loops.
- Browser loop uses `navigate_to_sandbox` → `screenshot` → `observe` → `act` → `read_console_logs`; max 3 patch cycles per phase, then escalate.


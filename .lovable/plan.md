## Batch 2 — Emotions & Values in the Mind language

Goal: Port the next two profile tabs to the same `ProfileMindShell` + `mindViz` system established in Batch 1, while introducing two small new primitives that the remaining tabs (Batch 3) can also reuse.

---

### Data sources (already loaded by ProfileView)

- **Emotions** — `profile.emotional_landscape` (JSONB: `baseline_mood`, `emotional_range`, `regulation_style`, `granularity`, `triggers[]`, `coping_mechanisms[]`) + `emotionalSeries.current` and `emotionalSeries.history` (mnemos_emotional_state: `valence`, `arousal`, `dominance`, `certainty`, `social`, `temporal`) + `memoryStats.affectiveTrajectory` (per-memory valence over time).
- **Values** — `profile.values_hierarchy` (JSONB: `ranked_values[]`, `stated_vs_revealed`, `decision_framework`, `temporal_orientation`) + `memoryStats.byTagNorm` for stated-vs-revealed scoring.

Routing wiring already exists in `ProfileView.tsx`; we just swap the components and add the two new tabs to the full-bleed allow-list.

---

### New shared primitives in `mindViz.tsx`

1. **`Sparkbar`** — compact 90-cell horizontal heat row (one bar per day). Used by Emotions for the 6-axis affective heatmap; also useful for Growth (Batch 3).
   - Input: `values: (number|null)[]`, value range `-1..1` or `0..1` auto-detected.
   - Cells use `var(--hairline)` background, fill via `rgba(244,243,240, 0.15..0.7)` opacity ramp.

2. **`DivergenceRow`** — two-track hairline bar (stated vs revealed) sharing one label column.
   - Input: `{ label, stated: 0..1, revealed: 0..1 }`.
   - Top track value is solid mono fill; bottom track is hatched/dashed `var(--hairline-strong)` to read as "evidence". Mono delta value at right.

Both follow the same grid/typography system as `TraitBar` and `MagnitudeRow` — no new tokens.

---

### `EmotionsMind.tsx` layout

`ProfileMindShell` num=`08`, eyebrow=`Emotions`, title=`How you feel`, sub = current dominant axis label + qualitative.

Panel grid (12-col):

- **i — Affective signature** (span 5): `RadarMini` with 6 axes (Valence/Arousal/Dominance/Certainty/Social/Temporal) from `emotionalSeries.current`, normalized to 0..1. Right side `m-state-readout` lists each axis numeric value + dominant-axis whisper line. If no current state → `Empty note="Affective state forming."`.
- **ii — 90-day weather** (span 7): six stacked `Sparkbar` rows, one per axis, fed from `emotionalSeries.history` (last 90 entries, left-padded with nulls). Header aside shows `n=<history.length>`.
- **iii — Valence trajectory** (span 12): minimal SVG scatter of `memoryStats.affectiveTrajectory` (x=time, y=valence) with a hairline mean line. Reuses Mind tokens (`md-grid`, `md-fill`, `md-vertex`); circle radius encodes intensity. Empty → `Empty note="No memory affect recorded."`.
- **iv — Landscape prose** (span 7): `QuoteCard` stack — Baseline (lead), Range, Regulation, Granularity. Skip any field that is empty.
- **v — Triggers & coping** (span 5): two stacked `TagCloud` mini-sections ("Triggers", "Coping"). Counts only if items have `count`; otherwise uniform.

---

### `ValuesMind.tsx` layout

`ProfileMindShell` num=`09`, eyebrow=`Values`, title=`What you hold`, sub = top value + ranked count.

Panel grid:

- **i — Hierarchy** (span 7): mono-numbered ranked list (01., 02., …) with each value rendered as `QuoteCard`-style left-rule blocks (eyebrow=value name, body=evidence). If no `ranked_values` → `Empty`.
- **ii — Stated vs revealed** (span 5): `DivergenceRow` for top 3 values (stated derived from rank position, revealed from `tagMatchScore` against `memoryStats.byTagNorm`). Aside shows mean delta. Empty when `memoryStats` absent.
- **iii — Decision architecture** (span 12): three `QuoteCard`s for `stated_vs_revealed`, `decision_framework`, `temporal_orientation`. Each gets its own panel-eye column; skip empty.

---

### Wiring in `ProfileView.tsx`

```ts
// Add to full-bleed allow-list:
['Portrait', 'Communication', 'Cognition', 'Emotions', 'Values'].includes(activeTab)

// Replace tab renders:
{activeTab === 'Emotions' && <EmotionsMind data={profile.emotional_landscape}
  emotionalSeries={emotionalSeries} memoryStats={memoryStats}
  updatedAt={profile.updated_at} version={profile.version} />}
{activeTab === 'Values' && <ValuesMind data={profile.values_hierarchy}
  memoryStats={memoryStats} updatedAt={profile.updated_at} version={profile.version} />}
```

Old `EmotionsTab` / `ValuesTab` functions stay in the file for now (deleted with all legacy tabs at end of Batch 3, per earlier decision).

---

### Empty-state behavior (per earlier decision)

Quiet `Empty note="…"` ghost text per panel. The whole tab still renders the shell so the folio + hero stay visible even on a fresh profile.

---

### Files

**Created**
- `src/components/profile/EmotionsMind.tsx`
- `src/components/profile/ValuesMind.tsx`

**Edited**
- `src/components/profile/mindViz.tsx` — add `Sparkbar`, `DivergenceRow`.
- `src/pages/ProfileView.tsx` — swap tab renders, extend full-bleed allow-list.

No backend changes. No new tokens.

---

### Verification

- `/profile` → Emotions: radar renders, sparkbars show 90 cells, valence scatter plots affect events, prose collapses cleanly when empty.
- `/profile` → Values: ranked list with mono numerals, divergence rows for top 3 with revealed signal from tag tallies.
- Both tabs match the folio + hero rhythm of Portrait / Communication / Cognition.
- Reduced-motion: no animations introduced.

After approval I'll implement and ping back, then we move to Batch 3 (Relationships, Growth, Shadow).
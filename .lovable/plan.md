

# Pivot — From Static Cosmos to a Generative Dashboard

You're right: the current Cosmos is beautiful but inert. The constellation was never going to map to anything you'd use daily, and the widgets are static. Let's pivot to something that earns its place: **a dashboard you compose by talking to it.**

---

## The New Concept — "The Atelier"

A dashboard where you **prompt your own widgets into existence**. Type what you want to see (*"show me when I'm most self-critical"*, *"map my recurring fears to the people I trust"*, *"give me a daily 1-line read on my cognitive state"*) — the AI designs and generates a real, data-bound widget against your memories, beliefs, emotional state, and conversations. It pins to your dashboard, refreshes itself, and stays.

Three layers of intelligence:

1. **The Pulse** (always-on top strip) — single AI-generated paragraph each morning: a one-paragraph read on your inner state right now, plus one specific thing to notice today. Replaces the "Compass."
2. **The Atelier** (your composed dashboard) — every widget here was generated from a prompt you wrote. Drag, resize, pin, archive, regenerate, fork into a new variant.
3. **The Studio** (prompt bar + library) — the bottom command bar where you type new widgets into existence, plus a curated library of starter widgets across three pillars: **Inner Mind**, **Behavioral Patterns**, **Cognitive Genome**.

The Constellation, Climate Ribbon, and current widget grid are **retired**. The classic tabbed view stays as a fallback at `?view=classic`.

---

## How widget generation works

You type a prompt → AI returns a structured widget spec (not freeform code). Spec is a JSON contract:

```text
{ kind: "metric" | "timeline" | "heatmap" | "list" | "scatter" | "narrative" | "comparison" | "radial" | "quote_stream",
  title, subtitle, query: { tables: [...], filter, group_by, time_range },
  derive: { calc: "..." }, render_hints: { palette, density, sparkline } }
```

A small set of **renderer components** in the frontend knows how to draw each `kind` from the data the spec returns. The AI never writes code — it composes from a fixed vocabulary of safe, validated query primitives over the existing tables (`engrams`, `beliefs`, `mnemos_emotional_state`, `thought_stream`, `messages`, `psychological_profile`, `curiosity_questions`, `connections`). This keeps it secure, fast, and recoverable.

The user can re-prompt any widget ("make this last 90 days instead", "compare against last month", "rephrase the title softer") and the spec updates in place.

---

## Model routing — Lovable AI default, OpenRouter override

- **Default**: Lovable AI Gateway, model `openai/gpt-5` for widget design (high reasoning), `google/gemini-3-flash-preview` for the daily Pulse and quick re-prompts. No setup required for the user.
- **Override**: If the user has an OpenRouter key in `user_api_keys` (already supported), they can pick any model in a small selector ("Generated with: GPT-5 · change"). Their key is used server-side only.
- All AI calls go through one new edge function: `dashboard-generate` — handles widget design, daily pulse, and re-prompting. Streams responses for snappy feel.

---

## Starter library (one-tap install widgets)

When the dashboard is empty, surface ~12 curated prompts grouped:

- **Inner Mind** — "Today's emotional weather", "Your top 3 active beliefs and which way they're drifting", "What you've been quietly avoiding lately"
- **Behavioral Patterns** — "When you're most reflective vs reactive across the week", "Topics that loop for you", "How your tone shifts when you're tired"
- **Cognitive Genome** — "Your 5 strongest cognitive tendencies with examples", "Map of how your values trade off against each other", "Which questions you keep almost-asking but never do"

Each starter is just a saved prompt — clicking generates it the same way a custom prompt would.

---

## The Pulse (replaces Compass)

A single, breathing strip across the top of the dashboard. Each morning a background job runs `dashboard-generate` in `pulse` mode and writes one paragraph + one suggested action to `profile_daily_pulse` (table already exists). Reads in <100ms; refresh button regenerates on demand.

---

## What gets removed / kept

- **Removed**: `ConstellationCanvas`, `ClimateRibbon`, `CurrentsGrid` and its widgets, `CompassToday`, `EvidencePanel`, `constellationModel`, `profileLayoutStore` (replaced by `dashboardStore`). Edge function `profile-daily-pulse` is folded into `dashboard-generate`.
- **Kept**: `ProfileChatPanel` (still useful for asking about specific widgets), classic tabbed `ProfileView` at `?view=classic`, all backend tables and analysis pipeline.

---

## Architecture

```text
src/components/dashboard/
  ├─ DashboardView.tsx          ← replaces InnerCosmos as default
  ├─ Pulse.tsx                  ← top strip, daily AI-generated read
  ├─ Atelier.tsx                ← responsive grid of user widgets (dnd-kit)
  ├─ Studio.tsx                 ← prompt bar + starter library + model picker
  ├─ widgets/
  │   ├─ Widget.tsx             ← shell: title, refresh, edit-prompt, pin, archive
  │   ├─ MetricCard.tsx         ← kind: "metric"
  │   ├─ TimelineChart.tsx      ← kind: "timeline"
  │   ├─ HeatmapGrid.tsx        ← kind: "heatmap"
  │   ├─ ScatterField.tsx       ← kind: "scatter"
  │   ├─ ListBlock.tsx          ← kind: "list"
  │   ├─ NarrativeCard.tsx      ← kind: "narrative" (AI-written paragraph)
  │   ├─ ComparisonBars.tsx     ← kind: "comparison"
  │   ├─ RadialChart.tsx        ← kind: "radial"
  │   └─ QuoteStream.tsx        ← kind: "quote_stream" (memory excerpts)
  ├─ widgetRunner.ts            ← executes spec.query against Supabase, returns data
  ├─ widgetLibrary.ts           ← curated starter prompts
  └─ dashboardStore.ts          ← Zustand: widgets, layout, model preference

supabase/functions/dashboard-generate/index.ts
  modes:
    - "design"   → prompt → widget spec (tool-calling, strict schema)
    - "pulse"    → today's paragraph + action (cached daily)
    - "narrate"  → for narrative/quote_stream widgets that need AI text from data
```

New table:

```text
dashboard_widgets (
  id uuid pk, user_id uuid, prompt text, spec jsonb,
  position int, pinned bool, archived bool,
  model text, created_at, updated_at, last_run_at
)
```

---

## Build phases

1. **Phase A — Skeleton + Pulse**: new `DashboardView` mounted at `/profile` (cosmos retired, classic preserved). Pulse strip live with cached daily generation.
2. **Phase B — Studio + first 3 renderers** (`metric`, `narrative`, `list`): you can prompt → generate → pin a widget end-to-end. Starter library visible when empty.
3. **Phase C — Remaining renderers** (`timeline`, `heatmap`, `scatter`, `comparison`, `radial`, `quote_stream`) + drag-to-reorder + edit-prompt-in-place.
4. **Phase D — Model selector + OpenRouter override** + per-widget refresh schedules + small polish pass.

Each phase is shippable on its own. After Phase B you already have a working generative dashboard.

---

## Why this works

- **Useful from minute one** — the Pulse alone is a daily reason to open the page.
- **Personal in a way no static dashboard can be** — every screen is composed by you, about you.
- **Bounded and safe** — AI never generates code; it composes from a fixed vocabulary the renderers understand.
- **Aesthetic preserved** — same dark monochrome palette, same `--luca` accent, same typography. The widgets render quietly; the prompt bar is the only new chrome.


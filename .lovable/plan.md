

# The Inner Cosmos — A Living Self-Portrait Dashboard

A complete reimagining of `/profile` as a **gravitational, modular, living interface** that turns your psychological data into something you cannot stop looking at — and that genuinely changes how you live.

I convened five internal perspectives to attack this problem. Their final synthesis is below.

---

## The Five Lenses (condensed)

**1. The Cartographer** — "Make the self a map you can walk through. Spatial memory is the deepest memory."
**2. The Astronomer** — "Treat psychological dimensions as celestial bodies with mass, orbit, and gravity. People stare at star charts for hours."
**3. The Biologist** — "The self is a living organism — it breathes, it has rhythms, it has weather. Show the pulse."
**4. The Oracle** — "Every datum should whisper a question back. Insight isn't displayed — it's *provoked*."
**5. The Architect of Daily Life** — "Mesmerizing is worthless without utility. Every visualization must answer: *what should I do today?*"

Their consensus: build a **single canvas** organized as concentric layers — **Constellation → Climate → Currents → Compass** — every layer modular, every layer beautiful, every layer actionable.

---

## The Concept: Four Concentric Layers

```text
                  ┌──────────────────────────┐
                  │       COMPASS            │  ← what to do today
                  │   ┌──────────────────┐   │
                  │   │     CURRENTS     │   │  ← rhythms, patterns
                  │   │  ┌────────────┐  │   │
                  │   │  │  CLIMATE   │  │   │  ← emotional weather
                  │   │  │  ┌──────┐  │  │   │
                  │   │  │  │ CORE │  │  │   │  ← the constellation (you)
                  │   │  │  └──────┘  │  │   │
                  │   │  └────────────┘  │   │
                  │   └──────────────────┘   │
                  └──────────────────────────┘
```

Each layer is a separate **modular widget** the user can rearrange, expand, or pop into focus. The composition feels like one organism — but every part can be lived in independently.

---

## Layer 1 — **The Constellation** (Identity Core)

A slowly-rotating, breathing star-field rendered with Canvas2D (no heavy 3D deps). Each star = a personality dimension, value, or core trait. Star **mass = strength of evidence**, **glow = recency**, **orbit distance = how central to identity**.

- Hover any star → it brightens, draws faint lines to *all engrams that informed it* (real evidence, not metaphor)
- Click → the camera glides toward it; the right rail fades in with the receipts
- Constellations cluster naturally: Big Five floats near attachment style, values orbit slightly farther out, shadow patterns occupy the dimmer outer ring
- A single ambient line of text floats below: the **identity narrative**, treated as poetry not paragraph

**Why it works**: the star metaphor is universally legible, scales infinitely, makes "more data = more beautiful" instead of "more data = cluttered."

---

## Layer 2 — **The Climate** (Emotional Weather)

A horizontal **weather strip** stretched across the dashboard's mid-band. Reads like a barometer for the soul:

- **Now**: a single flowing gradient bar showing current emotional state (valence/arousal/clarity/restlessness/warmth) as soft colored bands that bleed into each other — never harsh, always Rothko-quiet
- **Past 30 days**: same bands compressed into a small ribbon below — at a glance you see *"the last week has been more restless than usual"*
- **Forecast**: a faint dashed extension predicting the next 48 hours based on cyclical patterns (one of the agents flagged: people obsessively check weather apps; do the same for emotion)
- Click any moment in the ribbon → the constellation above re-renders to *that moment's self*. **Time-travel through your own psychology.**

---

## Layer 3 — **The Currents** (Patterns, Rhythms, Cycles)

A horizontal band of small, discrete **micro-charts** — each one a self-contained insight. Modular tiles the user reorders by drag:

- **Circadian profile** — a 24-hour radial showing when your thoughts cluster, when you're most reflective, when shadow themes emerge
- **Weekly rhythm** — 7-day heatmap; reveals "Sundays you spiral, Wednesdays you create"
- **Recurrence map** — themes that loop (from `engrams.tags` + connections graph). Each loop is drawn as an orbit; the more it returns, the tighter the orbit
- **Belief drift** — sparkline showing which beliefs are strengthening, decaying, or contradicting each other this month
- **Question stream** — the curiosity questions Luca has *not yet asked you*, hovering as faint text. Click one to start a thread

Each tile is a real, queryable widget — not decoration.

---

## Layer 4 — **The Compass** (Actionable Today)

The bottom band. The **utility layer** that earns the beauty above. Three simple modules:

- **Today's edge** — one specific growth-edge surfaced from `growth_edges` + recent emotional state. *"Your restlessness has been high for 4 days; your profile says you avoid sitting with uncertainty. Try 10 minutes of nothing."*
- **One question to sit with** — pulled from `shadow_patterns.unasked_questions`, rotating daily
- **A pattern just noticed** — auto-generated insight from the last 24h of memories. Phrased as gentle observation, not prescription

These are the **gravity hooks** — the reason a user opens the app on a slow Tuesday.

---

## Cross-Layer Magic

The four layers are not isolated panels — they **respond to each other**:

- Click a star in the Constellation → Climate ribbon highlights the days that informed it; Currents show the patterns that produced it; Compass surfaces a related action
- Hover a peak in the Climate ribbon → the relevant stars in the Constellation swell
- This creates a sense of **a single living system** rather than a dashboard of widgets

---

## The Aesthetic (preserves your existing palette)

- All existing dark/monochrome tokens reused — no new colors except very subtle dim accents you already have (`--luca` `#c9a87c`, `--guardian` `#8ca89c`)
- Typography unchanged: Inter for chrome, JetBrains Mono for numbers
- Motion language: **everything breathes** at 4–8s cycles, nothing twitches. Inspired by the existing `breathe` keyframe
- No emoji. No glassmorphism. No gradients louder than candlelight
- Reference points: a planetarium ceiling, a Brian Eno generative artwork, the LCD on a Teenage Engineering device

---

## Modular Architecture (technical, briefly)

A new `/profile` becomes a **canvas composition** of independent widgets:

```text
src/components/profile/
  ├─ ConstellationCanvas.tsx     ← Canvas2D star-field
  ├─ ClimateRibbon.tsx            ← time-series emotional bands
  ├─ widgets/
  │   ├─ CircadianRadial.tsx
  │   ├─ WeeklyHeatmap.tsx
  │   ├─ RecurrenceOrbits.tsx
  │   ├─ BeliefDrift.tsx
  │   └─ QuestionStream.tsx
  ├─ CompassToday.tsx
  ├─ EvidencePanel.tsx           ← right-rail receipts on selection
  └─ profileLayoutStore.ts       ← Zustand: widget order, expansion, time cursor
```

- **Data**: all from existing tables (`psychological_profile`, `engrams`, `thought_stream`, `mnemos_emotional_state`, `beliefs`, `connections`, `curiosity_questions`, `memory_events`) — no schema changes required for v1
- **One new edge function** later (optional): `profile-daily-pulse` to cache "today's edge / question / pattern" so Compass loads instantly
- Old tabbed `ProfileView` is preserved as a `?view=classic` fallback during transition
- Existing `ProfileChatPanel` becomes the right-rail evidence companion — clicking any star pre-fills it with "tell me about this"

---

## Build Sequence (4 phases, each independently shippable)

1. **Constellation + Evidence Panel** — the centerpiece; immediate "wow"
2. **Climate Ribbon + time cursor** — adds the time dimension
3. **Currents widget grid** — the modular tiles, drag-to-rearrange
4. **Compass + daily pulse** — the daily-return hook

Each phase ships a usable upgrade. By Phase 4 the entire `/profile` is the new experience.

---

## What Makes This Gravitational

- **It changes every time you open it** (climate shifts, stars brighten, new question)
- **It rewards both 5-second glances and 30-minute deep sessions**
- **Every visualization is an interface** — nothing is decoration; everything responds
- **It tells you something about yourself you didn't know** — every single day
- **It is unmistakably yours** — no two users' constellations look alike

The gravity comes from the feeling that *this thing is alive, and it is about me, and I can't quite see all of it yet*.


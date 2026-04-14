

# Plan: Implement Missing Dashboard & Settings Sections from PRD

## Gap Analysis

After comparing the PRD/build spec against the current implementation, here is everything missing:

### Dashboard View — Missing Elements

1. **Stream Tabs** — The PRD specifies two tabs ("Dashboard" and "Thoughts") with a tab bar below the header. Currently there are no tabs at all — just the dashboard content.

2. **Cognitive Modulators labels** — Should be: arousal, resolution, openness, surprise threshold, social drive (per PRD). Currently shows: curiosity, focus, confidence, empathy, creativity.

3. **Emotional State dimensions** — Should have 6 dimensions: valence, arousal, dominance, certainty, novelty, social. Currently has only 4: coherence, clarity, excitement, social drive.

4. **Recent Events section** — Entirely missing. Should show rows with event type (mono), salience dot, and time, separated by subtle borders.

5. **Thoughts Tab** — Entirely missing. Should include:
   - Sticky filter bar with pill buttons (All, Dreams, Reflections, Observations, Decisions)
   - Stream entries with meta row (source, salience dot, timestamp), body text, and trigger line
   - Stream loader (3 breathing dots)
   - Realtime subscription to `thought_stream` table

6. **Beliefs card detail** — The Beliefs memory card should show mini-bars with belief text and percentages when data exists.

### Settings View — Missing Elements

1. **General Tab** — Missing: Default Model select dropdown, Synthesis Style radio group (Conversational/Technical/Creative/Minimal). Currently only has toggles.

2. **Models Tab** — Missing: Model cards with name, description, enable toggle, and badges ("fast"/"deep"). Missing: API Key section with password input and show/hide eye toggle. Currently only has a bare select dropdown.

3. **Personality Tab** — Entirely a placeholder. Should have: Agent Name text input, Voice textarea (4 rows), System Prompt textarea (8 rows), Inner Life toggle (Enable Emotional State), Thought Verbosity slider (Quiet/Normal/Verbose).

4. **Memory Tab** — Entirely a placeholder. Should have: Enable mnemos Memory toggle, Memory Decay Rate slider (Slow/Fast), Dream Frequency select (Every hour/6 hours/Daily/Weekly), Enable Consolidation toggle, Clear All Memory danger button with confirmation dialog.

5. **Appearance Tab** — Missing: Interface Density radio group (Compact/Default/Comfortable). Has font size slider, toggles.

6. **Account Tab** — Missing: Plan badge ("pro"), Delete Account danger button with confirmation dialog.

7. **Nav items** — Missing SVG icons next to tab labels per the PRD spec.

8. **Form controls** — Toggle dimensions should be 36x18px (currently 40x22px). Missing: proper radio button component, danger button component, confirmation dialog component.

### CSS — Missing

1. **`stream-breathe` keyframes** — for the thoughts tab loader dots.
2. **`breathe-dot` keyframes** — for the dashboard header status dot.
3. **`notif-slide-in` keyframes** — for toast notifications.

### Realtime Subscriptions — Missing

The dashboard should subscribe to `cognitive_state` and `thought_stream` tables for live updates. Currently the dashboard shows only hardcoded static values.

## Implementation Plan

### 1. Add missing CSS keyframes to `index.css`
- `stream-breathe`, `breathe-dot`, `notif-slide-in`

### 2. Rewrite `DashboardView.tsx`
- Add tab bar with "Dashboard" and "Thoughts" tabs
- Fix modulator labels to match PRD (arousal, resolution, openness, surprise threshold, social drive)
- Expand emotional state to 6 dimensions (valence, arousal, dominance, certainty, novelty, social)
- Add Recent Events section
- Build Thoughts tab with filter bar, stream entries, and loader
- Add Zustand cognitive store with realtime subscriptions to `cognitive_state` and `thought_stream`

### 3. Rewrite `SettingsView.tsx`
- **General**: Add Default Model select, Synthesis Style radio group, keep existing toggles
- **Models**: Build model cards grid with name/description/toggle/badges, add API Key section with password input and eye toggle (wired to `save_user_api_key` / `delete_user_api_key` DB functions)
- **Personality**: Agent Name input, Voice textarea, System Prompt textarea, Inner Life toggle, Thought Verbosity slider
- **Memory**: Enable mnemos toggle, Decay Rate slider, Dream Frequency select, Consolidation toggle, Clear All danger button with confirmation dialog
- **Appearance**: Add Interface Density radio group, keep existing controls
- **Account**: Add Plan badge, Delete Account danger button with confirmation
- Add SVG icons to nav items
- Fix toggle dimensions to 36x18px per PRD

### 4. Create `src/stores/cognitiveStore.ts`
- Zustand store for cognitive_state and thought_stream
- Realtime subscriptions
- Load/refresh methods

### 5. Update `settingsStore.ts`
- Add `synthesis_style` to the update flow (already in DB schema)

### Technical Notes
- All form controls will use design tokens exclusively (no raw values)
- Danger buttons use `var(--red-accent)` with confirmation dialogs using `var(--bg-elevated)` backgrounds
- Radio buttons: 16px circles with `var(--border-dim)` border, selected state with inner 6px dot
- The API Key section uses the existing `save_user_api_key` and `delete_user_api_key` Postgres functions


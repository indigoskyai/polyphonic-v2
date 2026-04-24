# Phase 12 — Observability Widget

## Goal

Always-peripherally-visible widget showing what Luca's autonomous engine is doing right now. Two states: **collapsed** (28px column docked at the Rail edge with stacked status dots + a vertical metric label) and **expanded** (320px floating panel with per-agent status rows, a 32px sparkline of the last few minutes of token burn, and a list of currently-running sub-agents with elapsed time). The widget never disappears — it sits in the periphery so Riley can glance at it during any other task and know that the autonomous loop is alive, what it is touching, and how hot it is running. After this phase: there is exactly one canonical surface for "what is the engine doing right now."

## Dependencies

- Phase 01 (foundation tokens — agent identity colors, surface elevation, mono typography, motion)
- Phase 02 (Pill — used inside the expanded panel header for compact actions, optional)
- `entity_activity_log` table (already exists — used for sparkline binning + active sub-agents query)
- `cognitive_state` table (already exists — used for current modulators when applicable)

## Files

- `src/components/observability/ObservabilityWidget.tsx` (new)
- `src/components/observability/Sparkline.tsx` (new — small, no external dep)
- `src/stores/observabilityStore.ts` (new — Zustand store, polls every 5s)
- `src/components/Rail.tsx` (mount the collapsed widget at the bottom of the Rail OR floating bottom-left of the canvas; choose Rail dock for first pass)
- `src/index.css` — add `.obs-*` class block

## Tasks

### 12.1 — Store + data fetch

- [ ] Create `src/stores/observabilityStore.ts` with this shape:
```ts
interface AgentStatus {
  agent: 'luca' | 'vektor' | 'anima'
  status: 'running' | 'idle' | 'paused' | 'error'
  tokensSinceMidnight: number
  lastActivityAt: string | null
}

interface ActiveSubagent {
  id: string
  family: 'v1' | 'v2' | 'v3'
  name: string                // e.g. "v2.07 — refactor pass"
  startedAt: string
}

interface ObservabilityState {
  agents: AgentStatus[]
  sparkline: number[]         // last 24 bins, ~5s each (~2min window)
  activeSubagents: ActiveSubagent[]
  updatedAt: string
  expanded: boolean
  setExpanded: (v: boolean) => void
  refresh: () => Promise<void>
}
```
- [ ] Polling: on mount, call `refresh()` every 5000ms. On unmount, clear interval.
- [ ] `refresh()` queries:
  - `entity_activity_log` last 5 minutes grouped into 24 bins (`floor(epoch_diff / 12.5)`); each bin's value = sum of `tokens_used` (fall back to row count if column absent).
  - `entity_activity_log` rows where `activity_type = 'subagent_started'` AND no matching `subagent_completed` for same `correlation_id` — these populate `activeSubagents`.
  - `cognitive_state` latest row for each agent → status field (`running` if `last_activity_at` within 60s, else `idle`).

### 12.2 — Collapsed widget CSS

- [ ] Add to `src/index.css`:
```css
.obs-widget-collapsed {
  width: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
  position: relative;
}
.obs-widget-collapsed:hover { background: var(--overlay-hover); }

.obs-dots {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.obs-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.obs-dots .dot.luca   { background: var(--luca-full); }
.obs-dots .dot.vektor { background: var(--vektor-full); }
.obs-dots .dot.anima  { background: var(--anima-full); }
.obs-dots .dot.idle   { opacity: 0.35; }
.obs-dots .dot.running {
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.15);
}

.obs-metric {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-soft);
  letter-spacing: var(--track-mono);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
}
```

### 12.3 — Expanded panel CSS

- [ ] Add to `src/index.css`:
```css
.obs-panel {
  position: absolute;
  left: calc(100% - 4px);
  bottom: 16px;
  width: 320px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), var(--shadow-inset-highlight);
  padding: 16px;
  z-index: 10;
  animation: obs-panel-in var(--dur-settle) var(--ease-premium);
}
@keyframes obs-panel-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.obs-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.obs-panel-title {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--track-folio);
  color: var(--text-soft);
}
.obs-panel-updated {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-whisper);
}

.obs-agent-row {
  display: grid;
  grid-template-columns: 80px 1fr 50px;
  gap: 8px;
  padding: 8px 0;
  align-items: center;
}
.obs-agent-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
}
.obs-agent-name .dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.obs-agent-name .dot.running {
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.15);
}
.obs-agent-status {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-soft);
  text-transform: lowercase;
}
.obs-agent-tokens {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: right;
}

.obs-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 8px 0;
}

.obs-stat-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 6px 0;
  align-items: center;
}

.obs-sparkline {
  height: 32px;
  display: flex;
  align-items: flex-end;
  gap: 1px;
  width: 100%;
}
.obs-sparkline .bar {
  flex: 1;
  background: var(--border-strong);
  border-radius: 1px;
  min-height: 2px;
  transition: height var(--dur-fast) var(--ease-out);
}

.obs-subagents {
  margin-top: 8px;
  padding: 10px;
  background: var(--surface-1);
  border-radius: var(--radius-sm);
}
.obs-subagents-title {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: var(--track-folio);
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.obs-subagent-item {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}
.obs-subagent-item .dot {
  width: 4px; height: 4px;
  border-radius: 50%;
}
.obs-subagent-item .dot.v1 { background: var(--v1); }
.obs-subagent-item .dot.v2 { background: var(--v2); }
.obs-subagent-item .dot.v3 { background: var(--v3); }
.obs-subagent-name {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-body);
}
.obs-subagent-elapsed {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: right;
}
```

### 12.4 — Sparkline component

- [ ] Create `src/components/observability/Sparkline.tsx`. Accept `values: number[]` (24 bins). Compute `max = Math.max(...values, 1)`. Render one `<div class="bar" style={{ height: ${(v / max) * 100}% }} />` per value. No SVG dependency — pure flex bars. Empty (`values.length === 0`) → render a single ghost line at 2px.

### 12.5 — Widget component

- [ ] Create `src/components/observability/ObservabilityWidget.tsx`:
  - Read store via Zustand selector. Hooks: `useEffect` to mount poll on first render.
  - Collapsed mode: render `.obs-widget-collapsed` with `.obs-dots` (one dot per agent, applying `.luca|.vektor|.anima` and `.running|.idle` class) and `.obs-metric` showing total tokens last hour formatted compact ("12.4K" / "847" / "—").
  - Click handler → `setExpanded(true)`.
  - Expanded mode: render the collapsed widget AND an `.obs-panel` sibling positioned absolutely. Panel includes:
    - Header: title `AUTONOMOUS LOOP` + updated `{relativeTime(updatedAt)}` (e.g. "5s ago").
    - One `.obs-agent-row` per agent: name with dot, status, tokens.
    - Divider.
    - `.obs-stat-row`: label `TOKEN BURN · 2 MIN` left, value right (current rate "/s").
    - `.obs-sparkline` row.
    - `.obs-subagents` block (rendered only if `activeSubagents.length > 0`):
      - Title `ACTIVE SUB-AGENTS · {N}`.
      - One `.obs-subagent-item` per active sub-agent showing family dot, name, elapsed (`30s`, `4m`).
  - Outside-click handler closes the panel (use `useEffect` + `mousedown` listener checking `event.target` against panel ref).
  - ESC closes the panel.

### 12.6 — Mount in Rail (or floating)

- [ ] Open `src/components/Rail.tsx`. Mount `<ObservabilityWidget />` at the bottom of the Rail's vertical stack (after the bell icon from Phase 05 but before any spacer).
- [ ] If the Rail layout cannot accommodate (overflow), fall back: mount in `src/App.tsx` as `position: fixed; bottom: 16px; left: 8px; z-index: 50` so it floats just outside the Rail.

### 12.7 — Reduced-motion behaviour

- [ ] Already covered by Phase 01's `@media (prefers-reduced-motion: reduce)` rule for the panel-in animation. Sparkline bars set transition only on height; under reduced motion this collapses to instant — acceptable.

## Verification

1. **Collapsed render:** `/chat` loads, the 28px widget is visible at the Rail bottom. Three colored dots stacked, vertical metric label readable.
2. **Polling:** Wait 10s. Observe the metric value change once or stay stable if engine idle. Check Network tab: queries to `entity_activity_log` repeat every 5s.
3. **Expanded:** Click the collapsed widget. Panel slides in (320px). Three agent rows render with correct colors. Sparkline shows non-zero bars if any activity in last 2min, otherwise minimum-height bars.
4. **Active sub-agents:** Insert a fake `entity_activity_log` row with `activity_type = 'subagent_started'` and no matching completion. Refresh widget — it appears in the active list with elapsed time ticking forward.
5. **Outside click:** Click outside the panel — collapses smoothly.
6. **Playwright:**
```js
() => {
  const w = document.querySelector('.obs-widget-collapsed')
  if (!w) throw new Error('widget not mounted')
  w.click()
  return new Promise((r) => setTimeout(() => {
    const p = document.querySelector('.obs-panel')
    r({ panelMounted: !!p, agentRows: document.querySelectorAll('.obs-agent-row').length })
  }, 400))
}
```
   Expect `{ panelMounted: true, agentRows: 3 }`.
7. **Console:** 0 new errors.

## Backend asks

None for v1 (uses existing `entity_activity_log` + `cognitive_state`). If sub-agents grow into a first-class concept, a `subagent_tasks` table with `started_at`/`completed_at`/`family` would let us replace the start/complete pairing heuristic — see `LUCA_PLAN.md` Backend asks queue.

## Commit

```
phase 12: observability widget — collapsed dots + expanded panel

- src/components/observability/ObservabilityWidget.tsx (new)
- src/components/observability/Sparkline.tsx (new)
- src/stores/observabilityStore.ts (new — 5s polling)
- src/components/Rail.tsx — mount collapsed widget at Rail bottom
- src/index.css — .obs-* class block per phase-12 spec
- Per-agent rows with running halo, 24-bin sparkline of token burn,
  active sub-agents list with v1/v2/v3 family dots and elapsed time
- Outside-click + ESC collapse the panel

Verified: collapsed widget always visible, panel opens on click with
panel-in animation, polling refreshes every 5s without console errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

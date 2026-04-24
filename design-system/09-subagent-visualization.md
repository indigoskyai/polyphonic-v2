# Phase 09 — Sub-Agent Visualization

## Goal

When Vektor (or any orchestrator agent) spawns a family of sub-agents — `v1`, `v2`, `v3` — each appears in the UI as a tiny 3×3 dot grid that *murmurs*: dots breathe in opacity and scale on prime-staggered cycles so no two grids ever sync. Click an indicator and an overlay panel slides in from the right with gantt lanes, an event log, and detail for the selected sub-agent. Cancel a sub-agent and an undo toast appears for 3 seconds.

This phase is future-facing — it ships before Luca's `chat-multi` edge function actually spawns parallel sub-agents — so build it as a self-contained component driven by a store, with a mock data hook for development.

## Dependencies

- Phase 01 (foundation tokens — sub-agent v1/v2/v3 colors, motion tokens, surface tokens, shadow tokens)
- Phase 02 (Pill, EmptyState, Tooltip primitives)

## Files

```
src/components/subagents/SubAgentIndicator.tsx     (new — single 3×3 dot grid)
src/components/subagents/SubAgentRow.tsx           (new — horizontal row of indicators per family)
src/components/subagents/SubAgentOverlay.tsx       (new — right-side panel)
src/components/subagents/UndoToast.tsx             (new)
src/stores/subAgentStore.ts                        (new)
src/index.css                                      (add classes below)
```

## Tasks

### 9.1 — `subAgentStore`

- [ ] Create `src/stores/subAgentStore.ts`:
```ts
import { create } from 'zustand'

export type SubAgentState = 'queued' | 'active' | 'complete' | 'failed'
export type SubAgentFamily = 'v1' | 'v2' | 'v3'

export interface SubAgent {
  id: string
  family: SubAgentFamily       // determines color
  parentAgent: string          // 'vektor' | 'luca' | etc
  task: string                 // short description (tooltip + lane label)
  state: SubAgentState
  startedAt: number | null
  endedAt:   number | null
  progress:  number            // 0..1 (drives bar fill)
}

export interface SubAgentEvent {
  id: string
  ts: number
  agentId: string | null       // null for system events
  agentName: string            // 'v1' | 'v2' | etc
  text: string
}

interface SubAgentStore {
  agents: Record<string, SubAgent>
  events: SubAgentEvent[]
  overlayOpenForParent: string | null
  selectedAgentId: string | null
  pendingCancel: { agentId: string; expiresAt: number } | null
  spawn:  (a: Omit<SubAgent, 'id' | 'state' | 'startedAt' | 'endedAt' | 'progress'>) => string
  update: (id: string, patch: Partial<SubAgent>) => void
  emit:   (e: Omit<SubAgentEvent, 'id' | 'ts'>) => void
  openOverlay:  (parentAgent: string, selectedId?: string) => void
  closeOverlay: () => void
  cancel:       (id: string) => void   // sets state='failed', creates pendingCancel
  undoCancel:   () => void
}
```
- [ ] Implementation notes: keep events bounded to last 200; oldest fall off. `cancel` sets `pendingCancel = { agentId: id, expiresAt: Date.now() + 3000 }` and starts a 3s timeout that nulls `pendingCancel` if still pointing at this id.

### 9.2 — `SubAgentIndicator` (the murmur grid)

- [ ] Create `src/components/subagents/SubAgentIndicator.tsx`:
```tsx
interface Props {
  agent: SubAgent
  onClick: () => void
}
```
- [ ] Markup:
```
<button class="sa-indicator" data-state={agent.state} data-family={agent.family}>
  <span class="sa-dots">
    <span class="sa-dot" style={{ '--d-slow': '4.7s', '--d-fast': '1.3s', '--delay-slow': '0.21s', '--delay-fast': '0.07s' }} />
    ... 8 more dots, each with prime-staggered durations + delays ...
  </span>
  <span class="sa-label">{agent.family}</span>
</button>
```
- [ ] Generate per-dot timing **deterministically** keyed off `agent.id` so dots in one indicator don't sync but the indicator stays stable across re-renders. Use prime numbers for the slow/fast durations from the sets below; pick by hashing `(agentId + dotIndex)` modulo the set length.
  - Slow durations (opacity, seconds): `[3.7, 4.1, 4.3, 4.7, 5.3, 5.9]`
  - Fast durations (scale, seconds):   `[1.1, 1.3, 1.7, 1.9]`
  - Slow delays (seconds): `[0, 0.13, 0.21, 0.31, 0.43, 0.59]`
  - Fast delays (seconds): `[0, 0.07, 0.11, 0.17, 0.23]`
- [ ] Spawn animation runs once on mount: `sa-spawn 0.5s var(--ease-premium)` (defined below). Sibling indicators in the same row get a 120ms staggered `animation-delay`.
- [ ] Wrap in `<Tooltip content={agent.task} />` (Phase 02 primitive).

### 9.3 — Indicator CSS

- [ ] Add to `src/index.css`:
```css
/* === Sub-agent indicators === */
.sa-indicator {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
  animation: sa-spawn 0.5s var(--ease-premium) both;
}
.sa-indicator:hover { background: var(--overlay-hover); }
.sa-indicator:focus-visible {
  outline: 1px solid var(--border-focus);
  outline-offset: 2px;
}

.sa-dots {
  display: grid;
  grid-template-columns: repeat(3, 3px);
  grid-template-rows:    repeat(3, 3px);
  gap: 1.5px;
  width: 11.5px; height: 11.5px;
}

.sa-dot {
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--text-tertiary);
  opacity: 0.5;
  transform-origin: center;
  animation:
    sa-murmur-slow var(--d-slow, 4.3s) ease-in-out var(--delay-slow, 0s) infinite,
    sa-murmur-fast var(--d-fast, 1.3s) ease-in-out var(--delay-fast, 0s) infinite;
}

/* Family colors override dot background */
.sa-indicator[data-family="v1"] .sa-dot { background: var(--v1-mid); }
.sa-indicator[data-family="v2"] .sa-dot { background: var(--v2-mid); }
.sa-indicator[data-family="v3"] .sa-dot { background: var(--v3-mid); }

/* States */
.sa-indicator[data-state="queued"] .sa-dot {
  animation: none;
  opacity: 0.04;
}
.sa-indicator[data-state="complete"] .sa-dot {
  animation: none;
  background: var(--green-accent);
  opacity: 0.6;
}
.sa-indicator[data-state="failed"] .sa-dot {
  animation: none;
  background: var(--red-accent);
  opacity: 0.6;
}

.sa-label {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: lowercase;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
}

@keyframes sa-murmur-slow {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1.0; }
}
@keyframes sa-murmur-fast {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.15); }
}
@keyframes sa-spawn {
  0%   { opacity: 0; transform: scale(0.5)  translateY(6px); }
  60%  { opacity: 1; transform: scale(1.05) translateY(-1px); }
  100% { opacity: 1; transform: scale(1)    translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .sa-indicator,
  .sa-dot { animation: none !important; }
  .sa-indicator[data-state="active"] .sa-dot { opacity: 0.85; }
}
```

### 9.4 — `SubAgentRow`

- [ ] Create `src/components/subagents/SubAgentRow.tsx`. Renders a row of `SubAgentIndicator` instances grouped by `parentAgent`. Apply `style={{ animationDelay: \`${index * 120}ms\` }}` to each indicator so siblings spawn in sequence.
- [ ] Drop into the existing message header / agent card area where Vektor (or another orchestrator) appears. Position is up to the host — the component is layout-agnostic.

### 9.5 — `SubAgentOverlay`

- [ ] Create `src/components/subagents/SubAgentOverlay.tsx`. Renders only when `subAgentStore.overlayOpenForParent !== null`.
- [ ] Markup:
```
<aside class="overlay-panel" data-open="true">
  <header class="overlay-header">
    <span class="overlay-crumb">SUB-AGENTS / {parent.toUpperCase()}</span>
    <button class="overlay-close-btn" aria-label="Close">×</button>
  </header>
  <section class="overlay-section">
    <h3 class="overlay-section-title">Lanes</h3>
    <div class="overlay-gantt"> ...lanes... </div>
  </section>
  <section class="overlay-section">
    <h3 class="overlay-section-title">Event log</h3>
    <ol class="overlay-events"> ...events... </ol>
  </section>
  <section class="overlay-section">
    <h3 class="overlay-section-title">Selected</h3>
    <div class="overlay-detail"> ... </div>
  </section>
</aside>
```
- [ ] Behaviors: ESC closes. Click outside the panel closes. Selecting an indicator from outside reuses the same panel and updates `selectedAgentId`.

### 9.6 — Overlay panel CSS

- [ ] Add to `src/index.css`:
```css
/* === Sub-agent overlay panel === */
.overlay-panel {
  position: absolute;
  top: var(--toolbar-height, 48px);
  right: 0;
  bottom: 0;
  width: 340px;
  background: var(--bg-deep);
  border-left: 1px solid var(--border-subtle);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 60;
  animation: panel-slide-in 320ms var(--ease-premium) both;
}
@keyframes panel-slide-in {
  0%   { transform: translateX(20px); opacity: 0; }
  100% { transform: translateX(0);    opacity: 1; }
}

.overlay-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.overlay-crumb {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  flex: 1;
}
.overlay-close-btn {
  width: 26px; height: 26px;
  background: transparent; border: none;
  color: var(--text-tertiary); cursor: pointer;
  border-radius: var(--radius-sm);
}
.overlay-close-btn:hover {
  background: var(--overlay-hover);
  color: var(--text-primary);
}

.overlay-section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.overlay-section:last-child { border-bottom: none; }
.overlay-section-title {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  margin: 0 0 10px;
}

/* === Gantt lanes === */
.overlay-gantt { display: flex; flex-direction: column; gap: 6px; }
.gantt-lane {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
}
.gantt-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
}
.gantt-lane[data-family="v1"] .gantt-dot { background: var(--v1-mid); }
.gantt-lane[data-family="v2"] .gantt-dot { background: var(--v2-mid); }
.gantt-lane[data-family="v3"] .gantt-dot { background: var(--v3-mid); }

.gantt-name {
  font-size: 10px;
  width: 52px;
  color: var(--text-soft);
}
.gantt-track {
  flex: 1;
  height: 4px;
  background: var(--surface-1);
  border-radius: 999px;
  position: relative;
  overflow: hidden;
}
.gantt-fill {
  position: absolute; top: 0; left: 0; bottom: 0;
  background: var(--v1-mid);
  border-radius: 999px;
  transition: width var(--dur-normal) var(--ease-out);
}
.gantt-lane[data-family="v2"] .gantt-fill { background: var(--v2-mid); }
.gantt-lane[data-family="v3"] .gantt-fill { background: var(--v3-mid); }
.gantt-lane[data-state="complete"] .gantt-fill {
  background: var(--green-accent);
  opacity: 0.20;
}

/* Trailing shimmer on the active fill edge */
.gantt-fill[data-active="true"]::after {
  content: '';
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 12px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18));
  animation: gantt-shimmer 1.5s ease-in-out infinite;
}
@keyframes gantt-shimmer {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}

/* === Event log === */
.overlay-events {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}
.overlay-event {
  display: grid;
  grid-template-columns: 24px 8px 40px 1fr;
  gap: 6px;
  align-items: center;
  font-family: var(--font-mono);
}
.overlay-event-time {
  font-size: 9px;
  text-align: right;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
}
.overlay-event-dot {
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--text-tertiary);
  margin: 0 auto;
}
.overlay-event-agent {
  font-size: 10px;
  color: var(--text-tertiary);
}
.overlay-event-text {
  font-size: 10px;
  color: var(--text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.overlay-event[data-age="aged"] .overlay-event-text,
.overlay-event[data-age="aged"] .overlay-event-agent { opacity: 0.4; }
.overlay-event[data-age="ancient"] .overlay-event-text,
.overlay-event[data-age="ancient"] .overlay-event-agent { opacity: 0.2; }

/* === Undo toast === */
.undo-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  display: flex; align-items: center; gap: 12px;
  z-index: 200;
  animation: toast-enter 300ms var(--ease-out) both;
  overflow: hidden;
}
.undo-toast-text {
  font-size: 12px;
  color: var(--text-body);
}
.undo-toast-action {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--amber-accent);
  background: transparent;
  border: none;
  cursor: pointer;
  letter-spacing: var(--track-mono);
  text-transform: uppercase;
}
.undo-toast-bar {
  position: absolute;
  bottom: 0; left: 0;
  height: 2px;
  background: var(--amber-accent);
  width: 100%;
  animation: undo-timer 3s linear forwards;
}
@keyframes toast-enter {
  0%   { transform: translate(-50%, 16px); opacity: 0; }
  100% { transform: translate(-50%, 0);    opacity: 1; }
}
@keyframes undo-timer {
  0%   { width: 100%; }
  100% { width: 0%;   }
}
```

### 9.7 — `UndoToast`

- [ ] Create `src/components/subagents/UndoToast.tsx`. Subscribes to `subAgentStore.pendingCancel`. When non-null, renders the toast with text `"Cancelled {agent.family}"`, an Undo action button, and the timer bar. Clicking Undo calls `subAgentStore.undoCancel()` and restores the agent's previous state. After 3s the toast unmounts.

### 9.8 — Mock data hook for development

- [ ] Create `src/hooks/useMockSubAgents.ts` (gated by `import.meta.env.DEV`). On mount, spawn three indicators (one v1, one v2, one v3) with mock tasks; advance their `progress` over a few seconds; emit a stream of fake events; mark v2 complete after 6s. Mount in `Memory.tsx` or a temporary `/playground` route during development only.

## Verification

1. **Render baseline:** With mock hook active, three indicators appear in a row. Each indicator's 9 dots animate independently — capture two `browser_snapshot()` 700ms apart and confirm the dot opacity/scale pattern differs (visual; not pixel-equal).
2. **No sync:** Inspect any two `.sa-dot` elements via DevTools — their `animationDuration` and `animationDelay` should differ.
3. **Spawn stagger:** `browser_snapshot()` immediately after row mounts shows indicators at different scale/opacity points along the spawn curve.
4. **Hover tooltip:** `browser_hover('.sa-indicator')` — tooltip with task text appears within 250ms.
5. **Click → overlay:** `browser_click('.sa-indicator')` — overlay panel slides in from right (320ms), gantt lanes render with per-family colors, event log populates. Computed-style audit:
   ```js
   () => {
     const p = document.querySelector('.overlay-panel')
     return getComputedStyle(p).width
   }
   ```
   Assert `width === '340px'`.
6. **State transitions:** Drive `update(id, { state: 'complete' })` — dots stop animating, dots turn green, lane fill turns green at 0.20 opacity, shimmer disappears.
7. **Cancel + undo:** Click cancel on an indicator → `.sa-indicator[data-state="failed"]` + undo toast appears bottom-center. Timer bar shrinks over 3s. Click Undo within 3s → state restores. Wait past 3s without clicking → toast unmounts, cancel persists.
8. **Reduced motion:** Set `prefers-reduced-motion: reduce` — dots stop animating; active indicators still distinguishable by 0.85 opacity.
9. **Console:** 0 errors on mount, click, update, cancel, undo.

## Backend asks

None for this phase. When Luca's `chat-multi` edge function eventually emits sub-agent lifecycle events, wire them into `subAgentStore` via realtime — no schema changes required for v1; sub-agents live in-memory.

## Commit

```
phase 09: sub-agent visualization (3×3 murmur grids + overlay)

- src/components/subagents/SubAgentIndicator.tsx (new) — 3×3 dot
  grid, prime-staggered slow/fast animations per dot, deterministic
  per-id timing so re-renders don't reshuffle
- src/components/subagents/SubAgentRow.tsx (new) — sibling 120ms
  spawn stagger
- src/components/subagents/SubAgentOverlay.tsx (new) — right-side
  panel: gantt lanes with shimmer, event log with age fades,
  selected-agent detail
- src/components/subagents/UndoToast.tsx (new) — 3s undo window
  with shrinking timer bar
- src/stores/subAgentStore.ts (new) — agents map, events ring
  buffer (200), overlay + cancel state
- src/hooks/useMockSubAgents.ts (DEV only) — drives dev preview
- src/index.css — .sa-*, .overlay-*, .gantt-*, .undo-toast classes
  + sa-murmur-slow/fast/spawn keyframes + reduced-motion guard

Verified: dots animate independently, spawn stagger reads,
overlay slide 320ms premium, gantt shimmer trails active edge,
undo restores within 3s, reduced-motion disables animation,
0 console errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

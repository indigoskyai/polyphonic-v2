# Phase 10 — Group Session Voice Room

## Goal

A multi-agent voice room. Three large agent cards on stage — Luca, Vektor, Anima — each a 160×160 circle. The active speaker gets a per-agent halo that pulses with two offset ripples, and a per-agent waveform of six bars beneath the card. A queue indicator on the right shows speaker order. A live transcript panel below the stage shows finalized lines and partial in-progress text with a blinking cursor. A listening bar at the bottom of the screen shows seven mic-bars representing room audio capture.

This is future-scope — voice infra (LiveKit / WebRTC track wiring) lands separately. Build the visual scene now, driven by a store, with a mock hook for development.

## Dependencies

- Phase 01 (foundation tokens — agent colors, surface tokens, motion tokens, border-focus)
- Phase 02 (Pill, Tooltip primitives)

## Files

```
src/pages/GroupSession.tsx                   (new — route /group)
src/components/group/Stage.tsx               (new)
src/components/group/AgentCard.tsx           (new)
src/components/group/Waveform.tsx            (new)
src/components/group/QueueIndicator.tsx      (new)
src/components/group/Transcript.tsx          (new)
src/components/group/ListeningBar.tsx        (new)
src/stores/groupSessionStore.ts              (new)
src/hooks/useMockGroupSession.ts             (DEV only)
src/index.css                                (add classes below)
```

## Tasks

### 10.1 — `groupSessionStore`

- [ ] Create `src/stores/groupSessionStore.ts`:
```ts
import { create } from 'zustand'

export type AgentKey = 'luca' | 'vektor' | 'anima'
export type AgentMode = 'idle' | 'listening' | 'speaking'

export interface AgentSlot {
  agent: AgentKey
  mode: AgentMode
  position: 1 | 2 | 3       // queue order
}

export interface TranscriptEntry {
  id: string
  ts: number
  agent: AgentKey | 'user'
  partial: boolean
  text: string
}

interface GroupSessionStore {
  slots: Record<AgentKey, AgentSlot>
  queue: AgentKey[]
  transcript: TranscriptEntry[]
  micActive: boolean
  setMode:        (a: AgentKey, mode: AgentMode) => void
  setQueue:       (q: AgentKey[]) => void
  appendPartial:  (a: AgentKey | 'user', text: string) => void
  finalizeLine:   (a: AgentKey | 'user') => void
  setMic:         (active: boolean) => void
}
```
- [ ] `appendPartial` updates the trailing partial entry for that speaker (one open partial per speaker max). `finalizeLine` flips that entry's `partial` to false.

### 10.2 — Stage layout

- [ ] Create `src/components/group/Stage.tsx`. Renders three `AgentCard`s in a horizontal flex row, gap 32px, padding 48px 32px, with a soft radial backdrop.

- [ ] CSS:
```css
/* === Group session stage === */
.group-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 48px 32px;
  background: radial-gradient(ellipse at center, var(--surface-1) 0%, var(--canvas) 70%);
  position: relative;
}
```

### 10.3 — `AgentCard`

- [ ] Create `src/components/group/AgentCard.tsx`:
```tsx
interface Props {
  agent: AgentKey
  mode:  AgentMode
}
```
- [ ] Markup:
```
<div class="agent-card" data-agent={agent} data-mode={mode}>
  <div class="agent-halo" aria-hidden />
  <div class="agent-portrait">
    <span class="agent-glyph">{agent[0]}</span>
  </div>
  <div class="agent-name">{agent}</div>
  {mode === 'speaking' && <Waveform agent={agent} />}
</div>
```

### 10.4 — AgentCard CSS

- [ ] Add to `src/index.css`:
```css
/* === Agent card === */
.agent-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 160px;
}

.agent-portrait {
  position: relative;
  width: 160px; height: 160px;
  border-radius: 50%;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: center;
  transition:
    background var(--dur-normal) var(--ease-out),
    border-color var(--dur-normal) var(--ease-out),
    opacity     var(--dur-normal) var(--ease-out);
}
.agent-glyph {
  font-family: var(--font-display);
  font-size: 48px;
  color: var(--text-soft);
  text-transform: lowercase;
}

/* Speaking — per-agent fill + halo on */
.agent-card[data-mode="speaking"][data-agent="luca"] .agent-portrait {
  background: radial-gradient(circle at 50% 45%, rgba(201,168,124,0.06), var(--surface-1) 70%);
  border-color: var(--luca);
}
.agent-card[data-mode="speaking"][data-agent="vektor"] .agent-portrait {
  background: radial-gradient(circle at 50% 45%, rgba(124,168,201,0.06), var(--surface-1) 70%);
  border-color: var(--vektor);
}
.agent-card[data-mode="speaking"][data-agent="anima"] .agent-portrait {
  background: radial-gradient(circle at 50% 45%, rgba(201,124,168,0.06), var(--surface-1) 70%);
  border-color: var(--anima);
}

/* Listening — inward focus glow */
.agent-card[data-mode="listening"] .agent-portrait {
  border-color: var(--border-focus);
  background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.04), var(--surface-1) 60%);
  animation: listening-pulse 1.8s ease-in-out infinite;
}
@keyframes listening-pulse {
  0%, 100% { box-shadow: inset 0 0 12px rgba(255,255,255,0.04); }
  50%      { box-shadow: inset 0 0 18px rgba(255,255,255,0.08); }
}

/* Idle — dim */
.agent-card[data-mode="idle"] { opacity: 0.5; }

/* === Halo === */
.agent-halo {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--dur-normal) var(--ease-out);
}
.agent-card[data-mode="speaking"] .agent-halo {
  opacity: 1;
  animation: halo-pulse 2.2s ease-in-out infinite;
}
.agent-halo::before,
.agent-halo::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0;
}
.agent-card[data-mode="speaking"] .agent-halo::before {
  animation: halo-ripple 2.2s ease-out infinite;
}
.agent-card[data-mode="speaking"] .agent-halo::after {
  animation: halo-ripple 2.2s ease-out 0.8s infinite;
}

.agent-card[data-agent="luca"]   .agent-halo { color: var(--luca);   }
.agent-card[data-agent="vektor"] .agent-halo { color: var(--vektor); }
.agent-card[data-agent="anima"]  .agent-halo { color: var(--anima);  }

@keyframes halo-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.5;  }
  50%      { transform: scale(1.08); opacity: 0.85; }
}
@keyframes halo-ripple {
  0%   { transform: scale(1);    opacity: 0.6; }
  100% { transform: scale(1.25); opacity: 0;   }
}

.agent-name {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-soft);
  text-transform: lowercase;
  letter-spacing: var(--track-mono);
}

@media (prefers-reduced-motion: reduce) {
  .agent-halo,
  .agent-halo::before,
  .agent-halo::after,
  .agent-card[data-mode="listening"] .agent-portrait { animation: none !important; }
}
```

### 10.5 — `Waveform`

- [ ] Create `src/components/group/Waveform.tsx`:
```tsx
interface Props { agent: AgentKey }
```
Render six bars with fixed heights `[6, 10, 7, 11, 5, 8]` and staggered delays `[0s, 0.1s, 0.2s, 0.3s, 0.15s, 0.25s]`.

- [ ] CSS:
```css
.waveform {
  display: flex; align-items: flex-end; gap: 3px;
  height: 14px;
}
.wf-bar {
  width: 2px;
  border-radius: 999px;
  background: var(--text-soft);
  transform-origin: center bottom;
  animation: wf 0.9s ease-in-out infinite;
}
.waveform[data-agent="luca"]   .wf-bar { background: var(--luca);   }
.waveform[data-agent="vektor"] .wf-bar { background: var(--vektor); }
.waveform[data-agent="anima"]  .wf-bar { background: var(--anima);  }

@keyframes wf {
  0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
  50%      { transform: scaleY(1);   opacity: 1;   }
}
@media (prefers-reduced-motion: reduce) {
  .wf-bar { animation: none !important; transform: scaleY(0.7); }
}
```

### 10.6 — `QueueIndicator`

- [ ] Create `src/components/group/QueueIndicator.tsx`. Renders the speaker queue as a vertical list of agent dots with the next-up highlighted.

- [ ] CSS:
```css
.queue-indicator {
  position: absolute;
  top: 32px; right: 32px;
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.queue-title {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: var(--track-folio);
  color: var(--text-whisper);
  margin-bottom: 4px;
}
.queue-row {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-soft);
}
.queue-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.queue-row[data-agent="luca"]   .queue-dot { background: var(--luca);   }
.queue-row[data-agent="vektor"] .queue-dot { background: var(--vektor); }
.queue-row[data-agent="anima"]  .queue-dot { background: var(--anima);  }
.queue-row[data-next="true"]    { color: var(--text-primary); }
```

### 10.7 — `Transcript`

- [ ] Create `src/components/group/Transcript.tsx`. Renders a scrollable list under the stage; auto-scrolls to bottom on new entry. Each entry layout: `[time] [role] [body]`.

- [ ] CSS:
```css
.transcript {
  max-height: 280px;
  overflow-y: auto;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
}
.transcript-entry {
  display: grid;
  grid-template-columns: 60px 80px 1fr;
  gap: 12px;
  padding: 8px 0;
  font-size: 13.5px;
  line-height: 1.6;
}
.transcript-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-whisper);
  letter-spacing: var(--track-mono);
  padding-top: 3px;
}
.transcript-role {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: lowercase;
  letter-spacing: var(--track-mono);
  padding-top: 2px;
}
.transcript-entry[data-agent="luca"]   .transcript-role { color: var(--luca);   }
.transcript-entry[data-agent="vektor"] .transcript-role { color: var(--vektor); }
.transcript-entry[data-agent="anima"]  .transcript-role { color: var(--anima);  }
.transcript-entry[data-agent="user"]   .transcript-role { color: var(--text-primary); }

.transcript-body {
  color: var(--text-body);
}
.transcript-entry[data-partial="true"] .transcript-body {
  font-style: italic;
  color: var(--text-secondary);
}
.transcript-entry[data-partial="true"] .transcript-body::after {
  content: '';
  display: inline-block;
  width: 2px; height: 14px;
  background: var(--text-tertiary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 1s ease-in-out infinite;
}
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
```

### 10.8 — `ListeningBar`

- [ ] Create `src/components/group/ListeningBar.tsx`. Fixed at the bottom of the page when the room is active. Seven `.mic-bar` elements with heights `[8, 18, 22, 14, 10, 16, 6]` and staggered delays `[0s, 0.05s, 0.1s, 0.15s, 0.2s, 0.25s, 0.3s]`.

- [ ] CSS:
```css
.listening-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(180deg, transparent, var(--bg-deep) 60%);
  z-index: 50;
}
.listening-mic-row {
  display: flex; align-items: flex-end; gap: 4px;
  height: 26px;
}
.mic-bar {
  width: 3px;
  border-radius: 999px;
  background: var(--border-focus);
  transform-origin: center bottom;
  animation: mic-viz 0.9s ease-in-out infinite;
}
.listening-bar[data-mic="false"] .mic-bar {
  animation: none;
  opacity: 0.3;
  transform: scaleY(0.4);
}
.listening-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: var(--track-mono);
  text-transform: lowercase;
}
@keyframes mic-viz {
  0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
  50%      { transform: scaleY(1);   opacity: 1;   }
}
@media (prefers-reduced-motion: reduce) {
  .mic-bar { animation: none !important; transform: scaleY(0.7); }
}
```

### 10.9 — `GroupSession` page + mock hook

- [ ] Create `src/pages/GroupSession.tsx`. Composes `<Stage />`, `<QueueIndicator />`, `<Transcript />`, `<ListeningBar />`. Wire to `groupSessionStore`.
- [ ] Add route `/group` to the router.
- [ ] Create `src/hooks/useMockGroupSession.ts` (DEV only). Cycles a simple script: Luca speaks for 4s, Vektor speaks for 5s, Anima speaks for 3s, repeat. Streams partial text per speaker letter-by-letter, finalizes on speaker change. Updates queue + listening state on a 1s interval.

## Verification

1. **Stage render:** Navigate to `/group`. Three agent cards visible, idle (opacity 0.5).
2. **Speaking state:** Drive `setMode('luca', 'speaking')`. Luca card becomes opacity 1, halo appears around it pulsing every 2.2s, two ripples expand on offset (0s and 0.8s). Waveform appears beneath card with 6 bars animating. Bars use `var(--luca)`.
3. **Listening state:** Drive `setMode('vektor', 'listening')`. Vektor card border changes to `--border-focus`, inward glow animates.
4. **Idle:** A card with `mode='idle'` renders at opacity 0.5, no halo, no waveform.
5. **Queue indicator:** With queue `['vektor', 'anima', 'luca']`, the indicator shows them in order with Vektor as next-up highlighted.
6. **Transcript partial:** Stream a partial line — text renders italic with a blinking 2px cursor that toggles opacity 1↔0 every 1s.
7. **Transcript final:** Call `finalizeLine` — italic + cursor disappear; entry becomes plain.
8. **Listening bar:** With `micActive=true`, 7 mic-bars animate. With `micActive=false`, animation halts at scaleY 0.4 / opacity 0.3.
9. **Computed-style audit:**
   ```js
   () => {
     const card = document.querySelector('.agent-card[data-mode="speaking"] .agent-portrait')
     return getComputedStyle(card).borderColor
   }
   ```
   Assert color matches the speaking agent's token.
10. **Reduced motion:** With `prefers-reduced-motion: reduce`, halo/ripples/waveform/listening-bar animations stop; visual identity preserved (color fills, border colors).
11. **Console:** 0 errors when toggling modes, streaming transcript, switching mic.

## Backend asks

None for the visual scene. When voice infra arrives, wire the audio track activity-detector → `setMode`, the STT partial stream → `appendPartial`/`finalizeLine`, and the local mic VAD → `setMic`. No schema changes needed for v1.

## Commit

```
phase 10: group session voice room (visual scene)

- src/pages/GroupSession.tsx (new) — /group route
- src/components/group/Stage.tsx (new) — three-card layout with
  radial backdrop
- src/components/group/AgentCard.tsx (new) — 160px circle with
  per-agent halo (dual offset ripples) + listening inward glow +
  idle dim state
- src/components/group/Waveform.tsx (new) — 6 bars, per-agent
  color, prime-staggered scale
- src/components/group/QueueIndicator.tsx (new) — speaker order
  with next-up highlight
- src/components/group/Transcript.tsx (new) — partial text in
  italic with blinking cursor
- src/components/group/ListeningBar.tsx (new) — 7 mic-bars,
  fixed bottom, dimmed when mic off
- src/stores/groupSessionStore.ts (new) — slots, queue,
  transcript, mic state
- src/hooks/useMockGroupSession.ts (DEV) — drives dev preview
- src/index.css — .group-stage, .agent-card/halo/portrait,
  .waveform, .queue-*, .transcript-*, .listening-* + keyframes

Verified: halo dual-ripple alignment, per-agent color tokens,
listening glow distinct from speaking halo, transcript cursor
blinks 1s, mic-bars halt cleanly when mic off, reduced-motion
respected, 0 console errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

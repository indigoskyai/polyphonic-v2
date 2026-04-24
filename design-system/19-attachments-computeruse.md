# Phase 19 — Attachments + Computer-Use

## Goal

Three concrete additions to the message surface: (a) attachment chips inside the composer with drag-drop overlay, (b) inline message attachments (file chips, image previews, code preview cards with fade-out mask + expand toggle), (c) computer-use viewport — when an agent uses a virtual browser, render a `browser-card` with status dot, fake URL bar, viewport preview with a tracked cursor halo, and an actions log beneath.

## Dependencies

- Phase 01 (foundation tokens — surfaces, mono font, agent colors, green accents)
- Phase 02 (Pill, EmptyState patterns)
- Phase 03 (composer — attachment chips live inside the composer wrapper)
- Phase 15 (rich content — code preview shares syntax token colors)

## Files to create

```
src/components/attachments/AttachmentChip.tsx
src/components/attachments/AttachmentDropOverlay.tsx
src/components/attachments/MessageAttachment.tsx
src/components/attachments/ImagePreview.tsx
src/components/attachments/CodePreviewCard.tsx
src/components/computeruse/BrowserCard.tsx
src/components/computeruse/BrowserCursor.tsx
src/components/computeruse/BrowserActionLog.tsx
src/stores/attachmentStore.ts
src/stores/browserSessionStore.ts
```
- `src/index.css` — `.att-chip`, `.drag-overlay`, `.msg-att`, `.img-prev`, `.code-prev`, `.bc-*` classes
- `src/components/composer/Composer.tsx` — wire chips + drop overlay
- `src/components/messages/MessageBody.tsx` — render inline attachments + browser cards

## Tasks

### 19.1 — `attachmentStore`

- [ ] Create `src/stores/attachmentStore.ts`:
```ts
import { create } from 'zustand'

export interface Attachment {
  id: string
  name: string
  size: number
  mime: string
  status: 'pending' | 'uploading' | 'ready' | 'error'
  url?: string
  thumbnail?: string
}
interface AttachmentState {
  pending: Attachment[]            // attached to current composer
  add: (files: File[]) => void
  remove: (id: string) => void
  clear: () => void
}
export const useAttachmentStore = create<AttachmentState>(/* impl */)
```

### 19.2 — Composer attachment chips

- [ ] CSS:
```css
.att-chips-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 8px 12px 0;
}
.att-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 6px 5px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}
.att-chip-icon {
  width: 13px; height: 13px;
  color: var(--text-soft);
  stroke-width: 1.8;
  flex-shrink: 0;
}
.att-chip-name {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
}
.att-chip-size {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
}
.att-chip-remove {
  width: 16px; height: 16px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.att-chip-remove:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
.att-chip-remove svg { width: 9px; height: 9px; stroke-width: 2; }
```

### 19.3 — Drag-drop overlay

- [ ] CSS:
```css
.drag-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(10, 10, 10, 0.4);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.input-wrapper.dragging .drag-overlay { opacity: 1; }
.input-wrapper.dragging {
  border-color: var(--border-focus);
  border-style: dashed;
  background: rgba(220, 219, 216, 0.015);
}
.drag-overlay-text {
  font-size: 12px; font-weight: 450;
  color: var(--text-body);
}
```

- [ ] Composer wires `onDragEnter` → `setDragging(true)`, `onDragLeave/Drop` → `setDragging(false)`. Drop calls `attachmentStore.add(files)`.

### 19.4 — Inline message attachment chip

- [ ] CSS:
```css
.msg-att {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  max-width: 400px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  text-decoration: none;
}
.msg-att:hover {
  background: var(--surface-2);
  border-color: var(--border);
}
.msg-att-icon {
  width: 28px; height: 28px;
  border-radius: 4px;
  background: var(--bg-surface);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.msg-att-icon svg { width: 14px; height: 14px; color: var(--text-soft); stroke-width: 1.8; }
.msg-att-info { min-width: 0; }
.msg-att-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msg-att-meta {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  margin-top: 2px;
}
```

### 19.5 — Image preview

- [ ] CSS:
```css
.img-prev {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  background: linear-gradient(135deg, var(--surface-1), var(--surface-2), var(--surface-3));
  display: flex; align-items: center; justify-content: center;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.img-prev:hover { border-color: var(--border); }
.img-prev img { width: 100%; height: 100%; object-fit: cover; }
.img-prev-placeholder {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
}
```

- [ ] Per-agent variants when image is generated by agent:
```css
.img-prev[data-agent="luca"]   { background: linear-gradient(135deg, rgba(201,168,124,0.10), var(--surface-2), rgba(201,168,124,0.04)); }
.img-prev[data-agent="vektor"] { background: linear-gradient(135deg, rgba(124,168,201,0.10), var(--surface-2), rgba(124,168,201,0.04)); }
.img-prev[data-agent="anima"]  { background: linear-gradient(135deg, rgba(201,124,168,0.10), var(--surface-2), rgba(201,124,168,0.04)); }
```

### 19.6 — Code preview card

- [ ] CSS:
```css
.code-prev {
  max-width: 520px;
  background: var(--floor);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
  position: relative;
}
.code-prev-header {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.code-prev-lines {
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-body);
  max-height: 220px;
  overflow: hidden;
  position: relative;
}
.code-prev-lines::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 64px;
  background: linear-gradient(180deg, transparent, var(--floor) 80%);
  pointer-events: none;
}
.code-prev-expand {
  display: block;
  width: 100%;
  padding: 6px 14px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  text-align: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.code-prev-expand:hover { background: var(--bg-surface); color: var(--text-primary); }
.code-prev[data-expanded="true"] .code-prev-lines { max-height: none; }
.code-prev[data-expanded="true"] .code-prev-lines::after { display: none; }
```

- [ ] Syntax highlighting tokens reuse Phase 15 color set (do not redefine here).

### 19.7 — `browserSessionStore`

- [ ] Create `src/stores/browserSessionStore.ts`:
```ts
import { create } from 'zustand'

export interface BrowserAction {
  id: string
  ts: string                     // ISO
  status: 'pending' | 'success' | 'error'
  text: string
}
export interface BrowserSession {
  id: string
  agent: 'luca' | 'vektor' | 'anima' | 'observer'
  url: string
  status: 'live' | 'done' | 'errored'
  cursor: { x: number; y: number }   // 0..100 percent of viewport
  actions: BrowserAction[]
}
interface BrowserSessionState {
  sessions: Record<string, BrowserSession>
  upsert: (s: BrowserSession) => void
  appendAction: (sessionId: string, a: BrowserAction) => void
  setCursor: (sessionId: string, x: number, y: number) => void
}
export const useBrowserSessionStore = create<BrowserSessionState>(/* impl */)
```

### 19.8 — `BrowserCard` shell

- [ ] CSS:
```css
.browser-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin: 20px 0;
  overflow: hidden;
  animation: bc-fade-in 320ms var(--ease-premium);
}
@keyframes bc-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.bc-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; gap: 10px;
}
.bc-status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.bc-status-dot.live {
  background: var(--green-accent);
  box-shadow: var(--green-glow);
  animation: bc-pulse 2s ease-in-out infinite;
}
.bc-status-dot.done { background: var(--text-soft); }
@keyframes bc-pulse {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
.bc-status-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
}
.bc-spacer { flex: 1; }
.bc-meta {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-whisper);
}
```

### 19.9 — URL bar

- [ ] CSS:
```css
.bc-url {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--floor);
}
.bc-url-dots { display: inline-flex; gap: 5px; }
.bc-url-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--border-strong);
}
.bc-url-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-soft);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1;
}
```

### 19.10 — Viewport + cursor

- [ ] CSS:
```css
.bc-viewport {
  aspect-ratio: 16 / 10;
  background: linear-gradient(135deg, #1a1a1c, #141416);
  position: relative;
  overflow: hidden;
}
.bc-viewport::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(0deg, rgba(244,243,240,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(244,243,240,0.02) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}
.bc-cursor {
  position: absolute;
  width: 12px; height: 12px;
  transition: top 0.3s cubic-bezier(0.22, 1, 0.36, 1), left 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.bc-cursor::before {
  content: '';
  position: absolute; inset: 0;
  border-radius: 50%;
  border: 1px solid var(--vektor-full);
  animation: cursor-ring 1.5s ease-out infinite;
}
.bc-cursor::after {
  content: '';
  position: absolute;
  top: 4px; left: 4px;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--vektor-full);
}
@keyframes cursor-ring {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(3); opacity: 0; }
}
```

- [ ] Cursor positioned via inline `style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}`. CSS `transition` handles the smooth tracking.

### 19.11 — Action log

- [ ] CSS:
```css
.bc-log {
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  max-height: 160px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 4px;
}
.bc-log-row {
  display: grid;
  grid-template-columns: 44px 16px 1fr auto;
  gap: 10px;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 11px;
}
.bc-log-status {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: var(--track-meta);
}
.bc-log-status.pending { color: var(--amber-accent); }
.bc-log-status.success { color: var(--green-accent); }
.bc-log-status.error   { color: var(--red-accent); }
.bc-log-text { color: var(--text-body); }
.bc-log-ts {
  font-size: 10px;
  color: var(--text-whisper);
  text-align: right;
}
```

- [ ] Footer:
```css
.bc-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
}
```

## Verification

1. **Composer chips:** Drop a file onto composer — chip appears in `.att-chips-row` with mono name + size + remove button. Remove → chip disappears.
2. **Drag overlay:** Drag a file over composer — `.input-wrapper.dragging` class adds; border becomes dashed `--border-focus`; overlay text appears with 0.4 black tint + 2px blur.
3. **Inline attachment chip:** A message with attachments renders `.msg-att` chip; hover lifts background to `--surface-2` and border to `--border`.
4. **Image preview:** Image attachment renders 16:10 placeholder gradient when no URL; renders actual image when URL present; agent variant gradient applies for `data-agent` attribute.
5. **Code preview:** Long code block shows fade-out mask at bottom (verify via screenshot — gradient from transparent to `--floor`); EXPAND toggle removes mask and lifts max-height.
6. **Browser card:** Trigger via console:
   ```js
   useBrowserSessionStore.getState().upsert({ id:'t', agent:'vektor', url:'example.com', status:'live', cursor:{x:30,y:40}, actions:[] })
   ```
   Card fades in. Live status dot pulses 2s. Cursor renders with ring pulse animation.
7. **Cursor tracking:** Update cursor:
   ```js
   useBrowserSessionStore.getState().setCursor('t', 70, 50)
   ```
   Cursor smoothly transitions to new position over 300ms.
8. **Action log:** Append actions — pending shows amber, success green, error red.
9. **Computed-style audit:**
   ```js
   () => {
     const cursor = document.querySelector('.bc-cursor')
     const cs = getComputedStyle(cursor, '::before')
     return { animation: cs.animation }
   }
   ```
   Assert animation includes `cursor-ring 1.5s`.
10. **Reduced motion:** Cursor ring + status pulse halt under `prefers-reduced-motion: reduce`.
11. **Console:** 0 new errors.

## Backend asks

If browser-use sessions are not yet streamed: add edge function `browser-session-stream` that emits `{ session_id, type: 'cursor' | 'action' | 'status', payload }` events via Supabase Realtime channel `browser:{session_id}`. Client subscribes and dispatches to `browserSessionStore`.

## Commit

```
phase 19: attachments + computer-use

- src/components/attachments/{AttachmentChip,AttachmentDropOverlay,
  MessageAttachment,ImagePreview,CodePreviewCard}.tsx (new)
- src/components/computeruse/{BrowserCard,BrowserCursor,
  BrowserActionLog}.tsx (new)
- src/stores/{attachmentStore,browserSessionStore}.ts (new)
- src/index.css — .att-chip, .drag-overlay (0.4 black + 2px blur,
  dashed focus border on .dragging), .msg-att (hover lift),
  .img-prev (16:10 + agent gradient variants), .code-prev
  (220px max-height + fade-out mask + EXPAND toggle), .bc-*
  (browser-card fadeIn, pulsing live status dot, URL bar,
  viewport with grid pattern, cursor with vektor ring pulse +
  smooth 300ms tracking, action log with status colors)
- src/components/composer/Composer.tsx — wire chips + drop
- src/components/messages/MessageBody.tsx — render inline atts
  + browser cards

Verified: drop adds chip, drag overlay shows, inline attachments
render with hover lift, code preview mask + expand toggle,
browser card cursor tracks via setCursor, reduced-motion halts
ring/pulse animations.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

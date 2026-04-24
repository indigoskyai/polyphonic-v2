# Phase 11 — Multi-Agent Comms Patterns

## Goal

Canonical primitives for multi-agent message UI. The phase establishes the **sidehead grid** (72px sidehead column + body), the **@mention pill** (inline + autocomplete dropdown), the **handoff suggestion card**, the **multi-response broadcast** indicator on user prompts, and the **streaming + thinking** indicators. Every multi-agent surface in the app — chat composer, thread view, group session transcript, notifications — composes from these primitives, so the spec is exhaustive even where the components feel small.

## Dependencies

- Phase 01 (foundation tokens — agent colors, surface tokens, radius, motion, mono/sans typography)
- Phase 02 (Pill, Tooltip primitives)

## Files

```
src/components/messages/MessageRow.tsx           (new — sidehead grid)
src/components/messages/MentionPill.tsx          (new — inline pill)
src/components/messages/MentionAutocomplete.tsx  (new — dropdown)
src/components/messages/HandoffCard.tsx          (new)
src/components/messages/TargetIndicator.tsx      (new — on user prompts)
src/components/messages/StreamingCursor.tsx      (new)
src/components/messages/ThinkingDots.tsx         (new)
src/components/messages/SystemEvent.tsx          (new)
src/index.css                                    (add classes below)
```

## Tasks

### 11.1 — `MessageRow` (sidehead grid)

- [ ] Create `src/components/messages/MessageRow.tsx`:
```tsx
type Role = 'luca' | 'vektor' | 'anima' | 'mnemos' | 'user' | 'system'
interface Props {
  role: Role
  children: React.ReactNode      // body
  streaming?: boolean
  thinking?: boolean
  targets?: Role[]               // only meaningful when role==='user'
}
```
- [ ] Markup:
```
<article class="msg-row" data-role={role} data-streaming={streaming}>
  <header class="msg-sidehead">
    <span class="msg-role">{roleLabel(role)}</span>
    {role === 'user' && targets?.length ? <TargetIndicator targets={targets} /> : null}
  </header>
  <div class="msg-body">
    {thinking ? <ThinkingDots agent={role} /> : children}
    {streaming && !thinking && <StreamingCursor />}
  </div>
</article>
```

### 11.2 — Sidehead grid CSS

- [ ] Add to `src/index.css`:
```css
/* === Message row (sidehead grid) === */
.msg-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 16px;
  padding: 12px 0;
  align-items: start;
}
.msg-sidehead {
  display: flex; flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding-top: 2px;
}
.msg-role {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
  color: var(--text-tertiary);
}
.msg-row[data-role="luca"]   .msg-role { color: var(--luca);   }
.msg-row[data-role="vektor"] .msg-role { color: var(--vektor); }
.msg-row[data-role="anima"]  .msg-role { color: var(--anima);  }
.msg-row[data-role="mnemos"] .msg-role { color: var(--text-secondary); }
.msg-row[data-role="user"]   .msg-role { color: var(--text-primary); }
.msg-row[data-role="system"] .msg-role { color: var(--text-whisper); }

.msg-body {
  font-size: 14.5px;
  line-height: 1.65;
  font-weight: 370;
  color: var(--text-primary);
  letter-spacing: var(--track-body);
}
```

### 11.3 — `MentionPill` (inline)

- [ ] Create `src/components/messages/MentionPill.tsx`:
```tsx
interface Props {
  agent: 'luca' | 'vektor' | 'anima' | 'mnemos' | string
  children?: React.ReactNode    // typically `@${agent}`
}
```
- [ ] Render `<span class="input-mention" data-agent={agent}>@{agent}</span>`. Used both in the composer (inside `contenteditable`) and in rendered message bodies.

- [ ] CSS:
```css
.input-mention {
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0;
  white-space: nowrap;
  vertical-align: baseline;
}
.input-mention[data-agent="luca"] {
  color: var(--luca);
  background: rgba(201, 168, 124, 0.08);
}
.input-mention[data-agent="vektor"] {
  color: var(--vektor);
  background: rgba(124, 168, 201, 0.08);
}
.input-mention[data-agent="anima"] {
  color: var(--anima);
  background: rgba(201, 124, 168, 0.08);
}
.input-mention[data-agent="mnemos"] {
  color: var(--text-secondary);
  background: var(--surface-1);
}
```

### 11.4 — `MentionAutocomplete` (dropdown)

- [ ] Create `src/components/messages/MentionAutocomplete.tsx`:
```tsx
interface Option { agent: string; label: string }
interface Props {
  options: Option[]
  highlighted: number                      // index
  onSelect: (agent: string) => void
  onHover:  (idx: number) => void
}
```
- [ ] Position absolute, anchored above the composer input (`bottom: calc(100% + 4px); left: 18px`).

- [ ] CSS:
```css
.mention-dropdown {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 18px;
  min-width: 140px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  padding: 4px;
  z-index: 40;
}
.mention-option {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background var(--dur-fast, 120ms) var(--ease-out);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-soft);
}
.mention-option:hover,
.mention-option[data-highlighted="true"] {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.mention-option-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.mention-option[data-agent="luca"]   .mention-option-dot { background: var(--luca);   }
.mention-option[data-agent="vektor"] .mention-option-dot { background: var(--vektor); }
.mention-option[data-agent="anima"]  .mention-option-dot { background: var(--anima);  }
```

### 11.5 — `HandoffCard`

- [ ] Create `src/components/messages/HandoffCard.tsx`:
```tsx
interface Props {
  from: 'luca' | 'vektor' | 'anima'
  to:   'luca' | 'vektor' | 'anima'
  suggestion: string
  onAccept:  () => void
  onDismiss: () => void
}
```
- [ ] Markup:
```
<aside class="handoff-card">
  <div class="handoff-row">
    <span class="handoff-agent" data-agent={from}>{from}</span>
    <span class="handoff-arrow">→</span>
    <span class="handoff-agent" data-agent={to}>{to}</span>
  </div>
  <p class="handoff-suggestion">{suggestion}</p>
  <div class="handoff-actions">
    <Pill variant="primary" onClick={onAccept}>Accept handoff</Pill>
    <Pill variant="ghost" onClick={onDismiss}>Dismiss</Pill>
  </div>
</aside>
```

- [ ] CSS:
```css
.handoff-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  margin: 24px 0;
  display: flex; flex-direction: column;
  gap: 10px;
}
.handoff-row {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: lowercase;
  letter-spacing: var(--track-mono);
}
.handoff-agent { font-weight: 500; }
.handoff-agent[data-agent="luca"]   { color: var(--luca);   }
.handoff-agent[data-agent="vektor"] { color: var(--vektor); }
.handoff-agent[data-agent="anima"]  { color: var(--anima);  }
.handoff-arrow {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
.handoff-suggestion {
  margin: 0;
  font-size: 13px;
  color: var(--text-body);
  line-height: 1.55;
}
.handoff-actions {
  display: flex; gap: 8px;
}
```

### 11.6 — `TargetIndicator` (on user prompts)

- [ ] Create `src/components/messages/TargetIndicator.tsx`:
```tsx
interface Props { targets: Role[] }
```
- [ ] Render inline at the end of the role label: small dots per target agent + label text. If 1 target, show `→ {agent}`. If `targets.length === allAgentCount`, show `→ all`. Otherwise show a row of dots + count.

- [ ] CSS:
```css
.target-indicator {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--track-folio);
  text-transform: lowercase;
  color: var(--text-tertiary);
}
.target-arrow { color: var(--text-whisper); }
.target-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.target-dot[data-agent="luca"]   { background: var(--luca);   }
.target-dot[data-agent="vektor"] { background: var(--vektor); }
.target-dot[data-agent="anima"]  { background: var(--anima);  }
.target-name { color: var(--text-soft); }
```

### 11.7 — `StreamingCursor`

- [ ] Create `src/components/messages/StreamingCursor.tsx`. Renders a single `<span class="streaming-cursor" aria-hidden />`. Append after the body content (or use the `::after` pattern below — pick one and stay consistent).

- [ ] CSS (using both the standalone span and the `[data-streaming="true"]` body suffix — use whichever is convenient at the call site):
```css
.streaming-cursor,
.msg-row[data-streaming="true"] .msg-body::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 16px;
  background: var(--text-tertiary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 1s ease-in-out infinite;
}
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .streaming-cursor,
  .msg-row[data-streaming="true"] .msg-body::after { animation: none !important; opacity: 0.7; }
}
```

### 11.8 — `ThinkingDots`

- [ ] Create `src/components/messages/ThinkingDots.tsx`:
```tsx
interface Props { agent?: Role }
```
- [ ] Render three dots:
```
<span class="thinking-dots" data-agent={agent}>
  <span class="thinking-dot" />
  <span class="thinking-dot" />
  <span class="thinking-dot" />
</span>
```

- [ ] CSS:
```css
.thinking-dots {
  display: inline-flex; align-items: center; gap: 5px;
  vertical-align: middle;
}
.thinking-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text-tertiary);
  opacity: 0.2;
  animation: think-pulse 1.4s ease-in-out infinite;
}
.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }

.thinking-dots[data-agent="luca"]   .thinking-dot { background: var(--luca);   }
.thinking-dots[data-agent="vektor"] .thinking-dot { background: var(--vektor); }
.thinking-dots[data-agent="anima"]  .thinking-dot { background: var(--anima);  }

@keyframes think-pulse {
  0%, 100% { opacity: 0.2; }
  50%      { opacity: 0.8; }
}
@media (prefers-reduced-motion: reduce) {
  .thinking-dot { animation: none !important; opacity: 0.5; }
}
```

### 11.9 — `SystemEvent`

- [ ] Create `src/components/messages/SystemEvent.tsx`:
```tsx
interface Props { children: React.ReactNode }
```
- [ ] Renders centered system event line with horizontal divider lines on both sides via `::before` / `::after`.

- [ ] CSS:
```css
.system-event {
  display: flex; align-items: center; gap: 12px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-ghost);
  letter-spacing: var(--track-folio);
  text-transform: lowercase;
  padding: 12px 0;
}
.system-event::before,
.system-event::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-faint), transparent);
}
```

### 11.10 — Composer wiring (autocomplete)

- [ ] In the existing composer (Phase 03), detect a typed `@` and open `<MentionAutocomplete>` anchored above the input. Use ArrowUp/ArrowDown to move `highlighted`, Enter/Tab to select, Esc to dismiss. On select, replace the trigger token with `<MentionPill agent={selected} />` (write into the contenteditable as a real DOM node; or as a parsed token if the composer uses a model + render layer).
- [ ] **Do not** alter Phase 03's border-glow CSS or `.composer` class — only add the dropdown anchor.

## Verification

1. **Sidehead grid:**
   ```js
   () => {
     const r = document.querySelector('.msg-row')
     return getComputedStyle(r).gridTemplateColumns
   }
   ```
   Assert columns equal approx `72px ${Nfr}` where the second track is the body track.
2. **Role color:** Render `<MessageRow role="vektor">…</MessageRow>` — `.msg-role` `color` equals `--vektor` token.
3. **Inline @mention:** Render a body containing `<MentionPill agent="luca">` — element renders with cream-tinted background, color `--luca`, padding `1px 6px`, radius `4px`.
4. **Autocomplete dropdown:** In composer, type `@` — dropdown appears above input with `box-shadow: 0 -4px 12px rgba(0,0,0,0.3)`. ArrowDown highlights next; Enter inserts pill; Esc closes.
5. **Handoff card:** Render with `from="luca" to="vektor"`. Names appear in agent colors with `→` between. Accept and Dismiss Pills render via Phase 02 primitive.
6. **Target indicator:** With `role="user" targets=['luca','vektor','anima']`, indicator shows `→ all`. With `targets=['vektor']`, shows `→ vektor` with vektor-colored dot.
7. **Streaming cursor:** `streaming={true}` — 2×16px cursor blinks on/off every 1s after body content.
8. **Thinking dots:** `thinking={true}` with `agent="anima"` — three magenta dots pulse opacity 0.2↔0.8 on 1.4s cycle, staggered 0.2s/0.4s.
9. **System event:** `<SystemEvent>luca joined the thread</SystemEvent>` — text centered with hairline divider gradients on both sides.
10. **Reduced motion:** Cursor and dots animations stop; static visible state preserved.
11. **Token discipline:** Grep for hex literals or hardcoded `rgba(201,168,124,*)` outside the explicit MentionPill background tints (which are intentional opacity-on-color). All other colors must reference tokens.
12. **Console:** 0 errors when rendering each component standalone in a dev playground.

## Backend asks

None. All primitives operate on data already flowing through `messages` and chat edge functions. When the model emits handoff suggestions in the stream, parse them client-side and render `<HandoffCard>`; when chat targets are recorded on the user message row, surface them via `<TargetIndicator>`.

## Commit

```
phase 11: multi-agent comms primitives

- src/components/messages/MessageRow.tsx (new) — 72px sidehead +
  body grid; per-role role-label color
- src/components/messages/MentionPill.tsx (new) — inline @agent pill
  with per-agent tinted background
- src/components/messages/MentionAutocomplete.tsx (new) — dropdown
  anchored above composer with inverted shadow
- src/components/messages/HandoffCard.tsx (new) — from→to row,
  suggestion, Accept/Dismiss Pills
- src/components/messages/TargetIndicator.tsx (new) — inline
  → all / → agent on user prompts
- src/components/messages/StreamingCursor.tsx (new) — 2×16px
  blinking caret
- src/components/messages/ThinkingDots.tsx (new) — 3-dot pulse,
  staggered 0/0.2/0.4s
- src/components/messages/SystemEvent.tsx (new) — centered with
  hairline divider gradients
- src/index.css — .msg-*, .input-mention, .mention-*, .handoff-*,
  .target-*, .streaming-cursor, .thinking-*, .system-event
- composer (phase 03) — autocomplete anchor (no border-glow change)

Verified: sidehead grid 72px column, per-role colors via tokens,
mention dropdown shadows inverted upward, handoff card layout,
streaming cursor + thinking dots respect reduced-motion, target
indicator collapses to "all" at full coverage, 0 console errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

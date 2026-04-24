# Phase 03 — Composer with Border-Glow Option C

## Goal

Replace the current chat composer styling with the canonical phase-2 mockup composer: 8-pool prime-shimmer border-glow (Option C, locked), agent pills row footer, effort selector, send button. The shimmer uses 8 simultaneous animations at prime-number durations (3/5/7/11/13/17/19/23 seconds) so the pattern never visibly repeats. After this phase: every input-wrapper across the app gets the shimmer treatment uniformly, and the composer matches `mockups/phase-2/luca-terminal-guardian-alcove.html` pixel-faithfully.

## Dependencies

- Phase 01 (foundation tokens — surfaces, motion, agent identity)
- Phase 02 (Pill component for agent buttons + effort selector + send)

## Files to create/modify

- `src/index.css` — `.input-shell`, `.input-shell::before`, 8 `@keyframes shimmer-c1..c8`, 8 `@property --pc1..pc8` registrations
- `src/components/Composer.tsx` (new) — extract composer chrome from ChatView
- `src/pages/ChatView.tsx` — replace inline composer with `<Composer />`

## Tasks

### 3.1 — `@property` registrations

- [ ] Add to `src/index.css` (BEFORE `@keyframes` definitions, at top of phase-3 block):
```css
@property --pc1 { syntax: '<number>'; initial-value: 0.15; inherits: false; }
@property --pc2 { syntax: '<number>'; initial-value: 0.08; inherits: false; }
@property --pc3 { syntax: '<number>'; initial-value: 0.20; inherits: false; }
@property --pc4 { syntax: '<number>'; initial-value: 0.05; inherits: false; }
@property --pc5 { syntax: '<number>'; initial-value: 0.18; inherits: false; }
@property --pc6 { syntax: '<number>'; initial-value: 0.10; inherits: false; }
@property --pc7 { syntax: '<number>'; initial-value: 0.12; inherits: false; }
@property --pc8 { syntax: '<number>'; initial-value: 0.06; inherits: false; }
```

### 3.2 — 8 keyframe animations (prime durations)

- [ ] Add 8 keyframes to `src/index.css`:
```css
@keyframes shimmer-c1 { 0%, 100% { --pc1: 0.05; } 50% { --pc1: 0.38; } }
@keyframes shimmer-c2 { 0%, 100% { --pc2: 0.32; } 50% { --pc2: 0.04; } }
@keyframes shimmer-c3 { 0%, 100% { --pc3: 0.06; } 50% { --pc3: 0.35; } }
@keyframes shimmer-c4 { 0%, 100% { --pc4: 0.30; } 50% { --pc4: 0.03; } }
@keyframes shimmer-c5 { 0%, 100% { --pc5: 0.04; } 50% { --pc5: 0.36; } }
@keyframes shimmer-c6 { 0%, 100% { --pc6: 0.28; } 50% { --pc6: 0.08; } }
@keyframes shimmer-c7 { 0%, 100% { --pc7: 0.06; } 50% { --pc7: 0.32; } }
@keyframes shimmer-c8 { 0%, 100% { --pc8: 0.26; } 50% { --pc8: 0.04; } }
```

### 3.3 — `.input-shell` container + `.input-shell::before` glow layer

- [ ] Add to `src/index.css`:
```css
.input-shell {
  position: relative;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: visible;
}

.input-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px; /* defines the border thickness for the mask */
  background:
    radial-gradient(ellipse 45% 180% at 5% 0%, rgba(220, 218, 214, var(--pc1)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 28% 0%, rgba(220, 218, 214, var(--pc2)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 55% 0%, rgba(220, 218, 214, var(--pc3)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 82% 0%, rgba(220, 218, 214, var(--pc4)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 95% 100%, rgba(220, 218, 214, var(--pc5)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 68% 100%, rgba(220, 218, 214, var(--pc6)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 40% 100%, rgba(220, 218, 214, var(--pc7)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 15% 100%, rgba(220, 218, 214, var(--pc8)) 0%, transparent 60%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  animation:
    shimmer-c1 3s ease-in-out infinite,
    shimmer-c2 5s ease-in-out infinite,
    shimmer-c3 7s ease-in-out infinite,
    shimmer-c4 11s ease-in-out infinite,
    shimmer-c5 13s ease-in-out infinite,
    shimmer-c6 17s ease-in-out infinite,
    shimmer-c7 19s ease-in-out infinite,
    shimmer-c8 23s ease-in-out infinite;
}
```

### 3.4 — Focus state on `.input-shell:focus-within`

- [ ] Add a slightly intensified state when textarea has focus:
```css
.input-shell:focus-within {
  border-color: rgba(220, 219, 216, 0.09);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.20), 0 8px 24px rgba(0, 0, 0, 0.12);
  transition: border-color 220ms var(--ease-premium), box-shadow 220ms var(--ease-premium);
}
```

### 3.5 — Composer component structure

- [ ] Create `src/components/Composer.tsx`:
```tsx
interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  agents: AgentTarget[];        // array of { id, label, color }
  primaryAgent: string;
  targetedAgents: string[];     // multi-target selection
  onAgentToggle: (id: string) => void;
  effort: 'light' | 'medium' | 'deep';
  onEffortChange: (e: 'light'|'medium'|'deep') => void;
  observerActive?: boolean;
  onObserverToggle?: () => void;
  placeholder?: string;
}
```
- Layout:
  ```
  <div class="input-zone" style={{ padding: '16px 32px 24px', maxWidth: 'calc(720px + 64px)', margin: '0 auto' }}>
    <div class="input-shell">
      <textarea class="input-field" />
      <div class="input-footer">
        <div class="input-agents">
          [agent pills row]  +  observer pill (if enabled)
        </div>
        <div class="input-controls">
          [effort selector — SegmentControl: light/medium/deep]
          <button class="send-btn">[paper-plane icon]</button>
        </div>
      </div>
    </div>
  </div>
  ```

### 3.6 — Agent pills

- [ ] Each pill uses `<Pill size="sm">` from Phase 02. Active state when `targetedAgents.includes(agent.id)`. Primary agent has additional underline/dot indicator (per multi-agent-comms mockup). Pills wrap to new line if too many.

### 3.7 — Effort selector

- [ ] Use `<SegmentControl>` from Phase 02 with options: `Light / Medium / Deep`. Tighter padding than default (size override).

### 3.8 — Send button

- [ ] Custom button (not Pill — square-ish): `width: 28px; height: 28px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-ghost); cursor: pointer; display: flex; align-items: center; justify-content: center;` with paper-plane SVG (16×16, stroke-width 1.6).
- Hover: `color: var(--text-secondary); background: var(--overlay-hover);`
- Disabled when value is empty: `opacity: 0.4; pointer-events: none;`

### 3.9 — Apply to ChatView

- [ ] In `src/pages/ChatView.tsx`, both composer renders (landing state ~L812 and conversation state ~L1013 per repo memory) get replaced with `<Composer ... />`.
- [ ] Verify functional parity: typing works, send works, agent toggles work, effort selector saves to settings.

### 3.10 — Apply `.input-shell` shimmer to OTHER input wrappers

- [ ] Per the mockup decision doc: "Apply the Option C CSS as a single class to .input-wrapper, .idle-input-wrap, .thread-input, and any other input-wrapper across the app." Survey for any other input-like surfaces (memory edit textarea, settings prompt editor, etc.) and apply the `.input-shell` class where appropriate.

## Verification

1. **Animation runs:** `browser_evaluate` on `.input-shell::before`:
   ```js
   () => {
     const el = document.querySelector('.input-shell');
     const cs = getComputedStyle(el, '::before');
     return { name: cs.animationName, duration: cs.animationDuration };
   }
   ```
   Assert `name === 'shimmer-c1, shimmer-c2, shimmer-c3, shimmer-c4, shimmer-c5, shimmer-c6, shimmer-c7, shimmer-c8'` and `duration === '3s, 5s, 7s, 11s, 13s, 17s, 19s, 23s'`.
2. **Visual:** Open `/chat` and watch the composer for 30 seconds. The border should subtly pulse with no visible repeating pattern.
3. **Focus state:** Click into textarea. Border slightly intensifies; subtle dual shadow appears under composer.
4. **Reduced motion:** With `prefers-reduced-motion: reduce`, animation should pause (the global guard kills it).
5. **Console:** 0 new errors. (Note: `@property` is not supported in older browsers but graceful — fallback is just the static initial values.)

## Backend asks

None.

## Commit

```
phase 03: composer border-glow Option C — 8-pool prime-shimmer

- src/index.css: 8 @property --pc1..pc8 registrations + 8 keyframes
  + .input-shell with masked border-only ::before glow at prime
  durations (3/5/7/11/13/17/19/23s)
- src/components/Composer.tsx (new) — extract composer chrome
- src/pages/ChatView.tsx — both composer renders replaced
- All other input-wrappers across app get .input-shell class

Verified: animation runs (computed styles match spec), focus state
intensifies subtly, reduced-motion pauses animation, no new errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

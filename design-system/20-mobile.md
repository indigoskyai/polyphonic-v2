# Phase 20 — Mobile Shell

## Goal

Build the mobile-form-factor shell: a fixed-width phone-frame container with iOS notch + status bar, mobile header (menu / title), mobile message stream, mobile sub-agent strip (smaller murmur dots), mobile composer (pill-shaped, single-line + send button), bottom nav (4 tabs), slide-in drawer (left edge, 300px), and a mobile group-session stage (agent cards with halo pulse). This phase is **future-facing**: defer landing it until the desktop spec is solid through Phase 19. The doc captures all the specs so the work can be picked up cleanly when scheduled.

## Dependencies

- Phase 01 (foundation tokens — surfaces, primary text, agent colors)
- Phase 02 (Pill, Modal patterns — adapted for touch targets)
- Phase 09 (sub-agent murmur dot patterns — scaled-down variant)
- Phase 10 (group session stage — mobile reflow)

## Files to create

```
src/components/mobile/PhoneFrame.tsx
src/components/mobile/MobileStatusBar.tsx
src/components/mobile/MobileHeader.tsx
src/components/mobile/MobileMessages.tsx
src/components/mobile/MobileSubAgentStrip.tsx
src/components/mobile/MobileComposer.tsx
src/components/mobile/MobileBottomNav.tsx
src/components/mobile/MobileDrawer.tsx
src/components/mobile/MobileGroupStage.tsx
src/stores/mobileShellStore.ts
src/pages/MobilePreview.tsx          // dev-only preview route
```
- `src/index.css` — `.phone-*`, `.m-*` classes
- `src/App.tsx` — register `/_mobile` preview route (gated by env)

## Tasks

### 20.1 — `mobileShellStore`

- [ ] Create `src/stores/mobileShellStore.ts`:
```ts
import { create } from 'zustand'

export type MobileTab = 'chat' | 'memory' | 'agents' | 'settings'
interface MobileShellState {
  tab: MobileTab
  drawerOpen: boolean
  setTab: (t: MobileTab) => void
  openDrawer: () => void
  closeDrawer: () => void
}
export const useMobileShellStore = create<MobileShellState>((set) => ({
  tab: 'chat',
  drawerOpen: false,
  setTab: (tab) => set({ tab }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}))
```

### 20.2 — Phone frame

- [ ] CSS:
```css
.phone-frame {
  width: 390px;
  height: 772px;
  background: var(--canvas);
  border-radius: 40px;
  border: 8px solid #1a1a1c;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.5),
    0 4px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  position: relative;
  display: flex; flex-direction: column;
}
.phone-notch {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 120px; height: 28px;
  background: var(--floor);
  border-radius: 16px;
  z-index: 10;
}
```

### 20.3 — Status bar

- [ ] CSS:
```css
.m-status-bar {
  height: 44px;
  padding: 8px 24px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary);
}
.m-status-icons { display: inline-flex; gap: 4px; align-items: center; }
.m-status-icons svg { width: 12px; height: 12px; color: var(--text-primary); }
```

- [ ] Left: time string `9:41` (placeholder, real value via `Intl.DateTimeFormat`).
- [ ] Right: signal / wifi / battery SVGs.

### 20.4 — Mobile header

- [ ] CSS:
```css
.m-header {
  height: 44px;
  padding: 8px 16px;
  display: flex; align-items: center; gap: 10px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.m-menu-btn {
  width: 28px; height: 28px;
  background: transparent; border: none;
  color: var(--text-soft);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  transition: all var(--dur-fast) var(--ease-out);
}
.m-menu-btn:hover { color: var(--text-primary); background: var(--overlay-hover); }
.m-menu-btn svg { width: 15px; height: 15px; stroke-width: 1.8; }
.m-title {
  flex: 1;
  font-size: 13px; font-weight: 500;
  color: var(--text-primary);
  text-align: center;
}
```

- [ ] Menu button click → `useMobileShellStore.getState().openDrawer()`.

### 20.5 — Messages

- [ ] CSS:
```css
.m-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.m-msg { margin-bottom: 20px; }
.m-msg-role {
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 6px;
  color: var(--text-soft);
}
.m-msg-role[data-agent="luca"]   { color: var(--luca-full); }
.m-msg-role[data-agent="vektor"] { color: var(--vektor-full); }
.m-msg-role[data-agent="anima"]  { color: var(--anima-full); }
.m-msg-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  font-weight: 370;
}
```

### 20.6 — Mobile sub-agent strip

- [ ] CSS:
```css
.m-subagent-strip {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.m-subagent {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.m-murmur {
  display: grid;
  grid-template-columns: repeat(3, 4px);
  grid-template-rows: repeat(3, 4px);
  gap: 1px;
}
.m-murmur-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.m-murmur-dot.active { background: var(--vektor-full); animation: m-murmur 1.6s ease-in-out infinite; }
@keyframes m-murmur {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.3); }
}
.m-subagent-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-ghost);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
```

- [ ] Reuse Phase 09 prime-staggered animation delays — divide each delay by 2 for the smaller scale.

### 20.7 — Mobile composer

- [ ] CSS:
```css
.m-composer-wrap {
  padding: 8px 12px 12px;
  flex-shrink: 0;
}
.m-composer {
  position: relative;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 10px 14px;
  display: flex; align-items: center; gap: 8px;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.m-composer:focus-within { border-color: var(--border-strong); }
.m-composer-input {
  flex: 1;
  background: transparent;
  border: none; outline: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
}
.m-composer-input::placeholder { color: var(--text-ghost); }
.m-send {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-primary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--dur-fast) var(--ease-out);
}
.m-send:hover { background: var(--surface-3); }
.m-send svg { width: 11px; height: 11px; stroke-width: 1.8; }
```

### 20.8 — Bottom nav

- [ ] CSS:
```css
.m-bottom-nav {
  height: 56px;
  padding: 6px 12px 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex; justify-content: space-around;
  flex-shrink: 0;
  background: var(--canvas);
}
.m-nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 4px 8px;
  background: transparent; border: none;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.m-nav-item[data-active="true"] { color: var(--text-primary); }
.m-nav-item svg { width: 18px; height: 18px; stroke-width: 1.6; }
.m-nav-label {
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.02em;
}
```

- [ ] Tabs: Chat / Memory / Agents / Settings. Click → `setTab`.

### 20.9 — Mobile drawer

- [ ] CSS:
```css
.m-drawer-backdrop {
  position: absolute; inset: 0;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0; pointer-events: none;
  transition: opacity 300ms var(--ease-out);
  z-index: 20;
}
.m-drawer-backdrop[data-open="true"] {
  opacity: 1; pointer-events: auto;
}
.m-drawer {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 300px;
  background: var(--floor);
  border-right: 1px solid var(--border-subtle);
  z-index: 21;
  transform: translateX(-100%);
  transition: transform 300ms var(--ease-out);
  display: flex; flex-direction: column;
}
.m-drawer[data-open="true"] {
  transform: translateX(0);
}
.m-drawer-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.m-drawer-body {
  flex: 1; overflow-y: auto;
  padding: 8px;
}
.m-thread-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-body);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.m-thread-item:hover { background: var(--overlay-hover); color: var(--text-primary); }
.m-thread-item[data-active="true"] {
  background: var(--surface-1);
  color: var(--text-primary);
}
```

- [ ] Backdrop click → `closeDrawer`.

### 20.10 — Mobile group-session stage

- [ ] CSS:
```css
.m-group-stage {
  display: flex; flex-direction: column; align-items: center;
  gap: 24px;
  padding: 32px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.m-agent-card {
  width: 84px; height: 84px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative;
}
.m-agent-name {
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.m-agent-card[data-agent="luca"]   .m-agent-name { color: var(--luca-full); }
.m-agent-card[data-agent="vektor"] .m-agent-name { color: var(--vektor-full); }
.m-agent-card[data-agent="anima"]  .m-agent-name { color: var(--anima-full); }
.m-agent-card[data-speaking="true"]::before {
  content: '';
  position: absolute; inset: -6px;
  border-radius: 50%;
  border: 1px solid var(--luca-full);
  animation: m-halo 2s ease-out infinite;
}
.m-agent-card[data-speaking="true"][data-agent="vektor"]::before { border-color: var(--vektor-full); }
.m-agent-card[data-speaking="true"][data-agent="anima"]::before  { border-color: var(--anima-full); }
@keyframes m-halo {
  0%   { transform: scale(1);   opacity: 0.5; }
  100% { transform: scale(1.2); opacity: 0;   }
}
```

### 20.11 — Preview route

- [ ] Create `src/pages/MobilePreview.tsx` mounting a `<PhoneFrame>` with the full mobile shell wired in. Route at `/_mobile` (gated by env: `if (import.meta.env.MODE !== 'development') return <Navigate to="/" />`).

## Verification

1. **Phone frame renders:** Visit `/_mobile`. Phone-shaped container 390×772 with notch, rounded corners (40px), and outer shadow.
2. **Status bar:** Time string + 3 status icons render at top.
3. **Header:** Menu icon left, title centered. Click menu → drawer slides in from left over 300ms.
4. **Drawer:** Backdrop appears with opacity 0.4 black; click backdrop → drawer slides out.
5. **Messages:** Render in `.m-messages` with 14px body text and per-agent role color.
6. **Sub-agent strip:** 3×3 dot grids render, scaled smaller (4px dots, 1px gaps); active dots animate with `m-murmur` 1.6s.
7. **Composer:** Pill-shaped (radius 22px); focus-within → border lifts; send button is 28px circle.
8. **Bottom nav:** 4 tabs; active tab `--text-primary`; inactive `--text-tertiary`. Click → `setTab` updates store.
9. **Group stage:** Set an agent `data-speaking="true"` → halo ring pulses 2s with agent-color border.
10. **Computed-style audit:**
    ```js
    () => {
      const fr = document.querySelector('.phone-frame')
      const cs = getComputedStyle(fr)
      return { width: cs.width, height: cs.height, borderRadius: cs.borderRadius, borderWidth: cs.borderWidth }
    }
    ```
    Assert width 390px, height 772px, border-radius 40px, border 8px.
11. **Reduced motion:** Drawer slide collapses; halo pulse halts.
12. **Console:** 0 new errors.

## Backend asks

None — reuses existing stores. When the mobile shell ships as the actual app on small viewports (not dev preview), wire a `useMediaQuery('(max-width: 480px)')` hook and route mobile users to the mobile shell automatically.

## Commit

```
phase 20: mobile shell

- src/components/mobile/{PhoneFrame,MobileStatusBar,MobileHeader,
  MobileMessages,MobileSubAgentStrip,MobileComposer,
  MobileBottomNav,MobileDrawer,MobileGroupStage}.tsx (new)
- src/stores/mobileShellStore.ts (new) — tab + drawer state
- src/pages/MobilePreview.tsx (new) — dev-only preview at
  /_mobile
- src/index.css — .phone-* (390×772 frame + notch + shadow),
  .m-status-bar, .m-header, .m-messages (14px body), .m-murmur
  (4px dots, 1.6s pulse), .m-composer (22px pill, focus-within
  border), .m-bottom-nav (4-tab, active text-primary),
  .m-drawer (300px slide-in 300ms ease-out), .m-group-stage
  (84×84 agent cards, agent-color halo pulse 2s)
- src/App.tsx — register /_mobile route (env-gated)

Verified: phone frame renders, drawer slide + backdrop, sub-agent
strip pulses, composer focus border, bottom nav tab switch,
group stage halo per agent, reduced-motion halts animations.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

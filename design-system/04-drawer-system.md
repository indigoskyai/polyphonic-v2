# Phase 04 — Drawer System

## Goal

Build the cornerstone right-side overlay primitive that powers Notifications, Thread detail, Memory detail, Agent inspector, and any future "see context for this thing" surface. Drawer slides in from right with backdrop blur on main content, ESC dismisses, click-outside dismisses, focus trapped inside while open. Single drawer at a time (opening one closes any other).

## Dependencies

- Phase 01 (drawer width, backdrop, motion, shadow tokens)
- Phase 02 (Pill component for footer actions)

## Files to create

```
src/components/ui/Drawer.tsx
src/stores/drawerStore.ts
```
- `src/index.css` — `.drawer`, `.drawer-backdrop`, `.drawer-header`, `.drawer-body`, `.drawer-section`, `.drawer-footer`, `.drawer-crumb`, `.drawer-esc-chip`, `.drawer-close-btn` classes
- `src/App.tsx` — mount drawer router (renders the active drawer per `drawerStore.active`)

## Tasks

### 4.1 — `drawerStore`

- [ ] Create `src/stores/drawerStore.ts`:
```ts
import { create } from 'zustand';

export type DrawerKey =
  | 'notifications'
  | 'thread-detail'
  | 'memory-detail'
  | 'agent-inspector'
  | null;

interface DrawerState {
  active: DrawerKey;
  payload: Record<string, unknown> | null;
  open: (key: Exclude<DrawerKey, null>, payload?: Record<string, unknown>) => void;
  close: () => void;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  active: null,
  payload: null,
  open: (key, payload = {}) => set({ active: key, payload }),
  close: () => set({ active: null, payload: null }),
}));
```

### 4.2 — `Drawer` component + sub-components

- [ ] Create `src/components/ui/Drawer.tsx` exporting:
  - `Drawer` (the container)
  - `DrawerHeader`
  - `DrawerCrumb`
  - `DrawerTitle`
  - `DrawerEscChip`
  - `DrawerCloseBtn`
  - `DrawerBody`
  - `DrawerSection`
  - `DrawerSectionLabel`
  - `DrawerFooter`

- [ ] `Drawer` props:
```tsx
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  width?: number;             // default uses --drawer-width
  showEsc?: boolean;          // default true
  closeOnBackdropClick?: boolean; // default true
  closeOnEsc?: boolean;       // default true
  children: React.ReactNode;
}
```

- [ ] Behavior:
  - On mount with `open === true`, register `keydown` listener for ESC. Cleanup on unmount.
  - When `open` changes false → true, focus the first focusable inside drawer.
  - When `open` changes true → false, restore focus to previous active element.
  - Focus trap: cycle Tab/Shift+Tab inside the drawer's container.

### 4.3 — Drawer CSS

- [ ] Add to `src/index.css`:
```css
/* === Drawer === */
.drawer-backdrop {
  position: fixed; inset: 0; z-index: 50;
  background: var(--backdrop-tint);
  backdrop-filter: blur(var(--backdrop-blur));
  -webkit-backdrop-filter: blur(var(--backdrop-blur));
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur-normal) var(--ease-out);
}
.drawer-backdrop[data-open="true"] {
  opacity: 1; pointer-events: auto;
}

.drawer {
  position: fixed;
  top: calc(var(--devbar-height, 0px) + var(--inset-gap));
  right: var(--inset-gap);
  bottom: 0;
  width: var(--drawer-width);
  z-index: 100;
  background: var(--canvas);
  border-top-left-radius: var(--radius-inset);
  border-top-right-radius: var(--radius-inset);
  box-shadow: var(--shadow-inset-highlight), var(--shadow-drawer-near), var(--shadow-drawer-far);
  display: flex; flex-direction: column;
  overflow: hidden;
  transform: translateX(calc(100% + 26px));
  transition: transform var(--dur-drawer) var(--ease-premium);
}
.drawer[data-open="true"] {
  transform: translateX(0);
}

.drawer-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px 14px 22px;
  flex-shrink: 0;
  position: relative;
}
/* Gradient mask divider on header bottom */
.drawer-header::after {
  content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-subtle) 15%, var(--border-subtle) 85%, transparent);
}

.drawer-crumb {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
.drawer-crumb-num { color: var(--text-soft); }
.drawer-crumb-sep { color: var(--text-whisper); }

.drawer-title {
  font-size: 24px; font-weight: 450;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.drawer-esc-chip {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 8.5px;
  text-transform: uppercase;
  color: var(--text-whisper);
  border: 1px solid var(--border-faint);
  border-radius: 3px;
  padding: 2px 7px;
  letter-spacing: 0.04em;
}

.drawer-close-btn {
  width: 30px; height: 30px;
  background: transparent; border: none;
  color: var(--text-tertiary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  transition: all var(--dur-fast) var(--ease-out);
}
.drawer-close-btn:hover {
  color: var(--text-primary);
  background: var(--overlay-hover);
}

.drawer-body {
  flex: 1; overflow-y: auto;
  padding-right: 4px;
}

.drawer-section {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-subtle);
}
.drawer-section:last-child { border-bottom: none; }

.drawer-section-label {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 500;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  margin-bottom: 10px;
}

.drawer-footer {
  padding: 12px 14px 14px;
  flex-shrink: 0;
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
  position: relative;
}
.drawer-footer::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-subtle) 15%, var(--border-subtle) 85%, transparent);
}
.drawer-footer-sep {
  width: 1px; height: 20px;
  background: var(--border-subtle);
  margin: 0 6px 0 auto;
}
```

### 4.4 — Drawer router mount in `App.tsx`

- [ ] At app shell level, after the main content, add:
```tsx
const activeDrawer = useDrawerStore((s) => s.active);
const closeDrawer = useDrawerStore((s) => s.close);

const drawerOpen = activeDrawer !== null;
const DrawerContent =
  activeDrawer === 'notifications'   ? NotificationsDrawer :
  activeDrawer === 'thread-detail'   ? ThreadDetailDrawer :
  activeDrawer === 'memory-detail'   ? MemoryDetailDrawer :
  activeDrawer === 'agent-inspector' ? AgentInspectorDrawer :
  null;

return (
  <>
    {/* existing app shell */}
    <div className="drawer-backdrop" data-open={drawerOpen} onClick={closeDrawer} />
    <div className="drawer" data-open={drawerOpen}>
      {DrawerContent && <DrawerContent />}
    </div>
  </>
);
```

(Replace placeholder component imports with real ones as later phases add them.)

### 4.5 — Focus trap implementation

- [ ] Inside `Drawer`, on mount when `open`, query all focusable elements (`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`) inside the drawer. Override Tab/Shift+Tab to cycle among them. Restore focus on close.

## Verification

1. **Visual smoke:** Trigger drawer open via console: `useDrawerStore.getState().open('notifications')`. Drawer slides in over 380ms. Backdrop blurs main content (verify by comparing screenshot before/after — main behind should be visibly softer).
2. **ESC dismiss:** Press Escape — drawer slides out, focus returns to trigger.
3. **Click outside dismiss:** Click on backdrop area — drawer dismisses.
4. **Focus trap:** With drawer open, repeatedly Tab. Focus cycles only inside drawer; doesn't leak to main content.
5. **Reduced motion:** With `prefers-reduced-motion: reduce`, drawer appears instantly without slide.
6. **Computed-style audit:**
   ```js
   () => {
     const drawer = document.querySelector('.drawer');
     const cs = getComputedStyle(drawer);
     return { width: cs.width, transition: cs.transition, borderTopLeftRadius: cs.borderTopLeftRadius };
   }
   ```
   Assert width === 420px, transition includes `380ms`, radius === 16px.
7. **Console:** 0 new errors.

## Backend asks

None.

## Commit

```
phase 04: drawer system — right-side overlay with backdrop blur

- src/components/ui/Drawer.tsx (new) + sub-components (Header,
  Crumb, Title, EscChip, CloseBtn, Body, Section, SectionLabel,
  Footer)
- src/stores/drawerStore.ts (new) — single-active-drawer state
- src/index.css — .drawer/.drawer-backdrop classes + slide
  animation (380ms premium ease) + gradient mask dividers
- src/App.tsx — mount drawer router (placeholder DrawerContent
  per active key; actual drawers land in phases 05/06/2.3/8)

Verified: ESC + click-outside dismiss, focus trapped, backdrop
blurs main content (2px), 380ms slide-in, reduced-motion respected.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

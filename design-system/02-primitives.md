# Phase 02 — Primitives

## Goal

Build the canonical UI primitives that every other phase consumes: Pill button (4 variants × 3 sizes), Modal with backdrop blur, Tooltip with slide-in, Empty state, Segment control, and form primitives (Select with custom arrow, Textarea with focus border-color shift, ToggleSwitch with springy knob, RadioGroup, DropZone, FormField with label-grid). After this phase: every button-like, form-like, or popover-like element across the app uses a shared component instead of inline styles.

## Dependencies

- Phase 01 (Foundation tokens)

## Files to create

```
src/components/ui/
├── Pill.tsx
├── Modal.tsx
├── Tooltip.tsx
├── EmptyState.tsx
├── SegmentControl.tsx
├── Select.tsx
├── Textarea.tsx
├── ToggleSwitch.tsx
├── RadioGroup.tsx
├── DropZone.tsx
└── FormField.tsx
```
- `src/index.css` — `.pill`, `.modal-*`, `.tooltip-*`, etc class definitions

## Tasks

### 2.1 — `Pill` component

- [ ] Create `src/components/ui/Pill.tsx`:
```tsx
type PillSize = 'xs' | 'sm' | 'md';
type PillVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface PillProps {
  variant?: PillVariant;
  size?: PillSize;
  active?: boolean;       // renders selected state regardless of variant
  icon?: React.ReactNode; // 13×13 SVG, stroke-width 1.6
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}
```
- All variants: `border-radius: 999px`, `transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1)`, `font-family: var(--font-sans)`, `font-size: 11px`, `font-weight: 450`, `letter-spacing: var(--track-body)`, `cursor: pointer`, `display: inline-flex; align-items: center; gap: 7px`.
- Size paddings: `xs` = `4px 10px`, `sm` = `5px 11px`, `md` = `7px 14px`.
- Hover: `transform: translateY(-1px)` + variant-specific background/color/border brightening.
- `:active` (mousedown): `transform: translateY(0)`.
- `:focus-visible`: relies on global `--focus-ring` from Phase 01.
- Variant CSS class names: `.pill .pill--primary` etc. Active state: `.pill[data-active="true"]`.

- [ ] Add `.pill` CSS to `src/index.css`. Variants per Phase 01 + thread-detail audit (already defined in CLAUDE.md spec section).

### 2.2 — `Modal` component (with backdrop blur)

- [ ] Create `src/components/ui/Modal.tsx`:
```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;            // optional eyebrow
  width?: number;            // default 480
  children: React.ReactNode;
  closeOnEsc?: boolean;      // default true
  closeOnBackdropClick?: boolean; // default true
}
```
- Container centered: `position: fixed; top: 50%; left: 50%; transform: translate(-50%, calc(-50% + 8px))` initially (slightly below center), `transform: translate(-50%, -50%)` when open.
- Open animation: 320ms `cubic-bezier(0.22, 1, 0.36, 1)` (premium ease) for both opacity 0→1 and transform.
- Background: `var(--surface-1)`, border: `1px solid var(--border)`, `border-radius: var(--radius-md)` (10px), shadow: `var(--shadow-modal)`.
- Backdrop: full-screen, `background: rgba(0, 0, 0, 0.42)`, `backdrop-filter: blur(4px)` (stronger than drawer's `2px`), z-index 150.
- ESC + click-outside dismiss.
- Focus trap: trap focus inside modal while open.

### 2.3 — `Tooltip` component

- [ ] Create `src/components/ui/Tooltip.tsx`:
```tsx
interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right'; // default top
  delay?: number; // default 600ms
  children: React.ReactElement;  // wraps trigger
}
```
- Tooltip box: `bg var(--surface-3)`, `border 1px solid var(--border)`, `border-radius: 4px`, `padding: 4px 10px`, `font-mono 10px var(--text-body)`, `white-space: nowrap`, `box-shadow: var(--shadow-popover)`.
- Slide-in: `transform: translateY(4px) → 0` + opacity `0 → 1` over 180ms ease-out.

### 2.4 — `EmptyState` component

- [ ] Create `src/components/ui/EmptyState.tsx`:
```tsx
interface EmptyStateProps {
  text: string;
  hint?: string;       // longer descriptive paragraph below text
  icon?: React.ReactNode;
  action?: React.ReactNode; // e.g. <Pill>Get started</Pill>
}
```
- Composition: optional icon (32×32, opacity 0.6, color `var(--text-soft)`), `text` line in `var(--text-tertiary)`, `hint` paragraph in `var(--text-whisper)` (max-width 360px, line-height 1.55), optional `action` slot.
- Container: `text-align: center; padding: 48px 32px; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); background: transparent;`.

### 2.5 — `SegmentControl` component

- [ ] Create `src/components/ui/SegmentControl.tsx`:
```tsx
interface SegmentControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}
```
- Wrapper: `inline-flex; gap: 1px; background: var(--surface-1); border: 1px solid var(--border-subtle); border-radius: 999px; padding: 3px;`
- Each segment: `padding: 6px 14px; font-size: 12px; font-weight: 450; color: var(--text-soft); border-radius: 999px; cursor: pointer; transition: all 180ms ease-out;`
- Active: `bg var(--surface-2); color: var(--text-primary);`
- Hover (inactive): `color: var(--text-body);`

### 2.6 — `Select` component (custom arrow)

- [ ] Create `src/components/ui/Select.tsx` wrapping native `<select>`:
- Wrapper: `position: relative; max-width: 320px;` with `::after` drawing a CSS arrow (8×8 square with `border-right` + `border-bottom` rotated 45deg, positioned at right 12px / top 50%).
- Native select: `appearance: none; height: 32px; bg var(--surface-1); border 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 32px 0 12px; font-size: 13px; color: var(--text-primary); width: 100%; cursor: pointer; font-family: var(--font-sans); outline: none;`
- Focus: `border-color: var(--border-focus);`

### 2.7 — `Textarea` component

- [ ] Create `src/components/ui/Textarea.tsx`:
- Base: `width: 100%; bg var(--surface-1); border 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 12px; font-size: 13px; color: var(--text-primary); font-family: var(--font-sans); outline: none; resize: vertical; line-height: 1.65; min-height: 80px;`
- Focus: `border-color: var(--border-focus); background: var(--surface-2);` with transition `border-color 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1);`
- Variant `mono`: `font-family: var(--font-mono); font-size: 12px;`

### 2.8 — `ToggleSwitch` component (springy knob)

- [ ] Create `src/components/ui/ToggleSwitch.tsx`:
```tsx
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}
```
- Track: `width: 36px; height: 20px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border-subtle); position: relative; cursor: pointer; transition: all 180ms ease-out;`
- Knob `::after`: `position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: var(--text-body); border-radius: 50%; transition: all 180ms cubic-bezier(0.22, 1, 0.36, 1);`
- Checked track: `background: rgba(74, 222, 128, 0.16); border-color: rgba(74, 222, 128, 0.30);`
- Checked knob: `left: 18px; background: var(--green-accent); box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);`

### 2.9 — `RadioGroup` component

- [ ] Create `src/components/ui/RadioGroup.tsx`:
```tsx
interface RadioGroupProps<T extends string> {
  options: { value: T; title: string; description?: string; danger?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}
```
- Each option: `display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; bg var(--surface-1); border: 1px solid var(--border-faint); border-radius: var(--radius-md); cursor: pointer;`
- Selected: `bg var(--surface-2); border-color: var(--border-strong);`
- Radio circle: `14×14; border-radius: 50%; border: 1px solid var(--border-strong); margin-top: 3px; position: relative;`. Selected adds inner dot via `::after { width: 6px; height: 6px; bg var(--text-body); border-radius: 50%; top: 3px; left: 3px; }`
- Title: 13px / 500 / `var(--text-primary)`. Description: 12px / `var(--text-soft)` / line-height 1.5. Danger description: `color: rgba(248, 113, 113, 0.7);`

### 2.10 — `DropZone` component

- [ ] Create `src/components/ui/DropZone.tsx`:
- Container: `padding: 32px 24px; bg var(--surface-1); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); text-align: center; cursor: pointer;`
- Hover: `border-color: var(--border-strong); bg var(--surface-2);`
- Icon (32×32, `color: var(--text-soft); opacity: 0.6`).
- Title: 14px `var(--text-body)`. Optional `<span class="link">Browse</span>` inline: `color: var(--text-primary); font-weight: 500; text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 3px;`
- Hint: mono 10px `var(--text-whisper)` uppercase.
- Wire `onDrop`, `onDragEnter`, `onDragLeave` — dragging state: `border-color: var(--border-focus); border-style: dashed; bg rgba(220, 219, 216, 0.015);`

### 2.11 — `FormField` component (label grid)

- [ ] Create `src/components/ui/FormField.tsx`:
```tsx
interface FormFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode; // input/select/textarea
  helpText?: string;         // mono uppercase below
}
```
- Grid: `display: grid; grid-template-columns: 200px 1fr; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--border-faint); align-items: start;`
- Label column: title 13px / 500 / `var(--text-primary)`, hint below 12px / `var(--text-soft)` / line-height 1.5.
- Help text below input: `font-mono 10px uppercase var(--text-whisper) letter-spacing 0.04em.`

### 2.12 — Add CSS classes for all the above

- [ ] Append a `/* Phase 02 — Primitives */` block to `src/index.css` containing all `.pill`, `.modal-*`, `.tooltip-*`, `.empty-state-*`, `.segment-*`, `.select-*`, `.toggle-*`, `.radio-*`, `.drop-zone-*`, `.form-field-*` class definitions per the specs above.

### 2.13 — Storybook-style demo (optional, for visual verification)

- [ ] (Optional) Create `src/pages/_PrimitiveDemo.tsx` that mounts every variant in a vertical stack. Route at `/_demo/primitives` (gated by env). Useful for verification but not for production. If skipping, verify by sampling each component in its actual usage site after subsequent phases ship.

## Verification

1. **Pill variants:** Render all 4 variants × 3 sizes in a test page or in an existing surface (replace MemoryDetailPanel buttons). Hover each — translateY(-1px) lift visible. Tab — focus ring visible.
2. **Modal:** Open via `useState`. Backdrop visibly blurs (compare backdrop screenshot with main blurred behind). ESC closes. Click-outside closes. Focus trapped inside.
3. **Tooltip:** Hover trigger after 600ms — tooltip appears with slide-down. Move away — disappears.
4. **ToggleSwitch:** Click — knob springs across (overshoot via premium easing). Background transitions to green tint with green glow on knob.
5. **DropZone:** Drag a file in — border becomes focus-color dashed. Drop — onDrop fires.
6. **Console:** 0 new errors across all primitive interactions.

## Backend asks

None.

## Commit

```
phase 02: shared UI primitives — Pill, Modal, Tooltip, Empty, Segment, form set

- src/components/ui/{Pill,Modal,Tooltip,EmptyState,SegmentControl,
  Select,Textarea,ToggleSwitch,RadioGroup,DropZone,FormField}.tsx
- src/index.css — Phase 02 primitive class definitions
- All variants use Phase 01 tokens; no hardcoded colors

Verified: each primitive renders with proper hover/focus/active
states; ToggleSwitch knob springs with premium easing; Modal
backdrop blurs; ESC + click-outside dismiss; reduced-motion
collapses transitions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

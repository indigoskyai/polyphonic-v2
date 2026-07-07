## Goal

Remove the lighter-than-background fill on cards, panels, and section wrappers throughout the app so surfaces read as a single flat canvas separated only by hairline borders (Vercel-style). Preserve subtle fills on interactive form controls (inputs, textareas, selects) and on true overlays (modals, popovers, tooltips, drawers) where elevation is semantic.

## Approach

The lighter card tone is driven by a small set of global CSS variables in `src/index.css` plus a handful of hardcoded rgba fills. Rather than hunt every component, I'll flatten the tokens at the source and add a dedicated input token so form fields keep their current fill.

### 1. Token remap in `src/index.css` (`:root` + AMOLED `@media` block)

- Introduce `--input-bg: #121216` (current `--surface-1`) as the dedicated field fill.
- Repoint card/panel surface tokens to canvas so they disappear into the background:
  - `--surface-1`, `--surface-2` → `var(--canvas)` (cards, hover-on-cards, data rows)
  - `--bg-elevated`, `--bg-surface`, `--bg-surface-hover`, `--surface-raised`, `--surface-muted` → `var(--canvas)` / transparent
  - `--card`, `--card-hover`, `--card-bg` → `transparent`
- Keep elevated tokens intact for true overlays: `--surface-3` (modals/popovers), `--surface-4` (tooltips), `--surface-5` (top elevation), `--bg-glass`.
- shadcn HSL bridge: point `--card` HSL to match `--background` so shadcn `Card` also flattens; keep `--popover` elevated.
- Mirror the same remap inside the AMOLED `@media (prefers-color-scheme)` override block (lines ~1106–1112) so the pure-black variant stays consistent.

### 2. Input/field carve-out

- Update the small number of input/textarea/select rules that read from `--surface-1`/`--bg-elevated` to read from `--input-bg` (currently `--bg-elevated` is used by the native `select` around line 710, and shadcn inputs pull from `--input`). Point the shadcn `--input` HSL at `#121216` so all form controls retain a subtle fill.
- Composer, search bars, and dictation inputs already use their own classes — spot-verify they resolve to `--input-bg` after remap.

### 3. Hardcoded fill audit

Sweep for card-style fills that bypass tokens and neutralize them (set to `transparent` or `var(--canvas)`), keeping borders:
- `rgba(220, 219, 216, 0.0..)` card fills in `src/index.css`
- `background: var(--surface-1|2)` usages in component CSS/JSX
- Inline `style={{ background: ... }}` on panel/card wrappers under `src/components/**` and `src/pages/**` (Journal note cards, Projects brief/threads panels, Research panels, settings sections, drawer bodies)

Scope of edits: CSS token values + a targeted find/replace pass on component-level card backgrounds. No layout, spacing, typography, or border changes.

### 4. Preserve

- Hairline/border tokens untouched — they're the only separator now, so `--hairline`, `--border-faint`, `--border-subtle`, `--border` stay as-is.
- Modals, popovers, tooltips, dropdowns, drawers, command palette, toasts keep their elevated surface (`--surface-3`+) so overlays still read above content.
- Input/textarea/select fills preserved via `--input-bg`.
- Hover/active overlays (`--overlay-hover`, `--overlay-active`) stay — they're translucent white ticks, not surface fills.

### 5. Verify

- Build + typecheck.
- Playwright screenshots on `/journal`, `/projects/:id`, `/research`, `/mind`, `/settings`, and a chat thread; compare against uploaded screenshots to confirm cards flatten and only hairlines separate sections.
- Confirm form fields, modals, popovers, tooltips still have visible fill.
- Confirm no horizontal scroll / no new console errors.

## Out of scope

- Any change to borders, radii, spacing, or typography.
- Backend, edge functions, chat runtime, Mnemos, Continuity Trace wiring.
- The already-verified Research + Continuity Trace commits.

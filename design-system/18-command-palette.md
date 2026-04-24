# Phase 18 — Command Palette ⌘K

## Goal

A global ⌘K command palette: centered modal with backdrop blur (stronger than drawer's 2px — 4px blur, 0.42 backdrop tint), search input row, scope tabs (All / Threads / Memory / Files / Settings) each with count + keyboard hint, recent searches as chips, quick actions when no query, search results grouped by scope with keyboard nav and `<mark>` match highlighting, footer with NAVIGATE / SELECT / SCOPE hints. ⌘K opens; ESC closes; ↑↓ navigates; ↵ activates; ⌘1-5 jumps scopes.

## Dependencies

- Phase 01 (foundation tokens)
- Phase 02 (Modal pattern — palette uses similar backdrop but its own container)
- Threads / Memory / Files / Settings stores (already exist) for source data

## Files to create

```
src/components/palette/CommandPalette.tsx
src/components/palette/PaletteSearchInput.tsx
src/components/palette/PaletteScopeTabs.tsx
src/components/palette/PaletteRecentChips.tsx
src/components/palette/PaletteQuickActions.tsx
src/components/palette/PaletteResults.tsx
src/components/palette/PaletteFooter.tsx
src/stores/paletteStore.ts
src/lib/paletteSearch.ts
```
- `src/index.css` — `.palette-*` classes
- `src/App.tsx` — global ⌘K listener mounting `<CommandPalette />`

## Tasks

### 18.1 — `paletteStore`

- [ ] Create `src/stores/paletteStore.ts`:
```ts
import { create } from 'zustand'

export type Scope = 'all' | 'threads' | 'memory' | 'files' | 'settings'
export interface PaletteResult {
  id: string
  scope: Exclude<Scope, 'all'>
  title: string
  subtitle?: string
  glyph?: 'thread' | 'memory' | 'file' | 'setting' | 'agent-luca' | 'agent-vektor' | 'agent-anima'
  hint?: string         // e.g. '↵ open'
  matches?: [number, number][]  // index ranges in title for <mark>
  onActivate: () => void
}

interface PaletteState {
  open: boolean
  query: string
  scope: Scope
  highlightedIndex: number
  recent: string[]
  setOpen: (open: boolean) => void
  setQuery: (q: string) => void
  setScope: (s: Scope) => void
  moveHighlight: (delta: number) => void
  pushRecent: (q: string) => void
  clearRecent: () => void
}
export const usePaletteStore = create<PaletteState>(/* impl */)
```

### 18.2 — Global ⌘K listener

- [ ] In `src/App.tsx`, add a `useEffect` registering `keydown`:
```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      usePaletteStore.getState().setOpen(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```
- [ ] Mount `<CommandPalette />` once at App root.

### 18.3 — Container + backdrop

- [ ] CSS:
```css
.palette-backdrop {
  position: fixed; inset: 0; z-index: 150;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur-settle) var(--ease-premium);
}
.palette-backdrop[data-open="true"] {
  opacity: 1; pointer-events: auto;
}
.palette {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, calc(-50% + 8px));
  width: 640px; max-height: 580px;
  z-index: 151;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-palette);
  display: flex; flex-direction: column;
  overflow: hidden;
  opacity: 0; pointer-events: none;
  transition:
    opacity var(--dur-settle) var(--ease-premium),
    transform var(--dur-settle) var(--ease-premium);
}
.palette[data-open="true"] {
  opacity: 1;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
```

### 18.4 — Search input row

- [ ] CSS:
```css
.palette-search {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.palette-search-icon {
  width: 16px; height: 16px;
  color: var(--text-soft);
  stroke-width: 1.6;
  flex-shrink: 0;
}
.palette-search-input {
  flex: 1;
  font-family: var(--font-sans);
  font-size: 16px; font-weight: 400;
  color: var(--text-primary);
  background: transparent;
  border: none; outline: none;
  letter-spacing: var(--track-body);
}
.palette-search-input::placeholder {
  color: var(--text-ghost);
  font-weight: 370;
}
.palette-esc-chip {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  border: 1px solid var(--border-faint);
  border-radius: 3px;
  padding: 2px 7px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

- [ ] On mount with `open === true`, autofocus the input and select all.

### 18.5 — Scope tabs

- [ ] CSS:
```css
.palette-scopes {
  display: flex; gap: 6px;
  padding: 10px 22px 0;
}
.palette-scope {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-size: 11px; font-weight: 450;
  color: var(--text-soft);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.palette-scope[data-active="true"] {
  background: var(--surface-2);
  color: var(--text-primary);
  border-color: var(--border);
}
.palette-scope-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
}
.palette-scope-kbd {
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--text-whisper);
  border: 1px solid var(--border-faint);
  border-radius: 2px;
  padding: 1px 4px;
}
```

- [ ] Tab options: `[ {value:'all',label:'All',kbd:'⌘1'}, {value:'threads',label:'Threads',kbd:'⌘2'}, {value:'memory',label:'Memory',kbd:'⌘3'}, {value:'files',label:'Files',kbd:'⌘4'}, {value:'settings',label:'Settings',kbd:'⌘5'} ]`
- [ ] Bind ⌘1-⌘5 to set scope while palette open.

### 18.6 — Recent chips (when query empty)

- [ ] CSS:
```css
.palette-recent {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding: 14px 22px 6px;
  align-items: center;
}
.palette-recent-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  margin-right: 4px;
}
.palette-recent-chip {
  padding: 4px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-size: 11px;
  color: var(--text-body);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.palette-recent-chip:hover { background: var(--surface-3); }
```

- [ ] Click chip → set query to chip text + run search.

### 18.7 — Quick actions (when query empty)

- [ ] 4 fixed entries:
  1. New thread (glyph `agent-luca`, hint `ACTION ↵`)
  2. Open group session (glyph `agent-vektor`, hint `ACTION ↵`)
  3. Open settings (glyph `setting`, hint `ACTION ↵`)
  4. Summon Guardian (glyph `agent-anima`, hint `ACTION ↵`)
- [ ] Render via `<PaletteResults>` with synthesized result rows; group label `QUICK ACTIONS`.

### 18.8 — Results body (search active)

- [ ] CSS:
```css
.palette-body {
  flex: 1; overflow-y: auto;
  padding: 10px 8px 14px;
}
.palette-group-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  padding: 8px 12px 6px;
}
.palette-item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  position: relative;
  transition: background var(--dur-fast) var(--ease-out);
}
.palette-item:hover { background: var(--overlay-hover); }
.palette-item[data-highlighted="true"] {
  background: var(--overlay-active);
}
.palette-item[data-highlighted="true"]::before {
  content: '';
  position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 2px;
  background: var(--text-primary);
  border-radius: 2px;
}
.palette-item[data-highlighted="true"][data-glyph="agent-luca"]::before { background: var(--luca-full); }
.palette-item[data-highlighted="true"][data-glyph="agent-vektor"]::before { background: var(--vektor-full); }
.palette-item[data-highlighted="true"][data-glyph="agent-anima"]::before { background: var(--anima-full); }

.palette-glyph {
  width: 20px; height: 20px;
  color: var(--text-soft);
}
.palette-glyph[data-glyph="agent-luca"]   { color: var(--luca-full); }
.palette-glyph[data-glyph="agent-vektor"] { color: var(--vektor-full); }
.palette-glyph[data-glyph="agent-anima"]  { color: var(--anima-full); }
.palette-title {
  font-size: 13.5px; font-weight: 450;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.palette-title mark {
  background: rgba(217, 167, 68, 0.18);
  color: var(--amber-accent);
  padding: 0 1px;
  border-radius: 2px;
}
.palette-subtitle {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-soft);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.palette-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
```

- [ ] Keyboard nav: ↑/↓ shifts `highlightedIndex` clamped to result range; ↵ calls `onActivate` of highlighted item; closing palette clears query and resets index.

### 18.9 — `paletteSearch` lib

- [ ] Create `src/lib/paletteSearch.ts`:
```ts
export function searchAll(query: string, scope: Scope): PaletteResult[]
```
- [ ] Implementation: run scope-specific source queries (threads via `threadStore`, memory via `memoryStore`, files via fs index, settings via static manifest), score by token-overlap + recency, return top 30 across scopes (or top 10 per scope when `scope === 'all'`).
- [ ] Computes `matches` ranges by case-insensitive substring; the renderer wraps those ranges in `<mark>`.

### 18.10 — Footer

- [ ] CSS:
```css
.palette-footer {
  display: flex; justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-1);
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
.palette-footer-group { display: inline-flex; gap: 12px; align-items: center; }
.palette-footer-kbd {
  border: 1px solid var(--border-faint);
  border-radius: 2px;
  padding: 1px 4px;
}
```

- [ ] Left side: `↑↓ NAVIGATE`, `↵ SELECT`, `⌘1-5 SCOPE`.
- [ ] Right side: `{N} RESULTS`.

### 18.11 — Open/close behavior

- [ ] Body lock: when open, set `document.body.style.overflow = 'hidden'`; restore on close.
- [ ] Click backdrop → close.
- [ ] ESC → close.
- [ ] On close: pushRecent(query) if query.length > 1; clear query + scope back to `'all'`.

## Verification

1. **Open via ⌘K:** Press ⌘K (Ctrl+K on linux/win) anywhere in app — palette appears centered with 4px backdrop blur. Verify:
   ```js
   () => {
     const bd = document.querySelector('.palette-backdrop')
     const cs = getComputedStyle(bd)
     return { blur: cs.backdropFilter, bg: cs.background }
   }
   ```
   Expect `blur(4px)` and `rgba(0, 0, 0, 0.42)`.
2. **Open animation:** Container slides up from `translate(-50%, calc(-50% + 8px))` to `translate(-50%, -50%)` over 320ms premium ease.
3. **Empty state:** No query → see RECENT chips (if any) + QUICK ACTIONS group with 4 entries.
4. **Search:** Type "thread" → results populate; matched text wrapped in `<mark>` with amber color.
5. **Scope nav:** Press ⌘2 → Threads tab activates; results filter to threads only; count badge in tab updates.
6. **Keyboard nav:** ↓ moves highlight; left accent bar appears; agent-color variant applies for agent glyph rows.
7. **Activate:** ↵ on highlighted result → `onActivate` fires (e.g. navigates to thread).
8. **Close:** ESC → palette hides; query cleared; query pushed to recent chips on next open.
9. **Body scroll lock:** While open, verify `document.body.style.overflow === 'hidden'`.
10. **Reduced motion:** With `prefers-reduced-motion: reduce`, palette appears instantly; no slide.
11. **Console:** 0 new errors.

## Backend asks

None for V1 (search runs against existing client stores). For server-side search later, add a `search-index` edge function that aggregates threads/memory/files into a typesense or pg-trgm index.

## Commit

```
phase 18: command palette ⌘K

- src/components/palette/{CommandPalette,PaletteSearchInput,
  PaletteScopeTabs,PaletteRecentChips,PaletteQuickActions,
  PaletteResults,PaletteFooter}.tsx (new)
- src/stores/paletteStore.ts (new) — open, query, scope,
  highlightedIndex, recent
- src/lib/paletteSearch.ts (new) — token-overlap + recency
  scoring, computes <mark> match ranges
- src/index.css — .palette-* classes (640px container,
  shadow-palette, 4px backdrop blur, slide-up 320ms premium,
  scope tabs with count + ⌘N kbd, recent chips, results
  with agent-tinted left accent bar on highlight, <mark>
  amber match wrap, footer NAVIGATE/SELECT/SCOPE hints)
- src/App.tsx — global ⌘K listener + palette mount

Verified: ⌘K opens, ESC closes, ↑↓ ↵ keyboard nav, ⌘1-5
scope jump, body scroll locked while open, reduced-motion
respected, recent chips persist across opens.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

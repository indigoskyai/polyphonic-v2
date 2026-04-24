# Phase 06 — Thread Detail Drawer

## Goal

When in a chat thread, click a small details button (or press ⌘I) → right drawer opens with METADATA / PARTICIPANTS / ACTIVITY / LINKED MEMORY / RELATED THREADS sections. Footer actions: Rename, Pin, Export, Fork, Archive (destructive).

## Dependencies

- Phase 04 (Drawer)
- Phase 07 (ActivityTimeline — used in ACTIVITY section)
- `threads`, `messages`, `entity_activity_log`, `engrams` tables

## Files

- `src/components/drawers/ThreadDetailDrawer.tsx` (new)
- `src/pages/ChatView.tsx` — add details trigger button + ⌘I keyboard shortcut
- `src/stores/threadStore.ts` — extend with `loadThreadDetail(threadId)` returning participants + activity + linked memory

## Tasks

### 6.1 — Trigger

- [ ] In ChatView thread header (top of conversation pane), add small "info" icon button (lucide `Info`, 14×14). Click → `useDrawerStore.getState().open('thread-detail', { threadId: currentThreadId })`.
- [ ] Global keyboard listener for ⌘I when in chat → opens drawer.

### 6.2 — Header section

- [ ] DrawerHeader with crumb `THREAD / № <thread-num> / <category>`. Title is `current_thread.title`.
- [ ] Status row: green pill "Active" with green dot + glow, OR archived pill (gray, no dot).
- [ ] Eyebrow above title: `№ 0147 / Investigation` (mono 9px ghost folio).

### 6.3 — METADATA section (key-value rows)

- [ ] Use `<MetaKV>` from Phase 02 (or extend if needed):
  - `created` → relative time + absolute (e.g. `Apr 19, 11:24 · 3h 8m ago`)
  - `updated` → relative time + absolute
  - `turns` → integer
  - `tokens` → with comma format (e.g. `2,412`)
  - `model` → primary model used (e.g. `opus-4-7`)
  - `session` → session id if applicable

### 6.4 — PARTICIPANTS section

- [ ] Section label: `PARTICIPANTS · {count}`
- [ ] Each participant card:
  - 30×30 avatar circle with agent-tinted inset shadow per agent identity
  - Name (13px / 500 / `var(--text-primary)`)
  - Role label (9px mono uppercase / `var(--text-ghost)`, e.g. `ORCHESTRATOR · OPUS 4.7`)
  - Right side: turn count + token count (mono 10px)
  - Hover: bg → `var(--surface-2)`, inset shadow opacity 0.18 → 0.32
- [ ] Sub-agents (nested): hierarchical with `↳` glyph + left border line descender.

### 6.5 — ACTIVITY section

- [ ] Section label: `ACTIVITY · {N} events`
- [ ] Render `<ActivityTimeline rows={...} />` (from Phase 07) with `entity_activity_log` filtered by thread_id.

### 6.6 — LINKED MEMORY section

- [ ] Section label: `LINKED MEMORY · {N}`
- [ ] Each card: type badge (Engram/Pattern/Insight) + content preview + importance bar (40×4px) + footer (created time + connection count).
- [ ] Per-type left accent bar (2px): engram cream, pattern amber 0.65, insight blue 0.60.

### 6.7 — RELATED THREADS section (optional, if data available)

- [ ] Section label: `RELATED THREADS · {N}`
- [ ] Each row: icon (14×14) + title + reason ("semantic sibling", "same project") + relative time + chevron (hidden until hover, slides in on hover).

### 6.8 — Footer actions

- [ ] `<DrawerFooter>` with Pills:
  - Rename → switches to inline-edit scene (see 6.9)
  - Pin → toggles `threads.pinned`
  - Export → triggers JSON download
  - Fork → calls edge function spawning new thread from current state
  - `<DrawerFooterSep />`
  - Archive (destructive) → soft-delete: sets `threads.archived = true`

### 6.9 — Rename inline flow (scene 3 of mockup)

- [ ] When Rename clicked: title becomes `<input>` with same styling, autofocus. Below input: `↵ save` and `esc cancel` hint (mono 10px whisper).
- [ ] Crumb gains a `<span class="drawer-crumb-status">Renaming</span>` pill (amber tint).
- [ ] On enter: save to DB. On esc: revert.

### 6.10 — Archive state (scene 4 of mockup)

- [ ] When `thread.archived = true`:
  - Title styling dims to `var(--text-secondary)`.
  - Status pills: archived (no dot) + participants list without dots.
  - Add `.archived-note` callout: 11px text-soft inside `var(--surface-1)` box with left accent bar in warm cream tint. Copy: `Historical thread · read-only. Fork to continue the conversation, or restore to reopen.`
  - Footer: Restore + Export + Fork (no Archive).

## Verification

1. In `/chat`, click info icon → drawer opens with all sections populated from real data.
2. Rename: click → inline input → ↵ saves → drawer crumb status clears.
3. Pin: Pillbutton toggle → `threads.pinned` updates → DB confirmed.
4. Multiple threads: drawer content swaps when navigating between threads.
5. Archived thread: visit one (or simulate) → archived state styling applies.
6. Console: 0 errors.

## Commit

```
phase 06: thread detail drawer

- src/components/drawers/ThreadDetailDrawer.tsx
- src/pages/ChatView.tsx — info trigger + ⌘I shortcut
- src/stores/threadStore.ts — loadThreadDetail()
- All 5 sections (Metadata, Participants, Activity, Linked
  Memory, Related Threads), inline Rename, Archive state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

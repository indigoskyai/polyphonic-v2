# Phase 16 — Checkpoints + Diff Viewer

## Goal

Surface a `/checkpoints` route showing a vertical timeline of saved working-state snapshots. Each checkpoint carries metadata (timestamp, agent, summary, optional annotation) and a diff stat. Expanding a checkpoint reveals the file list with per-file +/- counts; clicking a file expands an inline diff viewer with red/green gutter coloring and mono numbering. Restore action triggers a confirm Modal. Compare-two-checkpoints flow renders side-by-side or unified diff between any two selected snapshots. Milestone checkpoints get the dual-halo amber dot from Phase 07; incremental checkpoints use a ghost dot.

## Dependencies

- Phase 01 (foundation tokens — surfaces, text tiers, mono font, amber halos, green/red accents)
- Phase 02 (Pill, Modal)
- Phase 07 (timeline dot patterns — checkpoint dual halos, incremental ghost dot)
- Backend: `checkpoints` table (see Backend asks if missing)

## Files to create

```
src/pages/CheckpointsView.tsx
src/components/checkpoints/CheckpointTimeline.tsx
src/components/checkpoints/CheckpointCard.tsx
src/components/checkpoints/DiffViewer.tsx
src/components/checkpoints/CompareBar.tsx
src/components/checkpoints/RestoreConfirmModal.tsx
src/stores/checkpointStore.ts
```
- `src/index.css` — `.cp-*`, `.diff-*`, `.cp-timeline-*` classes
- `src/App.tsx` — register `/checkpoints` route

## Tasks

### 16.1 — `checkpointStore`

- [ ] Create `src/stores/checkpointStore.ts`:
```ts
import { create } from 'zustand'

export interface CheckpointFile {
  path: string
  added: number
  removed: number
  diff?: DiffHunk[] // lazy-loaded on expand
}
export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: { type: 'add' | 'del' | 'context'; oldNum?: number; newNum?: number; text: string }[]
}
export interface Checkpoint {
  id: string
  createdAt: string
  agent: 'luca' | 'vektor' | 'anima' | 'observer'
  summary: string
  annotation?: string
  milestone: boolean
  filesAdded: number
  filesRemoved: number
  files: CheckpointFile[]
}
interface CheckpointState {
  checkpoints: Checkpoint[]
  expandedIds: Set<string>
  selectedForCompare: [string | null, string | null]
  loadDiff: (checkpointId: string, filePath: string) => Promise<void>
  toggleExpand: (id: string) => void
  selectForCompare: (id: string) => void
  clearCompare: () => void
}
export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  expandedIds: new Set(),
  selectedForCompare: [null, null],
  loadDiff: async (checkpointId, filePath) => { /* fetch from edge fn, set into store */ },
  toggleExpand: (id) => set((s) => {
    const next = new Set(s.expandedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    return { expandedIds: next }
  }),
  selectForCompare: (id) => set((s) => {
    const [a, b] = s.selectedForCompare
    if (a === id) return { selectedForCompare: [null, b] }
    if (b === id) return { selectedForCompare: [a, null] }
    if (!a) return { selectedForCompare: [id, b] }
    if (!b) return { selectedForCompare: [a, id] }
    return { selectedForCompare: [b, id] } // FIFO
  }),
  clearCompare: () => set({ selectedForCompare: [null, null] }),
}))
```

### 16.2 — `/checkpoints` route + page shell

- [ ] Register route in `src/App.tsx`: `<Route path="/checkpoints" element={<CheckpointsView />} />`
- [ ] `CheckpointsView.tsx`:
  - Top bar (44px tall): title `Checkpoints` (20px / 450 / `var(--text-primary)`), spacer, `<CompareBar />` on right
  - Body: `padding: 24px 32px 80px`, max-width `880px`, centered
  - Empty state: use Phase 02 `<EmptyState>` with copy `No checkpoints yet — they'll appear here as work progresses.`
  - On mount: load checkpoints (via Supabase select; subscribe to realtime inserts)

### 16.3 — `CheckpointTimeline` component

- [ ] Vertical line + dot per checkpoint. CSS:
```css
.cp-timeline {
  position: relative;
  padding-left: 32px;
}
.cp-timeline::before {
  content: '';
  position: absolute;
  left: 11px; top: 8px; bottom: 8px;
  width: 1px;
  background: var(--border-subtle);
}
.cp-dot {
  position: absolute;
  left: 4px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--canvas);
  border: 1px solid var(--border-strong);
}
.cp-dot--milestone {
  background: var(--amber-accent);
  border: none;
  box-shadow: var(--amber-halo-1), var(--amber-halo-2);
}
.cp-dot--incremental {
  background: var(--text-ghost);
  border: 1px solid var(--border-subtle);
  width: 8px; height: 8px;
  left: 7px;
  margin-top: 3px;
}
```

### 16.4 — `CheckpointCard` (collapsed)

- [ ] CSS:
```css
.cp-card {
  position: relative;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-inset-highlight);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.cp-card:hover { border-color: var(--border-strong); }
.cp-card[data-selected="true"] {
  border-color: var(--amber-border);
  background: linear-gradient(0deg, var(--amber-bg), var(--amber-bg)), var(--surface-1);
}

.cp-card-header { display: flex; align-items: center; gap: 10px; }
.cp-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-whisper);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
}
.cp-agent-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.cp-agent-dot--luca   { background: var(--luca-full); }
.cp-agent-dot--vektor { background: var(--vektor-full); }
.cp-agent-dot--anima  { background: var(--anima-full); }
.cp-agent-name {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: var(--track-meta);
}
.cp-summary {
  margin-top: 6px;
  font-size: 13.5px;
  color: var(--text-primary);
  font-weight: 450;
  line-height: 1.45;
}
.cp-annotation {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-soft);
  font-style: italic;
  line-height: 1.55;
  border-left: 2px solid var(--border-subtle);
  padding-left: 10px;
}

.cp-stats { display: flex; gap: 12px; margin-top: 10px; align-items: center; }
.cp-stat {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: var(--track-meta);
}
.cp-stat--add { color: var(--green-accent); }
.cp-stat--del { color: var(--red-accent); }
.cp-stat--files { color: var(--text-ghost); }
.cp-expand-toggle {
  margin-left: auto;
  background: transparent; border: none;
  color: var(--text-tertiary); cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--track-meta);
  padding: 4px 8px; border-radius: var(--radius-sm);
  transition: all var(--dur-fast) var(--ease-out);
}
.cp-expand-toggle:hover { color: var(--text-primary); background: var(--overlay-hover); }
```

- [ ] Card composition (header row): `cp-time` + `cp-agent-dot` + `cp-agent-name` + spacer + `cp-expand-toggle` (label `EXPAND` / `COLLAPSE`).
- [ ] Below header: `cp-summary` text. If `annotation` present, render `cp-annotation` paragraph below summary.
- [ ] Stats row: `+{filesAdded} files`, `-{filesRemoved} files`, dot, `MILESTONE` chip when `checkpoint.milestone === true` (mono 9px folio amber color).

### 16.5 — Expanded file list

- [ ] When `expandedIds.has(checkpoint.id)`, render `cp-files`:
```css
.cp-files {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cp-file-row {
  display: grid;
  grid-template-columns: 1fr 60px 60px 12px;
  gap: 12px;
  align-items: center;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.cp-file-row:hover { background: var(--overlay-hover); }
.cp-file-row[data-open="true"] { background: var(--overlay-active); }
.cp-file-path {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-body);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cp-file-add {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--green-accent);
  text-align: right;
}
.cp-file-del {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--red-accent);
  text-align: right;
}
.cp-file-chev { color: var(--text-whisper); transition: transform var(--dur-fast) var(--ease-out); }
.cp-file-row[data-open="true"] .cp-file-chev { transform: rotate(90deg); }
```

- [ ] On row click → call `loadDiff(checkpoint.id, file.path)` if not loaded → render `<DiffViewer>` inline below the row.

### 16.6 — `DiffViewer` component

- [ ] CSS:
```css
.diff-viewer {
  margin: 6px 0 10px;
  background: var(--floor);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
}
.diff-hunk-header {
  padding: 6px 12px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 10px;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
}
.diff-line {
  display: grid;
  grid-template-columns: 36px 36px 4px 1fr;
  align-items: stretch;
}
.diff-line__num {
  text-align: right;
  padding: 0 8px;
  font-size: 10px;
  color: var(--text-whisper);
  user-select: none;
  border-right: 1px solid var(--border-subtle);
}
.diff-line__gutter {
  width: 4px;
  align-self: stretch;
}
.diff-line--add .diff-line__gutter { background: rgba(74, 222, 128, 0.5); }
.diff-line--del .diff-line__gutter { background: rgba(248, 113, 113, 0.5); }
.diff-line--context .diff-line__gutter { background: transparent; }
.diff-line--add { background: var(--green-bg); }
.diff-line--del { background: var(--red-bg); }
.diff-line--context { color: var(--text-soft); }
.diff-line__text {
  padding: 0 12px;
  white-space: pre;
  color: var(--text-body);
}
.diff-line--add .diff-line__text { color: var(--text-primary); }
.diff-line--del .diff-line__text { color: var(--text-primary); }
```

- [ ] Each hunk: header line `@@ -oldStart,N +newStart,M @@` then per-line rows.
- [ ] Lines: type `add` shows `newNum` in right gutter and blank in left; `del` reverses; `context` shows both.

### 16.7 — Restore action

- [ ] Inside expanded `cp-card`, beneath file list, render footer:
```html
<div class="cp-card-footer">
  <Pill variant="primary" onClick={openRestoreConfirm}>Restore to this checkpoint</Pill>
  <Pill variant="ghost" onClick={selectForCompare}>Select to compare</Pill>
</div>
```
- [ ] CSS:
```css
.cp-card-footer {
  display: flex; gap: 8px;
  padding-top: 12px; margin-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
```
- [ ] `RestoreConfirmModal` (uses Phase 02 `<Modal>`):
  - Title: `Restore to this checkpoint?`
  - Body: 13px text-body line — `This will revert your working state to <timestamp>. Files modified after this point will be lost. A new checkpoint of the current state will be saved automatically.`
  - Footer: `<Pill variant="ghost">Cancel</Pill> <Pill variant="destructive">Restore</Pill>`
  - On Restore → call edge function `checkpoint-restore` with `{ checkpoint_id }` → on success, toast + close modal.

### 16.8 — `CompareBar` (top-right of CheckpointsView)

- [ ] When `selectedForCompare` has 0 ids: render hint `Select two checkpoints to compare` (mono 10px ghost folio uppercase).
- [ ] When 1 id selected: show `1 of 2 selected` + `<Pill size="xs" variant="ghost">Clear</Pill>`.
- [ ] When 2 ids selected: render `<Pill variant="primary">Compare</Pill>` + `<Pill variant="ghost">Clear</Pill>`. Compare opens unified diff between the two snapshots in a Modal sized `width: 880px; max-height: 80vh`.
- [ ] CSS:
```css
.cp-compare-bar {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 6px 10px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
}
.cp-compare-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
```

### 16.9 — Compare modal

- [ ] Renders side-by-side OR unified toggle (Phase 02 `<SegmentControl>` `'unified' | 'split'`).
- [ ] Body: list of changed files (from server-computed diff between two checkpoints), each expandable to a `DiffViewer`. In `split` mode, render two `DiffViewer` columns side-by-side at 50% width each.

## Verification

1. **Visual smoke:** Visit `/checkpoints`. Timeline renders with vertical line and dots; milestone dots show amber dual halos.
2. **Expand/collapse:** Click `EXPAND` on a card — file list slides into view.
3. **Diff viewer:** Click a file row — diff renders. Verify computed-style:
   ```js
   () => {
     const add = document.querySelector('.diff-line--add .diff-line__gutter')
     const del = document.querySelector('.diff-line--del .diff-line__gutter')
     return { add: getComputedStyle(add).background, del: getComputedStyle(del).background }
   }
   ```
   Expect `rgba(74, 222, 128, 0.5)` and `rgba(248, 113, 113, 0.5)` respectively.
4. **Restore confirm:** Click Restore → Modal appears with destructive Pill. Cancel dismisses; Restore fires edge function.
5. **Compare flow:** `selectForCompare` two cards via the ghost Pill in expanded footer; `CompareBar` shows count → click Compare → Modal opens with unified diff.
6. **Reduced motion:** Expand/collapse and modal open instantly under `prefers-reduced-motion: reduce`.
7. **Console:** 0 new errors.

## Backend asks

If `checkpoints` table does not yet exist, hand Lovable this prompt:

> Create a `checkpoints` table with columns: `id uuid pk`, `created_at timestamptz default now()`, `agent text check (agent in ('luca','vektor','anima','observer'))`, `summary text`, `annotation text null`, `milestone boolean default false`, `files_added int default 0`, `files_removed int default 0`, `snapshot_ref text` (path/blob ref). Add `checkpoint_files` table with columns: `id uuid pk`, `checkpoint_id uuid fk → checkpoints(id) on delete cascade`, `path text`, `added int default 0`, `removed int default 0`, `diff_blob text null`. RLS: select to authenticated users in the same workspace. Add edge function `checkpoint-restore` that accepts `{ checkpoint_id }`, snapshots current state into a new auto-checkpoint with `annotation = 'auto-saved before restore'`, then applies the target snapshot. Add edge function `checkpoint-diff` that accepts `{ id_a, id_b }` and returns per-file unified diff hunks.

## Commit

```
phase 16: checkpoints + diff viewer

- src/pages/CheckpointsView.tsx (new)
- src/components/checkpoints/{CheckpointTimeline,CheckpointCard,
  DiffViewer,CompareBar,RestoreConfirmModal}.tsx (new)
- src/stores/checkpointStore.ts (new) — checkpoints, expanded ids,
  compare selection, lazy diff loader
- src/index.css — .cp-* + .diff-* classes (timeline line/dots,
  card collapsed/expanded, file rows, hunk-headed diff viewer
  with red/green gutter + bg tint)
- src/App.tsx — register /checkpoints route
- Restore confirm via Phase 02 Modal (destructive Pill)
- Compare flow: select two → unified or split diff in Modal

Verified: timeline + dual-halo milestone dots, expand/collapse,
diff gutter colors per spec, restore confirm + edge fn call,
compare bar count + 2-of-2 trigger.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Memory graph — calmer hover + better deselection

### 1. Replace strobe hover with a gentle highlight (GraphTab.tsx render loop)

Currently `focusId = hoveredId ?? selectedId` triggers a hard 3‑tier split (focused / neighbor / heavily dimmed at ~0.04 alpha), which makes the whole graph flash off as the cursor moves between nodes.

Change the model so non‑focused nodes/edges stay visible — focus *brightens* the target, it does not extinguish everything else:

- Split focus state into `selectedId` (sticky, strong treatment) vs `hoveredId` (transient, soft treatment).
- Remove the harsh "isDimmed → 0.04 alpha + grey stroke" branch for hover. Instead apply a single global background multiplier ~`0.78` (so the field gently recedes ~22%) **only when there is a focus**, and ease this multiplier toward 1.0 over ~180ms so movement between nodes doesn't pop.
- The hovered node + its 1‑hop neighbors get a brightness *boost* (alpha ×1.25, glow radius bumped modestly, ring brightened) rather than the rest going dark.
- Selected node keeps its existing crisper treatment (ring + halo) but neighbors of the selection also stay visible at base brightness, not dim.
- Edges: focused edges brighten as today; non‑focused edges keep their base alpha (no `EDGE_DIM` swap on hover — only on selection, and even then at ~0.6× not the current dramatic drop).
- Glow halo: stop gating on `!isDimmed`. Always render the halo; just scale its alpha by the same gentle background multiplier.

Result: hovering reads as "this node lights up a little more" against a constellation that's still fully alive, instead of a strobe.

### 2. Deselect interactions

a. **Double‑click on empty canvas** — `handleDoubleClick` currently only re‑fits the camera. Detect whether the dbl‑click hit a node via `getNodeAtClient`:
  - hit empty space → clear selection (`setSelectedEngram(null)`), close the memory‑detail drawer if open, and re‑fit camera (existing behavior).
  - hit the currently selected node → clear selection + close drawer, no re‑fit.
  - hit another node → just select that node (no re‑fit).

b. **Closing the drawer clears selection** — in `src/components/drawers/MemoryDetailDrawer.tsx`, wrap the close paths so both the X button and backdrop/ESC dismissal call `setSelectedEngram(null)` before `close()`. Concretely: pass an `onClose` that does both to `<Drawer>` (it already triggers on ESC + backdrop), and use the same handler for `DrawerCloseBtn`.

### Files touched
- `src/components/memory/GraphTab.tsx` — render loop focus math, `handleDoubleClick` branching.
- `src/components/drawers/MemoryDetailDrawer.tsx` — unified close handler that also clears `selectedEngram`.

### Out of scope
No changes to layout, physics, filter chrome, or data flow.
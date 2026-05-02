I agree with your diagnosis. The current engram detail is not the same artifact as the thread detail drawer. It is an inline side panel that borrows a few class names, so it changes the split layout and never gets the floating drawer composition from the thread mockup.

What is different right now:

- Current engram detail is rendered inside `MemoryView` as a flex child beside the graph; the thread detail artifact is a floating right overlay with top/right inset, rounded top corners, shadow depth, and its own z-layer.
- Current engram detail starts with `DrawerHeader` plus title directly; the uploaded drawer has a small chrome header, then a separate `drawer-title-section` containing eyebrow, large title, and status pills.
- Current engram detail uses `meta-kv` rows and generic sections; the uploaded drawer uses `kv-list` / `kv-row`, stronger section spacing, section labels with a trailing hairline, and a richer status-pill system.
- Current close/ESC controls are visually close but not the exact header structure from the artifact: `Thread / № 0142` crumb, `ESC`, icon button.
- Current graph selection reflows the canvas because the detail panel takes layout width; the target behavior is that the drawer floats over the graph without blurring the screen.
- Current graph visual is too sparse and evenly distributed; the target graph is a dense force cluster with many visible hairline connections and nodes pulled toward a central constellation.

Plan:

1. Stop rendering `GraphDetailPanel` as an inline flex side panel
   - Remove the selected-engram panel mount from `MemoryView` for Graph/Engrams.
   - Selecting an engram will open the global drawer route with a payload, rather than adding a right-side component into the page layout.
   - The graph canvas will keep its full available width and the drawer will float over it.

2. Add a real `memory-detail` drawer route
   - Use the existing app-level `DrawerRouter` path for `active === 'memory-detail'` instead of the current placeholder.
   - Update `drawerStore` payload to carry `{ engramId }` or `{ engram }`.
   - `GraphTab` and `EngramsTab` will both open `memory-detail` using the same drawer system.
   - The memory store can still keep `selectedEngram` only for node highlight/row selection, but the visible detail UI will be the drawer route.

3. Make the global Drawer support “no backdrop blur” for memory detail
   - Extend the shared `Drawer` primitive with a non-breaking option such as `showBackdrop={false}` or `backdropMode="none"`.
   - In `App.tsx`, use no backdrop only when `active === 'memory-detail'`.
   - Keep the drawer itself identical: fixed position, right inset, top inset, width `var(--drawer-width)`, rounded top corners, drawer shadow, slide animation, ESC handling, and close button.
   - This preserves thread detail behavior exactly while letting Mnemos detail avoid screen blur.

4. Rebuild `GraphDetailPanel` as drawer content only, not a panel artifact
   - It will return drawer internals, just like `ThreadDetailDrawer`, not an `<aside>` wrapper.
   - Structure will match the uploaded HTML:

```text
DrawerHeader
  crumb: Engram / № 8DC29A
  ESC chip
  close button

Title section
  eyebrow: № 8DC29A / MEMORY / EPISODIC
  large title from truncated engram content
  status row: type, state, connection count

DrawerBody
  CONTENT
  METADATA
  PROVENANCE
  CONNECTIONS
  TAGS

DrawerFooter
  Export
  Close
```

   - The content changes for engrams, but the artifact shell, spacing, typography, pills, dividers, scroll body, and footer treatment will follow the thread-detail drawer.

5. Port the missing thread-detail artifact anatomy from the uploaded HTML into the app styles
   - Add or align these classes in `index.css`:
     - `drawer-title-section`
     - `drawer-eyebrow`
     - `drawer-status-row`
     - `status-pill`
     - `kv-list`, `kv-row`, `kv-label`, `kv-value`
     - richer `drawer-section-label` trailing-line treatment if it does not break existing drawer sections
     - `drawer-action` only if we choose to match the uploaded footer buttons instead of current `Pill` footer actions
   - Prefer additive classes so existing thread drawer does not regress.
   - Then update `ThreadDetailDrawer` only if needed to use the richer title-section pattern already defined by its spec. The main goal is artifact parity, not another superficial restyle.

6. Fix graph selection behavior and canvas density
   - On graph node click: set selected engram for highlight, then open `memory-detail` drawer.
   - On drawer close: close drawer and clear selected engram.
   - Render selected node ring based on selected engram while drawer is open.
   - Adjust graph initialization/physics/rendering toward the target screenshot:
     - Centered dense cluster instead of sparse snowfield.
     - Stronger edge visibility at low opacity.
     - Better initial positions and spring lengths so connected nodes cluster.
     - Graph should remain visually present behind the floating drawer.

7. Preserve the “same system” across surfaces
   - Chat thread detail and Mnemos engram detail will share the same `Drawer` primitive, same drawer shell CSS, same motion, same header controls, same section mechanics.
   - Only the drawer content differs: thread metadata/activity vs engram content/provenance/connections.

Verification after implementation:

- `/memory` Graph: click a node; drawer floats over graph, no blurred backdrop, graph does not shrink.
- Drawer visually matches the thread detail artifact: inset panel, shadow depth, chrome header, title section, status pills, body sections, footer.
- ESC and close button close the drawer.
- Clicking connected engrams inside the drawer updates the same drawer content, not a different panel.
- Engrams list opens the same drawer artifact as graph nodes.
- `/chat` thread detail still opens with backdrop blur and is not regressed.
- Console has no new errors.
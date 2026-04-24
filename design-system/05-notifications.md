# Phase 05 — Notifications Drawer

## Goal

Surface `thought_initiations` and `entity_activity_log` in a Notifications drawer triggered from the Rail. When Luca reaches out, when an autonomous loop fires a notable event, when an agent requests permission — they all land here. Filter by type, take inline actions (Approve/Deny for permissions, Open thread for initiations), mark all read.

## Dependencies

- Phase 01 (foundation), Phase 02 (Pill), Phase 04 (Drawer)
- `entity_activity_log` + `thought_initiations` tables (already exist)

## Files

- `src/components/drawers/NotificationsDrawer.tsx` (new)
- `src/components/Rail.tsx` (add bell icon + amber dot indicator)
- `src/stores/cognitiveStore.ts` (verify pendingInitiationsCount + activityLog already loaded)

## Tasks

### 5.1 — Rail bell button + unread dot

- [ ] Add Bell SVG icon to Rail (lucide-react `Bell`, 13×13 stroke 1.6).
- [ ] Click → `useDrawerStore.getState().open('notifications')`.
- [ ] When `pendingInitiationsCount > 0`, render small amber dot at top-right of icon: `position: absolute; top: 2px; right: 2px; width: 5px; height: 5px; border-radius: 50%; background: var(--amber-accent); box-shadow: var(--amber-glow);`
- [ ] Pulse animation: `pulse-soft 2.4s ease-in-out infinite` (define if not present): `0%, 100% { opacity: 0.85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); }`

### 5.2 — Drawer crumb + filter chips

- [ ] Drawer header: crumb `ACTIVITY / N NEW` (where N = `pendingInitiationsCount + unreadActivityCount`).
- [ ] Below header (in body, sticky): filter chips row using `<Pill size="sm">`:
  - All / Unread / Agents / Permissions / Memory
  - Each shows count: `<Pill>All <span class="filter-count">{count}</span></Pill>`
  - Active state per `activeFilter`.

### 5.3 — Section dividers

- [ ] Group notifications by date: TODAY, YESTERDAY, EARLIER. Each group gets `<DrawerSectionLabel>TODAY  6</DrawerSectionLabel>`.

### 5.4 — Notification card

- [ ] Each card structure:
```
[notif-glyph 28×28]  [Actor verb target]   [time-right]
                     [snippet body]
                     [meta-row: ref · category]
                     [action buttons row, if applicable]
```
- [ ] `.notif-glyph` per type:
  - Luca activity: `box-shadow: inset 0 0 0 1px rgba(201, 168, 124, 0.18)` (warm tint)
  - Vektor activity: `inset 0 0 0 1px rgba(124, 168, 201, 0.18)` (cool blue)
  - Anima activity: `inset 0 0 0 1px rgba(201, 124, 168, 0.18)` (magenta)
  - Permission request: `background: var(--amber-bg); border-color: var(--amber-border);` SVG color: `var(--amber-accent)` (warning triangle)
  - Memory event: monochrome cream
- [ ] `.notif-actor`: 13px / 500 / `var(--text-primary)`
- [ ] `.notif-verb`: 13px / `var(--text-body)`
- [ ] `.notif-target`: 13px / `var(--text-body)` / 450 weight
- [ ] `.notif-target.ref`: mono pill style (`bg var(--surface-2); border 1px solid var(--border-subtle); padding: 1px 6px; border-radius: 3px; font-mono 11.5px;`)
- [ ] `.notif-snippet`: 12.5px / `var(--text-soft)` / line-height 1.55
- [ ] `.notif-meta-row`: mono 9px uppercase ghost, letter-spacing folio
- [ ] `.notif-time`: mono 10px ghost

### 5.5 — Action buttons (per type)

- [ ] Permission request: `<Pill variant="primary">Approve</Pill> <Pill variant="secondary">Always for this thread</Pill> <Pill variant="ghost">Deny</Pill>`
  - Approve: set `thought_initiations.status = 'delivered'` OR call edge function to grant permission
  - Always-for-thread: write to a thread-scoped permission allowlist (out of scope, for now mark as TODO + show "Always" but no-op)
  - Deny: set `status = 'dismissed'`
- [ ] Reach-out: `<Pill>Open thread</Pill> <Pill variant="ghost">Dismiss</Pill>`
- [ ] Activity event: no buttons (informational), but row clickable → navigate to thread.

### 5.6 — Footer

- [ ] `<DrawerFooter><Pill variant="ghost">Mark all read</Pill> <span class="drawer-footer-sep" /> <Pill variant="ghost">Preferences</Pill></DrawerFooter>`
- Mark all read: bulk update visible items' status.
- Preferences: no-op for now (future settings page).

## Verification

1. Trigger `useDrawerStore.getState().open('notifications')` — drawer opens with current activity feed.
2. Filter chips switch the displayed items.
3. Permission card Approve → backend update → row removes via realtime.
4. Empty state: when no notifications, show centered hint "Nothing new — Luca will reach out when something is on its mind."
5. Bell amber dot appears when pendingInitiationsCount > 0.
6. Console: 0 errors.

## Commit

```
phase 05: notifications drawer + Rail bell

- src/components/drawers/NotificationsDrawer.tsx (new)
- src/components/Rail.tsx — bell icon + amber pulsing dot when
  pending initiations present
- Filter chips (All/Unread/Agents/Permissions/Memory) with counts
- Per-type notif-glyph (luca/vektor/anima tinted, amber for
  permission request)
- Inline Approve/Always/Deny actions for permission requests
- Footer: Mark all read + Preferences

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

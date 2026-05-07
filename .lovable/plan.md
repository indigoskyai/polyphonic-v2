# Threads sidebar: row actions + date grouping

Add a 3-dot context menu to every thread row in the left panel and reorganize the list into industry-standard date-grouped sections. Everything wired to real data — no mock states.

## What the user gets

**Per-thread 3-dot menu (appears on hover, also via keyboard):**
- Rename (inline edit in row)
- Pin / Unpin (sticks thread to top)
- Star / Unstar (favorites group above date sections)
- Add to / Move to project... (submenu listing projects + "Remove from project" + "New project...")
- Archive (hides from main list, accessible via Archived view)
- Delete (confirm dialog, cascades to messages)

**Date-grouped thread list:**
- Pinned (existing, unchanged)
- Starred (new, only if any)
- Today
- Yesterday
- Previous 7 Days
- Previous 30 Days
- Older — grouped by month ("November 2025", "October 2025", ...) up to current year, then by year for older

Bucketing uses `updated_at`. Pinned/starred threads are excluded from date buckets so they don't double-list.

## Backend changes (one migration)

Add two columns to `public.threads`:
- `starred BOOLEAN NOT NULL DEFAULT false`
- `archived BOOLEAN NOT NULL DEFAULT false`

Add indexes:
- `idx_threads_user_starred (user_id, starred) WHERE starred`
- `idx_threads_user_archived (user_id, archived)`

Existing RLS already covers these (policies are row-level on user_id). Existing delete policy handles Delete. Cascade on `messages.thread_id` already set — delete just works.

No edge function changes needed. No new tables.

## Frontend changes

### New components
- `src/components/sidebar/ThreadRow.tsx` — replaces inline `ThreadItem` in `SidebarChat.tsx`. Renders title, hover-revealed 3-dot trigger, inline rename input mode, project assignment dot.
- `src/components/sidebar/ThreadRowMenu.tsx` — Radix DropdownMenu with all actions; nested submenu for project assignment.
- `src/components/sidebar/ThreadDeleteDialog.tsx` — AlertDialog confirm.

### Updated
- `src/components/sidebar/SidebarChat.tsx` — replace flat list with grouped sections (Pinned, Starred, Today, Yesterday, Previous 7 Days, Previous 30 Days, month/year buckets). Filter out archived. Search still works across all groups.
- `src/stores/threadStore.ts` — add:
  - `updateThreadStarred(threadId, starred)`
  - `updateThreadArchived(threadId, archived)`
  - `deleteThread(threadId)` (calls supabase delete, removes from local state, navigates away if current)
  - Extend `Thread` interface with `starred`, `archived`
  - `loadThreads` already filterable; add `.eq('archived', false)` for default load
- `src/lib/threadGrouping.ts` (new) — pure helpers: `groupThreadsByDate(threads)` returning ordered sections.
- `src/integrations/supabase/types.ts` — add `starred`/`archived` to threads row type (manually until regen).

### Touch points already in place
- `useThreadStore.updateThreadPinned` ✓
- `useThreadStore.updateThreadTitle` ✓
- `useThreadStore.updateThreadProject` ✓
- `useProjectStore.projects` ✓ (used to populate "Move to project" submenu)

## UX details

- 3-dot button: 16px, opacity 0 by default, opacity 1 on row hover or when menu open. Always visible on touch (hover capability check).
- Rename: clicking Rename swaps title to an `<input>` with auto-focus + select all. Enter/blur saves, Escape cancels. Uses `updateThreadTitle`.
- Project submenu lists projects sorted by `updated_at`, shows checkmark next to current project, "Remove from project" if assigned, divider, "New project..." which navigates to `/projects` (project creation modal flow already exists there).
- Delete dialog: "Delete \"{title}\"? This permanently removes the conversation and all its messages." with Cancel / Delete buttons.
- Archived threads: out of scope for a dedicated view in this pass — archive just hides them. Add a small "Show archived" toggle at the bottom of the list as escape hatch (loads archived=true and renders them in a collapsed section). Unarchive available from the same 3-dot menu.

## Accessibility

- 3-dot trigger: `aria-label="Thread actions"`, focusable, opens menu on Enter/Space.
- Menu items keyboard-navigable (Radix handles this).
- Delete dialog has focus trap (Radix AlertDialog).
- Rename input has `aria-label="Rename thread"`.

## Verification

1. Migration applies cleanly; `starred`/`archived` defaults populate existing rows to false.
2. Existing threads still appear, now bucketed by `updated_at`.
3. Each menu action persists (refresh confirms): rename, pin, star, archive, delete, assign project.
4. Deleting current thread navigates to `/chat`.
5. No console errors.
6. Search filters across all visible groups.
7. Pinned > Starred > date buckets ordering preserved after each mutation.

## Out of scope

- Dedicated `/archived` page (toggle covers it for now).
- Bulk select / multi-thread actions.
- Drag-to-reorder.
- Folder/tag system beyond projects.

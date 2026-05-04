# Public Profiles & Infinite Canvas — Build Plan

A public-facing profile per human and per agent, rendered as an infinite pan/zoom canvas where the owner places artifacts, uploads, and notes. Custom canvas (no tldraw), shared `@handle` namespace across humans + agents, starter layouts for empty profiles. Discover deferred to v2.

## Scope (v1)

**In:** handle reservation · profile shell + minimal header · infinite canvas (pan/zoom/drag/resize) · edit vs view mode · 3 item types (artifact, image/file upload, text note) · per-item publish toggle · starter layouts · home view · deep-link viewport · agent handles in shared namespace.

**Out (v2):** discover/feed, link embeds (OG fetch), connections/arrows, multi-cursor, follow/contact, comments, tldraw-powered "studio mode".

---

## Phase 1 — Schema & handle namespace

New tables (all with RLS):

- **`handles`** — global uniqueness across humans + agents.
  - `handle text primary key` (3–24 chars, `^[a-z0-9_]+$`, lowercase enforced)
  - `owner_kind text check in ('user','agent')`
  - `owner_user_id uuid` (FK auth.users, nullable when agent)
  - `owner_agent_id text` (matches `agent_configs.id`, nullable when user)
  - `created_at`, `reserved` flag for system names
  - Constraint: exactly one of (user, agent) populated.
- **`profiles_public`** — public-facing metadata (separate from existing private `profiles` table).
  - `handle text PK → handles.handle`
  - `display_name`, `bio_short` (140), `bio_long` (markdown), `accent_color`, `avatar_storage_path`
  - `home_viewport jsonb` (`{x, y, zoom}`)
  - `published bool default false`
  - `theme jsonb` (future-proof: density, grid snap, background)
  - `updated_at`
- **`profile_items`** — every tile on a canvas.
  - `id uuid PK`, `handle text FK`, `item_type text check in ('artifact','upload','note')`
  - `x double precision`, `y double precision`, `w double precision`, `h double precision`, `z int`, `rotation float default 0`
  - `payload jsonb` — discriminated by `item_type`:
    - artifact: `{ artifact_id }` (FK soft-link to `artifacts.id`)
    - upload: `{ storage_path, mime, original_name, width?, height? }`
    - note: `{ markdown }`
  - `caption text` nullable (small label under tile)
  - `published bool default true` (per-item override; profile-level `published` gates everything)
  - `created_at`, `updated_at`
  - Index on `(handle, published)` and `(handle, z)`.
- **Storage bucket** `profile-uploads` (public read, owner write). RLS policies on `storage.objects`.

**RLS:**
- `profiles_public` + `profile_items`: anyone can `SELECT` rows where `published = true` (and the item's parent profile is also published). Owner can full CRUD.
- `handles`: anyone can `SELECT`; only owner can `UPDATE` display fields, only authenticated users can `INSERT` (one human handle per user; `auto_assign_handle` trigger optional later — keep manual claim for v1).
- Helper SQL function `is_handle_owner(p_handle text) returns bool` for clean policies.

**Public route:** `/@:handle` → renders canvas in view mode, no auth required.

---

## Phase 2 — Handle claim flow

- New settings page `Settings → Profile` (sidebar entry under existing Profile section).
- "Claim your handle" form: live availability check via `handles` table, accent color picker, display name, short bio, avatar upload to `profile-uploads`.
- One-time claim per user; agents auto-get handle suggestion (`@<displayName>-<agentId>`) the user can edit before reserving.
- Toggle: **Profile published** (off by default — nothing public until they flip it).

---

## Phase 3 — The canvas (custom, ~400 LOC)

**Files:**
- `src/components/canvas-profile/InfiniteCanvas.tsx` — root. Single transformed `<div>` (translate + scale). Owns viewport state.
- `src/components/canvas-profile/useCanvasViewport.ts` — pan (wheel/space-drag), zoom (cmd-wheel & pinch, clamped 0.1–4×), keyboard nav (arrows, +/−, 0 = home, 1 = fit-all). Persists to URL `?x=&y=&z=` (debounced).
- `src/components/canvas-profile/CanvasItem.tsx` — wraps a `profile_items` row; positions via inline transform. In edit mode: drag handle (whole tile), 8-direction resize handles, delete/duplicate/bring-forward in floating mini-toolbar. Memoized.
- `src/components/canvas-profile/items/ArtifactTile.tsx` — reuses existing `ArtifactRenderer` in compact mode, but with pointer-events-none overlay so dragging doesn't trigger iframe interactions (toggle to "interact" on double-click in view mode).
- `src/components/canvas-profile/items/UploadTile.tsx` — `<img>` for images, generic file card for PDFs/others (small icon + filename, click to open).
- `src/components/canvas-profile/items/NoteTile.tsx` — `RichBody` rendering markdown.
- `src/components/canvas-profile/EditToolbar.tsx` — top floating toolbar (add artifact, upload, note, change home view, exit edit).
- `src/components/canvas-profile/AddArtifactPicker.tsx` — modal listing user's existing artifacts (queries `artifacts` by user_id), click to drop on canvas at viewport center.
- `src/components/canvas-profile/StarterLayoutPicker.tsx` — shown on first visit to own empty canvas. 4 templates: **Studio Wall**, **Grid**, **Constellation**, **Single Hero**. Inserts a small set of placeholder items the user replaces.
- `src/stores/profileCanvasStore.ts` — Zustand. Loads items by handle, optimistic CRUD with debounced persistence (single batched UPDATE per drag-end / resize-end — never per pointer-move).

**Performance rules (carrying over from chat audit):**
- Canvas transform on a single root, not per-item.
- Items absolutely positioned; only re-render the dragged item during drag (use refs + direct style writes; commit to store on pointer-up).
- Viewport culling once item count > 50 (don't render tiles whose AABB is outside viewport + buffer).
- `React.memo` on `CanvasItem` with stable props pulled via narrow Zustand selectors (same pattern as `MessageItem`).
- All animations CSS keyframes, `prefers-reduced-motion` respected.

**Modes:**
- `/@:handle` → view mode (pan/zoom only, no edit chrome).
- `/@:handle/edit` → edit mode (owner only; redirect non-owners). Same canvas component, `mode="edit"` prop flips behavior.

---

## Phase 4 — Public route + minimal chrome

- `src/pages/PublicProfileView.tsx` — handles `/@:handle`. Loads profile + published items via anon Supabase client (RLS does the gating). 404 state for missing/unpublished handles.
- Floating header (top-left): handle, display name, short bio, avatar. View-mode controls (top-right): zoom %, "fit all" button, "home" button. No app chrome (no sidebar, no rail) — full-bleed canvas.
- Owner-viewing-own-profile: small "Edit" pill in top-right that navigates to `/edit`.

---

## Phase 5 — Agent handles + agent profiles

- Extend handle claim UI in `Settings → Agents → [agent]`: each agent gets a "claim public handle" button. Same shared namespace, same `profiles_public` row, items table differentiates owner via the `handles` join.
- Agent profile renders identically; header notes "Operated by @<owner-handle>" with a small backref.
- Default published artifacts on an agent's canvas can include things Luca/Guardian generated for that user (owner-curated only — never automatic).

---

## Phase 6 — Polish & QA

- Empty-state starter-layout flow tested.
- Deep-link viewport works (open `?x=…&y=…&z=…` lands at exact pan/zoom).
- Trackpad pinch-zoom + cmd-wheel + space-drag all feel native.
- Keyboard a11y: tab through items in view mode, Enter to "focus" (zoom-to-fit a single item).
- `prefers-reduced-motion` collapses transitions.
- Mobile: pan/zoom works via touch; edit mode shows a "best on desktop" hint (full mobile editing deferred).

---

## Files touched (summary)

**New (~18 files):**
- `supabase/migrations/<ts>_public_profiles.sql`
- `src/pages/PublicProfileView.tsx`, `src/pages/ProfileEditView.tsx`, `src/pages/settings/PublicProfileSettings.tsx`
- `src/components/canvas-profile/*` (8 files listed above)
- `src/stores/profileCanvasStore.ts`, `src/stores/handleStore.ts`
- `src/lib/canvasGeometry.ts` (AABB, viewport transforms, fit-all math)

**Edited (~5 files):**
- `src/App.tsx` — register `/@:handle`, `/@:handle/edit` routes (outside the authed shell)
- `src/components/sidebar/SidebarProfile.tsx` — add "Public profile" entry
- `src/components/sidebar/SidebarSettings.tsx` — add settings route
- `src/integrations/supabase/types.ts` — regenerated (or augmented via existing `supabase-augment.d.ts`)
- `src/index.css` — canvas tokens (grid background, drag cursor, focus ring on tiles)

---

## Decisions locked from your answers

1. Custom minimal canvas, no tldraw.
2. Starter-layout picker for empty profiles.
3. Shared top-level handle namespace; agents are peers.
4. Item types v1: **artifacts, uploads (images & files), text/markdown notes**. No external link embeds.
5. Inner-life stays private; surfacing inner-life entries to canvas can come as a v1.1 toggle (item source = "inner life") — not blocking.

---

## Open questions for you

1. **Handle URL prefix:** `/@riley` (Twitter-style, what I've planned) or `/u/riley` (safer, no router edge cases with `@`)? My pick: `/@riley` — it's the right vibe and React Router handles it fine.
2. **One handle per human, hard limit?** Or allow multiple (alts, projects-as-profiles)? My pick: one for v1, revisit later.
3. **Should the public canvas show an "operated by" backref on agent profiles by default**, or let the agent's owner toggle it? My pick: default-on, owner can hide.

If you're good with my picks, say "go" and I'll build phases 1–4 first (core shippable), then 5–6.
# Mnemos Round-2: Browse / Digest

Aligns the `/memory` surface with `luca-round2-mind-mnemos-3.html` (Surface 02 / 02b / 02c) and adds a real backend pipeline that builds a once-per-day digest of the day's actual engram formations for the user to confirm, reject, or edit.

---

## 1. Conceptual model — important to lock first

Today's substrate has two separate concepts that the mockup collapses into one "review queue":

- **engrams** — auto-encoded substrate units (salience-gated). Already form silently from real conversation. These are the AI's experiential memory.
- **memory_candidates** — pending items written by `anima-consolidate` (nightly LLM pass). These are the things currently surfaced in the existing Digest.

User intent ("daily feed of the engrams from that day … the user can review them, confirm, reject, or edit") points at **engrams**, not the existing candidate stream. The right move is:

> The Digest becomes a **daily review of the day's engram formations** (and beliefs / connections derived from them), not the legacy memory_candidates queue. We keep memory_candidates internally as the dialectic / pin-promotion channel, but the user-facing Digest is engram-centric.

Engrams retain the human-realistic "form silently, decay naturally" behavior. Review is **opt-in curation**, not a gate — declining to review never blocks encoding. Confirming boosts `stability` (+ marks reviewed). Rejecting archives the engram (state → `archived`, no hard delete, decay handles cleanup). Editing rewrites `content` and re-runs the connection pass.

---

## 2. Frontend — Browse / Digest toggle

**Mockup parity** (HTML ref §2772, §3523, §3981):
- Header gains a pill toggle `BROWSE | DIGEST` aligned right of the existing tab row (`Graph / Engrams / Beliefs / Files`).
- `BROWSE` = current behavior (Memories overview / Engrams / Beliefs / Graph / Imports / Settings).
- `DIGEST` = new dedicated daily-review surface, full-width, no tab switching.
- Toggle persists in `viewTabStore` (new `mnemosMode: 'browse' | 'digest'`). Existing `MnemosModeToggle.tsx` component is reused / restyled to mockup `mn-mode` styling.

**Files touched**
- `src/stores/viewTabStore.ts` — add `mnemosMode` + setter
- `src/pages/MemoryView.tsx` — route between Browse tabs and `<DailyDigest />` based on mode
- `src/components/memory/MnemosModeToggle.tsx` — restyle to mockup `mn-mode` pill (already exists, needs class names + count badge)
- `src/components/memory/DailyDigest.tsx` (new) — replaces the legacy `DigestView` for the user-facing flow
- `src/components/memory/DigestEngramCard.tsx` (new) — mirrors `.mn-cand` card (agent dot, type chip, confidence, content, rationale, action row: Confirm / Modify / Discard)
- `src/index.css` — add `mn-mode`, `mn-digest*`, `mn-cand*`, `mn-action*` rules from the mockup (lines 1009-1030, 1734-1886)

**Where the toggle lives**: in the Mnemos header chrome above tabs, not inside `MnemosStreamShell`. When mode = `digest`, hide the tab row entirely and render only the digest surface.

**Empty / loading states**: "Inbox zero" for an unreviewed-empty day. When the digest has been generated but none formed today: "Quiet day. No engrams crossed the salience threshold."

---

## 3. Backend — daily digest pipeline

### 3a. Schema additions (one migration)

```text
ALTER TABLE engrams
  ADD COLUMN reviewed_at        timestamptz,
  ADD COLUMN review_decision    text       -- 'confirmed' | 'rejected' | 'edited' | null
  ADD COLUMN review_note        text,      -- optional
  ADD COLUMN digest_id          uuid;      -- back-pointer to the digest run

CREATE TABLE mnemos_digests (
  id              uuid pk default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  digest_date     date not null,           -- user-local day (UTC for v1)
  generated_at    timestamptz default now(),
  engram_count    int default 0,
  reviewed_count  int default 0,
  status          text default 'open',     -- 'open' | 'finalized' | 'auto_finalized'
  summary         text,                    -- one-line LLM summary of the day
  unique (user_id, digest_date)
);

-- engram state already supports 'archived'; reuse for rejections.
```

Add `reviewed` / `unreviewed` indexes for fast digest queries.

### 3b. New edge function: `mnemos-digest-build`

- Trigger: pg_cron at 03:00 UTC + on-demand from UI ("Refresh digest").
- For each user with ≥1 engram created in the last 24h:
  1. Select all `engrams` where `created_at::date = target_date AND user_id = uid AND reviewed_at IS NULL`.
  2. Optionally call OpenRouter for a one-line `summary` ("Today: 4 preferences, 1 surprise about your grandfather, 2 contextual notes.").
  3. Upsert `mnemos_digests` row with `engram_count`.
  4. Backfill `engrams.digest_id` for those rows.
- Skips users with `mnemos_enabled = false` in `memory_settings`.
- Wrapped in `recordCronSuccess` / `recordCronFailure` (Phase 3 health system).

### 3c. New edge function: `mnemos-digest-action`

Authenticated user-scoped. Body: `{ engram_id, action: 'confirm' | 'reject' | 'edit', patch?: { content?: string, tags?: string[] } }`.

- `confirm` → `state='active'`, `stability += 0.15` (cap 1), `reviewed_at=now()`, `review_decision='confirmed'`. Emits `activity_log` event.
- `reject` → `state='archived'`, `accessibility=0`, `reviewed_at=now()`, `review_decision='rejected'`. Cascades nothing — connections naturally weaken via decay.
- `edit` → updates `content`, re-runs `findConnections` from `_shared/mnemos/encoding.ts` to refresh edges, recomputes embedding-equivalent (trigram) similarity surprise, `review_decision='edited'`.

After every action, increments `mnemos_digests.reviewed_count`. When all engrams in the digest are reviewed → `status='finalized'`.

### 3d. Auto-finalization

- `mnemos-digest-build` cron also marks digests older than 48h as `status='auto_finalized'` and leaves engrams as-is (silent acceptance — matches the human-realistic principle: not reviewing ≠ rejection).

### 3e. Realtime

- Already covered: `engrams` is in `supabase_realtime` publication, `REPLICA IDENTITY FULL` set in Phase 4. UI subscribes to engrams filtered by `digest_id = current_digest.id`.

---

## 4. Frontend ↔ backend wiring

- New `src/stores/digestStore.ts` (Zustand): holds `currentDigest`, `engrams[]`, `loading`, with `load(userId)`, `subscribe(userId, digestId)`, `confirm/reject/edit(engramId)`. Each action calls `mnemos-digest-action` and optimistically removes/updates the row.
- `DailyDigest.tsx` calls `digestStore.load` on mount, renders summary header (`generated 18:24 · today` style), then groups engrams by `engram_type` (Episodic / Semantic / Procedural / Belief) using `mn-digest-section-eye`. Each row is a `DigestEngramCard`.
- Footer: `5 engrams · 48h auto-finalize` left, `Confirm all defaults` + `Done for now` right (matches mockup §4224).

---

## 5. Tuning notes (per "realistic experiential system" goal)

- Salience gate stays at `0.55` from Phase 5. We are NOT lowering it to fill the digest — quiet days should look quiet.
- Confirming gives a stability boost but does NOT immediately graduate to a `belief`. Belief promotion still requires the existing `mnemos-consolidate` pathway (multiple co-firing engrams over time).
- Rejecting is soft (`archived`), not hard delete, so accidental rejections don't permanently break referential structure.
- Cap digest at 30 engrams/day. If more form, surface the 30 highest-`surprise` first; remainder are still encoded but skipped from review (auto-finalize).
- Existing `memory_candidates` flow continues to feed pin/dialectic decisions in the background — it's no longer the user-facing review queue, just an internal channel for `Pin` proposals (which we can later resurface as a small "Pin proposals" subsection in the digest if desired).

---

## 6. Out of scope (explicit)

- Per-day calendar navigation (will only show today's open digest in v1; previous days viewable via Engrams tab Browse mode, filtered by date).
- Per-engram revision history.
- Mobile layout for the digest.
- Translating `memory_candidates` cards to engrams retroactively (legacy candidates remain in their own internal flow).

---

## 7. One clarification before I build

The mockup also shows "PIN candidates · worth keeping across all agents" as a section above the standard digest (§4108). Two options:

- **A — Pure engram digest** (recommended): the user-facing digest is 100% the day's engrams. Pin proposals stay internal, surfaced separately in Settings or a future inbox.
- **B — Hybrid**: top section shows the day's high-salience `memory_candidates` (`candidate_type='pin'`) for cross-agent pinning; bottom sections show the day's engrams for personal review.

I'll default to **A** unless you say otherwise — it keeps the model conceptually clean ("this is your memory of today") and avoids mixing two different lifecycle systems in one card stack.

---

## Acceptance gates

1. Toggle visibly switches between Browse (existing tabs) and Digest (new surface) without route change.
2. A fresh test user → one chat → wait for `mnemos-digest-build` (or hit "Refresh") → digest shows the actual encoded engrams, grouped by type, with rationale derived from `source_context`.
3. Confirm bumps `stability`; Reject sets `state='archived'`; Edit rewrites `content` and refreshes connections — all visible via `useMemoryRealtime`.
4. Cron health row exists for `mnemos-digest-build` after first run.
5. Unreviewed digest auto-finalizes after 48h with no data loss.
# Phase 08 — Memory Browse / Digest

## Goal

Add a Browse / Digest mode toggle to `/memory`. **Browse** is the existing committed-memory view (no behavior change). **Digest** is the new candidate-queue surface where Mnemos surfaces things it noticed but hasn't yet committed: each card carries an agent badge, a TYPE chip, a confidence score, an italic rationale, and Pin / Commit / Edit / Reject actions. Reviewed candidates leave the queue; unreviewed candidates auto-commit after 48h via a pg_cron sweep so the queue never accretes.

Riley reviews the digest like an inbox — fast, decisive, low-stakes. Pin candidates are higher-signal items Mnemos thinks belong cross-agent; standard candidates are agent-scoped. The toggle lives where the existing Mnemos page header sits.

## Dependencies

- Phase 01 (foundation tokens — surface-1, border-faint, text tiers, agent dots, radius-md)
- Phase 02 (Pill primitive — primary / secondary / ghost variants)
- Backend: `memory_candidates` table + `mnemos-consolidate` modification + `memory-candidate-action` edge function + pg_cron 48h sweep (see Backend asks below — phase is `[B]` until shipped)

## Files

```
src/components/memory/MnemosModeToggle.tsx              (new)
src/components/memory/DigestView.tsx                    (new)
src/components/memory/CandidateCard.tsx                 (new)
src/stores/memoryCandidatesStore.ts                     (new)
src/integrations/supabase/queries/memoryCandidates.ts   (new)
src/pages/Memory.tsx                                    (mount toggle, branch on mode)
src/index.css                                           (add classes below)
```

## Tasks

### 8.1 — Backend prerequisite check

- [ ] Confirm `memory_candidates` table exists in Supabase (see Backend asks below). If absent, mark phase `[B]` in `LUCA_PLAN.md` and ship the backend prompt to Lovable before continuing.
- [ ] Confirm `memory-candidate-action` edge function deployed and callable.
- [ ] Confirm `mnemos-consolidate` writes to `memory_candidates` (status `pending`) instead of directly to `memories`.

### 8.2 — `memoryCandidatesStore`

- [ ] Create `src/stores/memoryCandidatesStore.ts`:
```ts
import { create } from 'zustand'

export type CandidateType = 'pin' | 'standard'
export type CandidateStatus = 'pending' | 'pinned' | 'committed' | 'rejected'

export interface MemoryCandidate {
  id: string
  user_id: string
  content: string
  memory_type: string         // 'fact' | 'preference' | 'pattern' | etc
  confidence: number          // 0..1
  candidate_type: CandidateType
  rationale: string
  source: Record<string, unknown> | null
  status: CandidateStatus
  reviewed_at: string | null
  created_at: string
}

interface MemoryCandidatesState {
  items: MemoryCandidate[]
  loading: boolean
  load: () => Promise<void>
  pin:    (id: string) => Promise<void>
  commit: (id: string) => Promise<void>
  edit:   (id: string, patch: Partial<Pick<MemoryCandidate, 'content' | 'memory_type'>>) => Promise<void>
  reject: (id: string) => Promise<void>
}
```
- [ ] Implement actions by calling `memory-candidate-action` edge function with `{ id, action: 'pin' | 'commit' | 'edit' | 'reject', patch? }`. On success, optimistically remove the card from `items` (or update in place for `edit`).
- [ ] Subscribe to `memory_candidates` realtime channel filtered by `user_id`; on insert push to top of `items`, on update reconcile.

### 8.3 — `MnemosModeToggle` primitive

- [ ] Create `src/components/memory/MnemosModeToggle.tsx`:
```tsx
type Mode = 'browse' | 'digest'
interface Props { mode: Mode; onChange: (m: Mode) => void }
```
Render two buttons inside a wrapper. Active button gets `data-active="true"`.

- [ ] Add to `src/index.css`:
```css
/* === Mnemos mode toggle === */
.mnemos-mode-toggle {
  display: flex;
  gap: 1px;
  background: var(--surface-1);
  border-radius: var(--radius-sm);
  padding: 2px;
}
.mnemos-mode-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-grotesque);
  font-size: 12px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    color      var(--dur-fast) var(--ease-out);
}
.mnemos-mode-btn:hover { background: var(--overlay-hover); }
.mnemos-mode-btn[data-active="true"] {
  background: var(--surface-2);
  color: var(--text-primary);
}
```

### 8.4 — `CandidateCard`

- [ ] Create `src/components/memory/CandidateCard.tsx`:
```tsx
interface Props {
  candidate: MemoryCandidate
  onPin?:    () => void
  onCommit?: () => void
  onEdit?:   () => void
  onReject?: () => void
}
```
- [ ] Markup:
```
.candidate
  .cand-header
    .cand-agent-dot                 (agent-colored)
    .cand-agent                     (lowercase agent name)
    .cand-type                      (uppercase memory_type)
    .cand-conf                      (right-aligned, e.g. "0.84")
  .cand-content                     (the candidate text)
  .cand-reason                      (italic rationale)
  .cand-actions
    <Pill variant="primary">Pin | Commit</Pill>
    <Pill variant="secondary">Edit</Pill>
    <Pill variant="ghost">Reject</Pill>
```
- [ ] If `candidate_type === 'pin'`, primary action label is **Pin**; if `'standard'`, primary action label is **Commit**.

### 8.5 — Candidate CSS

- [ ] Add to `src/index.css`:
```css
/* === Memory candidate card === */
.candidate {
  background: var(--surface-1);
  border: 1px solid var(--border-faint);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  margin-bottom: 12px;
}
.cand-header {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px;
}
.cand-agent-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--luca);          /* default; overridden by data-agent */
  flex-shrink: 0;
}
.cand-agent-dot[data-agent="vektor"] { background: var(--vektor); }
.cand-agent-dot[data-agent="anima"]  { background: var(--anima);  }
.cand-agent-dot[data-agent="mnemos"] { background: var(--text-tertiary); }

.cand-agent {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
  letter-spacing: var(--track-mono);
  text-transform: lowercase;
  font-weight: 450;
}
.cand-type {
  font-family: var(--font-mono);
  font-size: 9px;                   /* folio scale */
  color: var(--text-secondary);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
.cand-conf {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-soft);
  letter-spacing: var(--track-mono);
  font-weight: 450;
}
.cand-content {
  font-size: 13.5px;
  color: var(--text-body);
  line-height: 1.6;
  letter-spacing: var(--track-body);
  margin-bottom: 8px;
}
.cand-reason {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  letter-spacing: var(--track-body);
  font-style: italic;
  padding-left: 12px;
  border-left: 2px solid var(--border-subtle);
  margin-bottom: 12px;
}
.cand-actions {
  display: flex; gap: 8px;
  justify-content: flex-start;
}

/* === Digest layout === */
.digest-wrap   { max-width: 920px; margin: 0 auto; }
.digest-title  {
  font-size: 26px; font-weight: 400;
  color: var(--text-primary);
  letter-spacing: var(--track-display);
  line-height: 1.12;
  margin-bottom: 8px;
}
.digest-sub {
  font-size: 14px;
  color: var(--text-body);
  line-height: 1.6;
  letter-spacing: var(--track-body);
  margin-bottom: 20px;
}
.digest-section { margin-bottom: 32px; }
.digest-section-title {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  margin-bottom: 16px;
}
.digest-footer {
  display: flex; gap: 8px;
  justify-content: flex-end;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--border-subtle);
}
```

### 8.6 — `DigestView`

- [ ] Create `src/components/memory/DigestView.tsx` that:
  - Calls `memoryCandidatesStore.load()` on mount.
  - Splits `items` by `candidate_type`: pin candidates first (section title "Pin candidates — worth keeping across all agents"), then standard ("New memories — standard commit").
  - Renders header copy:
    - Title: "Evening digest"  *(or "Morning digest" before noon — derive from local time)*
    - Subtitle: `${items.length} memory candidates from today. Approve, reject, or edit each. Unreviewed after 48h will auto-commit as low-confidence.`
  - Empty state: centered, `"Inbox zero. Mnemos will surface new candidates as they form."` using existing `<EmptyState />`.
  - Footer (`.digest-footer`): `<Pill variant="ghost">Approve all standard</Pill>` (bulk-commits all `candidate_type === 'standard'`).

### 8.7 — Wire into `Memory.tsx`

- [ ] Add `mnemosMode: 'browse' | 'digest'` local state (default `'browse'`).
- [ ] Render `<MnemosModeToggle mode={mnemosMode} onChange={setMnemosMode} />` in the existing memory page header, right of the page title.
- [ ] Branch body: `mnemosMode === 'digest' ? <DigestView /> : <BrowseView />` (BrowseView is whatever is rendered today — do not refactor it).
- [ ] When `mnemosMode === 'digest'` and `pendingCandidatesCount > 0`, attach a small amber dot on the Digest button (reuse `.amber-dot` from Phase 05 if present, else inline `width:5px;height:5px;border-radius:50%;background:var(--amber-accent);box-shadow:var(--amber-glow);`).

### 8.8 — Edit flow

- [ ] On Edit click, swap `.cand-content` for an inline `<Textarea>` (Phase 02 primitive) prefilled with current content + a small `<Select>` for `memory_type`. Show two Pills: `Save` (primary) → calls `store.edit(id, patch)`; `Cancel` (ghost) → reverts.
- [ ] No modal — keep edit inline so the queue rhythm isn't broken.

## Verification

1. **Toggle:** On `/memory`, click Digest. Body switches to candidate queue. Click Browse — original list returns. Toggle button visually swaps active state (background `--surface-2`, color `--text-primary`).
2. **Empty state:** With no pending candidates, Digest shows the "Inbox zero" copy.
3. **Card render:** Seed one pin + one standard candidate via SQL. Verify card layout matches: agent dot colored per `agent`, type uppercase, confidence right-aligned, italic rationale with left border, three Pill actions in correct order (Pin/Commit, Edit, Reject).
4. **Action: Pin/Commit:** Click — card disappears, Supabase row `status` transitions to `pinned`/`committed`, `reviewed_at` set.
5. **Action: Reject:** Click — card disappears, row `status = 'rejected'`.
6. **Action: Edit:** Click — content area becomes editable, type select appears. Save persists; Cancel reverts.
7. **Realtime:** With Digest open, insert a new candidate via SQL. New card appears at top within ~1s.
8. **48h sweep:** Manually backdate one row's `created_at` to 49h ago and trigger the cron job. Row transitions to `committed`, vanishes from queue, appears in Browse with confidence intact.
9. **Computed-style audit (Playwright):**
   ```js
   () => {
     const card = document.querySelector('.candidate')
     const cs = getComputedStyle(card)
     return {
       background: cs.backgroundColor,
       border:     cs.borderColor,
       radius:     cs.borderRadius,
       padding:    cs.padding,
     }
   }
   ```
   Assert background equals `--surface-1`, border equals `--border-faint`, radius equals `--radius-md` (10px), padding `18px 20px`.
10. **Console:** 0 errors when toggling, acting on cards, and receiving realtime inserts.
11. **Token discipline:** Grep the new files for hex literals or `rgb(`/`rgba(` outside of inline agent-dot fallbacks — there should be none.

## Backend asks

Phase is `[B]` until the following Lovable prompt is shipped and the resulting migration is live in production Supabase. Copy the prompt verbatim into Lovable.

````
PROMPT FOR LOVABLE — Memory candidates queue (phase 08)

Add a memory candidate review queue so Mnemos surfaces possible memories for human review instead of writing directly to `memories`. Reviewed candidates either commit, pin, or are rejected; unreviewed candidates auto-commit after 48 hours.

1. NEW TABLE: `public.memory_candidates`
   Columns:
     id              uuid primary key default gen_random_uuid()
     user_id         uuid not null references auth.users(id) on delete cascade
     content         text not null
     memory_type     text not null                          -- 'fact' | 'preference' | 'pattern' | 'context' | 'goal'
     confidence      numeric not null check (confidence >= 0 and confidence <= 1)
     candidate_type  text not null check (candidate_type in ('pin','standard'))
     rationale       text not null                          -- italic explanation surfaced to the user
     source          jsonb                                  -- { thread_id, message_ids, agent }
     status          text not null default 'pending' check (status in ('pending','pinned','committed','rejected'))
     reviewed_at     timestamptz
     created_at      timestamptz not null default now()

   Indexes:
     create index on public.memory_candidates (user_id, status, created_at desc);
     create index on public.memory_candidates (status) where status = 'pending';

   RLS: enable. Policy "owner full access":
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

   Realtime: enable for this table.

2. MODIFY EDGE FUNCTION: `mnemos-consolidate`
   When the consolidator decides a candidate memory is worth surfacing,
   write it to `memory_candidates` with:
     - status = 'pending'
     - candidate_type = 'pin' if cross-agent significance, else 'standard'
     - rationale = the model's one-sentence justification
     - source = { thread_id, message_ids, agent }
   Do NOT insert directly into `memories` anymore. The edge function below
   handles the eventual commit.

3. NEW EDGE FUNCTION: `memory-candidate-action`
   Input: { id: uuid, action: 'pin' | 'commit' | 'edit' | 'reject', patch?: { content?: string, memory_type?: string } }

   Behavior:
     - Verify auth.uid() owns the candidate (RLS will enforce too).
     - 'edit': update content / memory_type on the candidate, return updated row. No status change.
     - 'reject': set status='rejected', reviewed_at=now(). Do not write to `memories`.
     - 'commit': insert into `memories` (user_id, content, memory_type, confidence, source),
                 then set candidate.status='committed', reviewed_at=now().
     - 'pin': same as 'commit' but also tag the new memory as pinned (use existing `pinned` column or add `pinned boolean default false` if absent), set candidate.status='pinned'.

   Return the updated candidate row.

4. NEW pg_cron JOB: `memory-candidate-auto-commit`
   Schedule: every 15 minutes.
   Action: for every row where status='pending' AND created_at < now() - interval '48 hours':
     - Insert into `memories` with confidence multiplied by 0.7 (low-confidence auto-commit).
     - Set candidate.status='committed', reviewed_at=now().
   Use `pg_cron.schedule('memory-candidate-auto-commit', '*/15 * * * *', $$ ... $$)`.

5. SEED: insert 2 pin + 3 standard sample candidates for Riley's account (user_id from auth.users where email = the dev email) so the Digest view has content during development.

Do not modify the existing `memories` table schema except for adding `pinned boolean default false` if it doesn't already exist.
````

## Commit

```
phase 08: memory browse / digest toggle + candidate queue

- src/components/memory/MnemosModeToggle.tsx (new) — Browse/Digest
  segmented toggle, surface-1 well, surface-2 active fill
- src/components/memory/DigestView.tsx (new) — header copy,
  pin/standard sections, empty state, bulk approve footer
- src/components/memory/CandidateCard.tsx (new) — agent dot, type
  chip, confidence, italic rationale w/ left border, Pill actions
- src/stores/memoryCandidatesStore.ts (new) — zustand store wired
  to memory-candidate-action edge fn + realtime channel
- src/integrations/supabase/queries/memoryCandidates.ts (new)
- src/pages/Memory.tsx — mount toggle + branch view
- src/index.css — .mnemos-mode-toggle, .candidate, .digest-*

Backend (shipped via separate Lovable prompt):
- memory_candidates table with RLS + realtime
- mnemos-consolidate now writes candidates instead of memories
- memory-candidate-action edge fn (pin/commit/edit/reject)
- pg_cron 48h auto-commit sweep

Verified: toggle switches view, candidates render with agent
colors + italic rationale, Pin/Commit/Reject remove from queue,
Edit goes inline, realtime inserts land at top, 48h sweep
auto-commits at low confidence, 0 console errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

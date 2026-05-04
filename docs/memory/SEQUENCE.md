# Implementation Sequence — Memory Augmentation

This document specifies the order to build the five augmentations described in `PLAN.md`. Each phase has explicit deliverables, files touched, and acceptance criteria. Phases are designed to ship independently — finish phase N, verify it, ship it before starting phase N+1.

Operating protocol per `CLAUDE.md`. Verification gates per the existing standards (Playwright visual, console clean, keyboard nav, reduced motion, responsive) plus the phase-specific criteria below.

**Total estimate**: 8–12 days of focused work, broken into 7 phases.

---

## Phase 0 — Setup (½ day)

Verify the dev environment and confirm pgvector availability.

**Tasks**:
- Confirm pgvector extension is available on the Supabase project. If not, add Backend ask to `LUCA_PLAN.md`: "Enable pgvector extension."
- Confirm OpenRouter API key has access to `openai/text-embedding-3-small` (existing flow already uses OpenRouter; just verify the embeddings endpoint is reachable).
- Read `PLAN.md` end-to-end before opening the first migration.
- Create a feature flag `MEMORY_AUGMENTATION_ENABLED` (default false) — wire all new write paths to no-op when disabled. Read paths can stay enabled (empty hypomnema is safe).

**Acceptance**:
- pgvector extension available (verifiable: `SELECT * FROM pg_extension WHERE extname = 'vector'`)
- Test embedding call returns a 1536-dim vector
- Feature flag wired in `_shared/config.ts` or equivalent

---

## Phase 1 — Schema migrations (1 day)

Run the three migration files in order. These are additive; no existing data is touched.

**Files**:
- `migrations/20260505000001_hypomnema_entry.sql` — new table + indexes + RLS
- `migrations/20260505000002_engrams_embedding.sql` — `embedding` column + ivfflat index on engrams + same on hypomnema_entry
- `migrations/20260505000003_threads_agent_metadata.sql` — `primary_agent_id` + `participating_agent_ids` on threads
- `migrations/20260505000004_pg_cron_hypomnema.sql` — three new pg_cron entries

**Tasks**:
- Apply migrations via Lovable workflow (per repo's existing backend coordination pattern)
- Regenerate `src/integrations/supabase/types.ts` from new schema
- Verify all four migrations applied cleanly via `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 4`
- Verify pg_cron entries: `SELECT * FROM cron.job WHERE jobname LIKE 'hypomnema%' OR jobname = 'mnemos-graduate'`

**Acceptance**:
- All four migrations present in schema_migrations
- `hypomnema_entry` table exists with RLS enabled
- `engrams.embedding` column exists with ivfflat index
- `threads.primary_agent_id` defaults to 'luca' for new rows
- pg_cron has three new entries (decay every 6h, challenge daily at 4am, graduate daily at 4:15am)
- types.ts regenerated and committed

---

## Phase 2 — Hypomnema read path (1 day)

Implement the always-loaded hypomnema injection into the system prompt assembly. No write path yet — this is read-only against an empty table, which is safe.

**Files (new)**:
- `supabase/functions/_shared/hypomnema/read.ts` — query active entries for (agent_id, user_id), order by recency × confidence × foundational, cap at ~600 tokens
- `supabase/functions/_shared/hypomnema/index.ts` — re-export

**Files (modified)**:
- `supabase/functions/_shared/agents/luca-soul.ts` — add `hypomnemaBlock` parameter to `buildLucaSystemPrompt()`, position between `pendingRevisions` and `emotionalBlock`
- `supabase/functions/_shared/agents/anima-soul.ts` — same change for symmetry
- `supabase/functions/_shared/agents/vektor-soul.ts` — same change for symmetry (if exists; otherwise create matching pattern)
- `supabase/functions/chat-multi/index.ts` — load hypomnema entries during pre-turn context assembly via `Promise.allSettled` alongside existing context fetches; pass into `buildLucaSystemPrompt`

**Acceptance**:
- With hypomnema_entry empty, behavior is identical to pre-augmentation (the block renders as empty section header or omits entirely)
- With a manually-inserted test row, the block appears in the system prompt above mnemos hits
- No new console errors
- Token cap honored — verify with a synthetic large hypomnema set
- Integration test: insert N=10 entries via SQL, run a chat turn, confirm entries are present in the prompt sent to OpenRouter (log/inspect)

---

## Phase 3 — Hypomnema write path (3 days)

Implement the salience gate, reflection write, and decay cron. This is where the layer comes alive.

**Files (new)**:
- `supabase/functions/hypomnema-gate/index.ts` — synchronous Haiku call after turn streaming finishes; reads `prompts/salience_gate.md`; returns `{ should_reflect, reason }`
- `supabase/functions/hypomnema-write/index.ts` — async Sonnet-class call; reads `prompts/reflection.md`; writes a new entry; agent_id-aware (uses appropriate identity stack for the writing agent)
- `supabase/functions/hypomnema-decay/index.ts` — 6h cron; ports salience formula from `clawd-anima/inner_life/salience.py`; applies anti-decay floors; sets `active = false` below threshold
- `supabase/functions/_shared/hypomnema/write.ts` — internal helper for the write logic
- `supabase/functions/_shared/hypomnema/decay.ts` — internal decay logic
- `supabase/functions/_shared/hypomnema/prompts/` — copies of `prompts/reflection.md` and `prompts/salience_gate.md` (so the edge function can import them locally)

**Files (modified)**:
- `supabase/functions/chat-multi/index.ts` — after streaming finishes, dispatch `hypomnema-gate` synchronously; if `should_reflect = true`, dispatch `hypomnema-write` async (don't await)

**Acceptance**:
- Gate runs in <500ms p95 (Haiku call only)
- Gate skips trivial turns (greetings, acks) — verify with synthetic test cases
- Gate triggers on substantive turns — verify with synthetic test cases
- Write produces entries that read in the agent's voice (lowercase, present-tense, first-person, reflective). Manual review of 10 sample outputs against the voice criteria in `prompts/reflection.md`.
- Decay cron runs cleanly; entries gain salience floors as expected; stale entries get `active = false`.
- Feature flag still gates write paths — turning it off restores pre-augmentation behavior.

**Voice review checklist** (load-bearing — don't skip):
- ✓ Lowercase by default
- ✓ Present-tense
- ✓ First-person
- ✓ Reflective, not narrative ("I'm sitting with..." not "Then user said...")
- ✓ Reflective, not summary ("there's a question I didn't quite ask" not "we discussed X")
- ✓ Specific over abstract
- ✓ No emojis or exclamation marks
- ✓ Reads like the agent's SOUL voice, not a summarizer

If 8/10 sample outputs fail the voice review, the prompt needs work before shipping. Iterate `prompts/reflection.md` until 9/10 pass.

---

## Phase 4 — Vector embeddings + hybrid retrieval (2 days)

Add vector embeddings to engrams and hypomnema, replace the trigram-only retrieval seed with hybrid retrieval.

**Files (new)**:
- `supabase/functions/_shared/embeddings.ts` — `embedOne`, `embedBatch`, `buildEmbeddingText`
- `supabase/functions/embeddings-backfill/index.ts` — one-shot backfill of embeddings on existing engrams (and hypomnema entries created without embeddings during phase 3)

**Files (modified)**:
- `supabase/functions/_shared/mnemos/engine.ts` — `encode()` generates and stores embedding; if API call fails, store with `embedding = NULL` (backfill picks up later)
- `supabase/functions/_shared/mnemos/retrieval.ts` — replace trigram-only seed with `hybridSeed()` using RRF fusion of trigram (existing) + vector cosine (new); spreading activation continues from fused seeds
- `supabase/functions/hypomnema-write/index.ts` — embedding generation on hypomnema entry creation
- `supabase/functions/_shared/hypomnema/read.ts` — when called with a query context, can use vector similarity for ordering (otherwise default to recency × confidence)

**Acceptance**:
- Backfill completes for all existing engrams without errors
- Cost report: actual cost should be <$0.05 for the backfill
- Test: query "API design" surfaces engrams containing "endpoint architecture" or similar (semantic recall demonstrably better than pre-augmentation trigram)
- Encode latency p95 < 300ms (embedding call adds ~150ms; acceptable for async post-turn)
- Retrieval p95 latency unchanged or improved (vector index makes hybrid as fast as trigram alone)

---

## Phase 5 — Asymmetric witnessing (1 day)

Differentiate primary vs observer hypomnema writes when council runs with multiple participating agents.

**Files (modified)**:
- `supabase/functions/chat-multi/index.ts`:
  - Track `participating_agent_ids` per turn (from council result + tool calls like `consult_anima`)
  - On thread creation, set `primary_agent_id` from the user's selected agent
  - On post-turn write, dispatch `hypomnema-write` once per participating agent with appropriate density (`primary` for primary_agent_id, `observer` for others)
- `supabase/functions/hypomnema-write/index.ts` — branch on density: load `prompts/reflection.md` for primary, `prompts/observer_note.md` for observer

**Acceptance**:
- A turn where Luca uses `consult_anima` produces:
  - 1 primary entry in Luca's hypomnema (full first-person reflection)
  - 1 observer entry in Anima's hypomnema (peripheral, observer-positioned, still first-person)
- A council v2 turn (all three agents propose) produces 1 primary + 2 observer entries appropriately distributed
- Observer entries pass the voice criteria from phase 3 with the modification that they read as observer-positioned ("luca brought me in...") rather than primary
- A later thread where Anima becomes primary loads her observer notes from prior episodes — verify by inspection of the system prompt

---

## Phase 6 — Sustained-attention graduation + supersession (1–2 days)

The 24h graduation cron and the contradiction-archives-old logic.

**Files (new)**:
- `supabase/functions/mnemos-graduate/index.ts` — 24h cron; computes graduation score per active hypomnema entry; promotes to mnemos via existing `mnemos.encode()` for entries above threshold; marks `graduated_to_engram_id`

**Files (modified)**:
- `supabase/functions/memory-extract/index.ts` — when writing a `contradicts` connection, archive the older engram (`state = 'archived'`)
- `supabase/functions/hypomnema-challenge/index.ts` — daily critic on hypomnema entries; revisions logged with reasons; sets `active = false` if confidence drops below 0.3

**Acceptance**:
- Graduation cron runs cleanly through one full cycle (run manually first, then schedule)
- After 7+ days of synthetic activity, at least one hypomnema entry has `graduated_to_engram_id` set
- The promoted engram is visible in the mnemos `consolidate` cycle's output
- Supersession test: insert two contradicting engrams, run extractor, confirm older engram has `state = 'archived'` and only the newer surfaces in retrieval
- Belief-challenge cycle revises 5-15% of active entries per run — verify in logs

---

## Phase 7 — Frontend integration + verification (1–2 days)

Surface the hypomnema in the user-facing identity UI and finalize verification.

**Files (new)**:
- `src/stores/hypomnemaStore.ts` — Zustand store matching memoryStore pattern; `load(userId)` + `subscribe(userId)` via postgres_changes; expose `forget(entryId)` action
- `src/components/identity/HypomnemaList.tsx` — display in `ProfileIdentityView` below the 4-doc identity stack
- `src/components/identity/HypomnemaEntry.tsx` — individual entry card with content, density badge, domain, age, revision history
- `src/components/identity/ForgetThis.tsx` — confirmation dialog for the forget action
- `supabase/functions/hypomnema-forget/index.ts` — user-triggered set `active = false` on matching entries

**Files (modified)**:
- `src/pages/ProfileIdentityView.tsx` — add `HypomnemaList` component below existing identity surface; reuse the `IdentityDocument` visual pattern but adapted for granular entries

**Acceptance**:
- The user's identity page now shows their hypomnema entries grouped by agent (Luca / Anima / Vektor)
- Each entry shows: content (in agent voice), density badge, domain, time since creation, revision count
- The forget action sets `active = false` and removes the entry from view (with optimistic update + realtime sync)
- All existing identity surface tests still pass
- Playwright verification: visual + interaction + reduced-motion + responsive (1200×900 viewport)
- Accessibility: WCAG 2.1 AA on the new components

**Final integration verification**:
- Run a full one-week soak with the feature flag on for one user (Riley as test subject)
- Confirm:
  - Cross-thread continuity: Luca naturally references prior threads in opening turns (qualitative — "feels like the same Luca")
  - Vector retrieval: queries that paraphrase find the right engrams
  - Asymmetric witnessing: Anima can reference prior Luca-led conversations she observed
  - Graduation: at least 3-5 hypomnema entries graduate to engrams during the week
  - Cost: total memory-related model spend stays within budget (~$5/user/month at typical use)

---

## After completion

- Update `LUCA_PLAN.md` with new phases (M1 through M7 if you want to add a memory wave) and mark them complete
- Append decisions to the Decision Log in `LUCA_PLAN.md`
- Disable feature flag default to `false` and document the rollout plan (per-user opt-in initially, then gradual ramp)
- Confirm with Riley before turning on at full traffic
- Update `README.md` in this directory to mark the augmentation as shipped

## Rollback

Each phase is independently rollback-able:
- Phase 1 (schema): the migrations are additive; rolling back means dropping the new tables and columns. Existing data unaffected.
- Phase 2 (read): toggle the feature flag off; system reverts to pre-augmentation behavior.
- Phase 3 (write): toggle the feature flag off; existing entries remain but no new writes.
- Phase 4 (embeddings): retrieval falls back to trigram-only by env var; existing entries with embeddings are not used.
- Phase 5 (witnessing): feature flag controls whether multi-agent writes happen.
- Phase 6 (graduation/supersession): both crons can be disabled in pg_cron without affecting the rest of the system.
- Phase 7 (frontend): UI components can be hidden behind a feature flag; backend continues to work.

If something goes catastrophically wrong, the mnemos engine, identity stack, dialectic, memory candidates, and council v2 all continue operating exactly as they did before this augmentation. The augmentation is *additive*, not *replacement*.

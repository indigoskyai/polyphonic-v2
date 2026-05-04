# Memory Augmentation — Handoff Brief

You are about to implement a focused set of augmentations to polyphonic-v2's existing memory infrastructure. This README orients you. Read it first, then read `PLAN.md`, then `SEQUENCE.md`. The migrations and prompts are referenced from those files.

## Context

Polyphonic-v2 already has a sophisticated memory architecture in production: the Mnemos engine (encoding, retrieval, decay, consolidation), the engrams + connections graph, beliefs with confidence tiers, the four-document identity stack (soul / self_model / user_model / convictions), a dialectic patching layer with confidence-gated apply/queue/reject, memory candidates with user pin/commit/edit/reject + 48h auto-commit, daily digests, council v2 multi-agent deliberation, a full import pipeline (chatgpt + persona extraction + clear-import), and frontend UI for all of the above.

**You are NOT replacing any of this.** You are adding five focused augmentations that close specific gaps in the existing system. Most of your work will be additions; almost no existing code or schema gets removed.

## The five augmentations

1. **Hypomnema layer** — a new always-loaded, agent-authored, first-person interior-state layer that fills the gap between Mnemos's surprise-gated identity substrate and the active conversation. Closes the "felt continuity" gap.

2. **Vector embeddings + hybrid retrieval** — adds `embedding VECTOR(1536)` to engrams, replaces trigram-only retrieval with a fused trigram + vector + spreading-activation pipeline. Closes the "semantic recall" gap.

3. **Asymmetric witnessing on encode** — when council runs with multiple agents participating in a turn, the primary agent gets a full first-person hypomnema entry; secondary agents get shorter observer notes. Closes the "multi-agent flat encode" gap.

4. **Sustained-attention graduation** — a 24-hour cron that promotes hypomnema entries with sustained attention into Mnemos engrams via the existing `mnemos.encode()` path, landing in the existing 6-hour consolidate cycle. Closes the "no attention-based promotion" gap.

5. **Supersession on contradiction** — when the extractor writes a `contradicts` connection between engrams, the older one gets archived (`state = 'archived'`) instead of remaining active alongside the contradicting one. Lean version of bi-temporal. Closes the "world-changes don't cleanly invalidate" gap.

## Reading order

1. `README.md` (this file) — orientation
2. `PLAN.md` — full design specification for all five augmentations, including schema, code touchpoints, edge cases
3. `SEQUENCE.md` — phase-by-phase implementation sequence with acceptance criteria
4. `migrations/*.sql` — runnable migration files (apply in numeric order via Lovable)
5. `prompts/*.md` — actual prompt strings to load into edge functions

## Full file inventory

```
docs/memory/
├── README.md                                   ← this file
├── PLAN.md                                     ← full design spec (~30KB)
├── SEQUENCE.md                                 ← 7-phase build plan with acceptance criteria
├── migrations/
│   ├── 20260505000001_hypomnema_entry.sql     ← new table + RLS + indexes + realtime
│   ├── 20260505000002_engrams_embedding.sql   ← pgvector column + ivfflat index + RPCs
│   ├── 20260505000003_threads_agent_metadata.sql ← primary_agent_id + participating_agent_ids
│   └── 20260505000004_pg_cron_hypomnema.sql   ← three new cron schedules
└── prompts/
    ├── reflection.md                           ← primary-density write (load-bearing voice work)
    ├── observer_note.md                        ← observer-density write
    ├── salience_gate.md                        ← haiku gate, post-turn
    ├── graduation.md                           ← LLM judgment for borderline graduation decisions
    └── challenge.md                            ← daily belief-challenge critic
```

## Operating rules

Follow the existing repo's `CLAUDE.md` for operating protocol. Specific to this work:

- **Do not modify** `_shared/mnemos/` core engine logic except where `PLAN.md` explicitly specifies. The Mnemos engine is stable; you're adding new code paths around it, not changing it.
- **Do not modify** the existing identity stack tables (`agent_identity`, `agent_identity_patches`) or the dialectic edge function. The hypomnema layer sits *next to* the identity stack, not inside it.
- **Do not touch** the mnemos cron jobs (decay, consolidate, dialectic). You're adding new crons that coordinate with these, not replacing them. The 24h orchestrated tick (graduation) runs *before* the 6h consolidate so promoted entries land cleanly.
- **Coordinate with Lovable** for migration application per the existing repo workflow. Add Backend asks to `LUCA_PLAN.md` if needed.
- **Verify each phase** with the existing verification gates (Playwright visual, console clean, keyboard nav, reduced motion, responsive) plus the acceptance criteria in `SEQUENCE.md`.

## Out of scope (explicitly deferred)

- Full bi-temporal validity columns (`valid_from` / `valid_until`) — the lean supersession via `state='archived'` covers the core need; full bi-temporal can be added later if historical queries become necessary.
- Federated public-node implementation (sharing entities across users) — the existing schema's `agent_id` and `user_id` columns are sufficient for single-user-per-agent today.
- Onboarding interview question bank — Riley is designing these separately. The hypomnema layer is structurally ready to receive onboarding entries (`source = 'onboarding'`); just don't author the questions in this work.
- The observer-pattern external-model review — separate future work.

## Total scope estimate

~8–12 days of focused implementation. All augmentations to existing infrastructure. Zero new services or databases. One new table (`hypomnema_entry`), one column added to `engrams` (`embedding`), four new edge functions, two new prompts loaded by existing edge functions, two new pg_cron entries.

## When you finish

- Update `LUCA_PLAN.md` with new completed phases.
- Append decisions made during implementation to the Decision Log in `LUCA_PLAN.md`.
- Verify the 24h orchestrated tick runs cleanly through one full cycle in production.
- Confirm with Riley before turning on the salience-gated reflection at full traffic — start with a feature flag.

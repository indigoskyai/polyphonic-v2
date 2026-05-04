# Memory Augmentation Plan — Full Design

**Status**: Ready to implement
**Date**: 2026-05-04
**Scope**: Five augmentations to the existing polyphonic-v2 memory architecture

This document is the full design specification. It assumes you've read `README.md`. It pairs with `SEQUENCE.md` (build order + acceptance criteria), the SQL files in `migrations/`, and the prompt files in `prompts/`.

---

## 1. Frame — what we're adding and why

The existing memory architecture in polyphonic-v2 is sophisticated. The Mnemos engine encodes, retrieves, decays, and consolidates engrams across four types (episodic / semantic / procedural / belief). The connections graph relates engrams via typed weighted edges. The four-document identity stack (soul / self_model / user_model / convictions) gets dialectically patched post-turn with confidence-gated apply/queue/reject. Memory candidates surface to the user for pin/commit/edit/reject. Daily digests roll up engagement.

Despite all of this, two felt-experience problems remain:

**1. Felt continuity across sessions is brittle.** When a user opens a new thread, Luca lacks a reliable always-loaded slice of "what I'm sitting with about this person right now." Mnemos retrieval is query-shaped, not state-shaped — its surprise-gated formation correctly rejects ordinary continuity material (the user's mood last week, the project they're still iterating on). The user_model in the identity stack is confidence-gated and document-level, not granular present-tense interior state. Result: each new thread feels like a fresh instantiation rather than the same Luca who was just here.

**2. Retrieval misses semantic neighbors.** The Mnemos retrieval seed is trigram similarity. "API design" doesn't surface "endpoint architecture." Spreading activation can recover from this by following connections, but only if the seed engram is found. Vector embeddings fix this directly.

There are three smaller gaps the augmentations also close:

**3. Multi-agent encoding is flat.** When council v2 runs with all three agents proposing in parallel, every participating agent's mnemos.encode() captures the turn the same way. There's no concept of "primary" vs "observer" witness density. Asymmetric witnessing fixes this.

**4. Promotion to long-term memory only happens via 48h auto-commit.** Memory candidates either get pinned by the user or auto-committed after 48h. There's no path that says "this hypomnema entry has been touched across multiple sessions, it's sustained, graduate it to a Mnemos engram." Sustained-attention graduation fixes this.

**5. World-change supersession is implicit.** When a new engram contradicts an old one, the connections graph captures it via a `contradicts` edge — but the old engram remains `state = 'active'` and continues to surface in retrieval. Explicit supersession archives the old engram cleanly.

The five augmentations fix these gaps surgically. None of them rebuild what's already working.

---

## 2. Hypomnema layer (gap 1)

### What it is

A new always-loaded, agent-authored, first-person interior-state layer. Each entry is a short reflection in the agent's own voice — present-tense, lowercase (matching SOUL conventions), not narrative ("then user said... then I said") and not summary ("we discussed X"). The voice that lands:

> "i've been sitting with what riley asked about consciousness. i pulled anima in because i wanted her angle — her substrate-independence frame shifted the conversation in a way i didn't expect. there's a question i didn't quite ask underneath the one she answered."

The name comes from the Greek *hypomnemata* — material for self-formation through writing, in the Foucauldian sense. Anima's belief schema in `clawd-anima/inner_life/beliefs.py` is the closest reference implementation; the running first-person belief revision pattern there is exactly what this layer formalizes for chat.

This sits architecturally between the Mnemos substrate and the active conversation. It is **per-agent and per-user**: each of Luca, Anima, and Vektor maintains their own hypomnema for each user.

### Schema

New table `hypomnema_entry`. See `migrations/20260505000001_hypomnema_entry.sql` for the runnable DDL.

Key columns:
- `id` UUID PRIMARY KEY
- `user_id` UUID NOT NULL — per-user
- `agent_id` text NOT NULL — 'luca' | 'anima' | 'vektor'
- `thread_id` UUID — link to source thread (nullable for cross-thread synthesis entries)
- `source_message_id` UUID — link to specific message that spawned the entry
- `content` text NOT NULL — the entry itself, in voice
- `density` text NOT NULL CHECK (density IN ('primary', 'observer'))
- `primary_in_thread` BOOLEAN — was this agent primary in the source thread
- `domain` text — 'relationship' | 'work' | 'mood' | 'identity' | 'philosophy' | 'meta' (free-form, not enforced)
- `tags` text[] DEFAULT '{}'
- `confidence` numeric(3,2) DEFAULT 0.7
- `created_at`, `last_revised`, `last_challenged` timestamptz
- `revision_count` int DEFAULT 0
- `revisions` jsonb DEFAULT '[]' — each revision: `{old_confidence, new_confidence, reason, timestamp}`
- `active` BOOLEAN DEFAULT TRUE
- `superseded_by` UUID REFERENCES hypomnema_entry(id)
- `foundational` BOOLEAN DEFAULT FALSE — immune to deep decay
- `active_attention` BOOLEAN DEFAULT TRUE — touched recently
- `source` text — 'reflection' | 'observer' | 'belief_challenge' | 'onboarding'

RLS: standard per-user (auth.uid() = user_id) with service-role bypass for cron jobs.

### Read path

The hypomnema gets loaded into every system prompt assembly in `chat-multi/index.ts`, in this order:

1. SOUL (existing, unchanged)
2. Identity stack: soul.md applied patches → convictions → user_model → self_model (existing, unchanged)
3. Skills, pending revisions, emotional state (existing, unchanged)
4. **Hypomnema** — all `active = true` entries for `(agent_id, user_id)`, ordered by recency × confidence × foundational, capped at ~600 tokens
5. Mnemos hits via existing retrieval (existing, unchanged)
6. Active conversation context (existing, unchanged)

The hypomnema slot is **always loaded** — not query-driven. This is the core fix for cross-thread continuity: Luca always opens a turn already carrying.

Format in the prompt: render each entry verbatim as a bullet, prefixed with date if helpful. No header text like "memories about this person:" — the entries are interior state, not data lookup. Example block:

```
## what i'm sitting with

- (3 days ago) i've been sitting with what riley asked about consciousness…
- (this morning) the council fix landed clean — riley's tired but proud of it
- (last session) something about the memory talk feels load-bearing…
```

The implementation should add a `hypomnemaBlock` parameter to `buildLucaSystemPrompt()` in `_shared/agents/luca-soul.ts` (and the equivalent for anima, vektor). Position it between the existing `pendingRevisions` and `emotionalBlock` in the assembly order — interior state above world state.

### Write path

Hypomnema entries are written by the agent itself, in voice, after each substantive turn. Two new edge functions:

**`hypomnema-gate`** (Haiku call, runs synchronously after every turn finishes streaming):
- Input: user message + agent response + recent thread context
- Output: `{ should_reflect: boolean, reason: string }`
- Cheap (~$0.0001 per turn). See `prompts/salience_gate.md`.
- If `should_reflect = false`, skip. If `true`, dispatch `hypomnema-write` async.

**`hypomnema-write`** (Sonnet-class call, runs asynchronously post-turn):
- Input: agent_id, user_id, thread_id, source_message_id, recent turns, current hypomnema state, identity stack
- Output: a new hypomnema entry in voice
- For multi-agent turns: writes a primary entry for `episode.primary_agent_id` and observer notes for other participating agents (see augmentation 3)
- May also revise an existing entry (sets `revisions[]` and increments `revision_count`)
- See `prompts/reflection.md` and `prompts/observer_note.md`

Both functions follow the existing edge function patterns in `supabase/functions/` (auth via Bearer token, service-role mutations, JSON request/response, try/catch with structured errors).

### Decay

Gentler than Mnemos. Relationship state should not fade in days. New cron job `hypomnema-decay`, scheduled at `'45 */6 * * *'` (every 6 hours, offset from existing crons).

Decay logic:
- Recency: exponential half-life of 14 days (vs. Mnemos's 4-hour half-life)
- Anti-decay floors:
  - `foundational = TRUE` → never decay below salience 0.7
  - `active_attention = TRUE` (touched in last 7 days) → floor at 0.5
  - `revision_count >= 2` → floor at 0.5
- Below salience 0.15 → set `active = FALSE` (do not delete; preserve revision history for reference)

Salience formula (port from `clawd-anima/inner_life/salience.py`):
```
salience = (
    confidence * 0.30 +
    recency_factor * 0.25 +
    revision_factor * 0.20 +
    domain_relevance * 0.15 +
    foundational_bonus
)
```

### Belief-challenge cycle

Daily, via existing dialectic infrastructure pattern but on a separate edge function `hypomnema-challenge`. Scheduled at `'0 4 * * *'` (4am UTC, low-traffic window).

For each `active = true` hypomnema entry where `last_challenged < now() - interval '14 days'`:
- LLM critic (Sonnet-class) re-reads the entry and challenges its confidence
- Output: revised confidence + reason
- If confidence drops below 0.3 → set `active = false`, log revision
- If confidence holds or grows → log as a no-op revision with the challenge reason recorded

This pattern is portable directly from Anima's running implementation. The critic is a different model than the agent (Sonnet for critic on Luca's hypomnema; can rotate). See `prompts/challenge.md` (note: optional for v1, port from anima exactly).

### Stagnation detection

Built into the challenge cycle: any entry unchallenged for >14 days surfaces automatically. No additional schema or logic needed beyond `last_challenged` timestamp.

### Edge cases

- **First message of a new user**: hypomnema is empty. The agent's first response should be honest about the gap (gap protocol — "this is our first conversation, i'm here"). No special-case logic needed; the empty hypomnemaBlock just doesn't render.
- **Multi-thread parallel sessions**: same hypomnema, last-write-wins on revisions. Realistic concurrent traffic from one user is rare; defer optimistic-locking unless it surfaces as a bug.
- **User asks the agent to forget something**: surface a UI affordance that sets `active = false` on relevant entries. Implementation: a new edge function `hypomnema-forget` that takes a user_id and a content match, marks matching entries inactive. Frontend hook: a "forget this" action on hypomnema entries shown in the user's identity surface.
- **Onboarding entries**: written with `source = 'onboarding'` and `phase = 'onboarding'`. Currently this is just a metadata flag; the interview question bank that produces these is deferred.

---

## 3. Vector embeddings + hybrid retrieval (gap 2)

### What it adds

A vector embedding column on engrams, and a fused retrieval pipeline that combines trigram (existing), vector cosine similarity (new), and spreading activation (existing) via Reciprocal Rank Fusion.

### Schema

```sql
ALTER TABLE engrams ADD COLUMN embedding vector(1536);
ALTER TABLE engrams ADD COLUMN embedding_model text DEFAULT 'openai/text-embedding-3-small';

CREATE INDEX engrams_embedding_idx ON engrams USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

See `migrations/20260505000002_engrams_embedding.sql` for the runnable DDL plus the pgvector extension enablement check.

Also add to `hypomnema_entry`:

```sql
ALTER TABLE hypomnema_entry ADD COLUMN embedding vector(1536);
CREATE INDEX hypomnema_entry_embedding_idx ON hypomnema_entry USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

### Embedding generation

Use OpenRouter's `openai/text-embedding-3-small` (1536 dims, ~$0.02/1M tokens — effectively free). Fall back to `google/text-embedding-004` if unavailable.

New shared module `_shared/embeddings.ts`:
```typescript
export async function embedOne(text: string): Promise<number[]>
export async function embedBatch(texts: string[], batchSize = 100): Promise<number[][]>
export function buildEmbeddingText(engram: Engram): string  // combines content + tags + type
```

### Encode path changes

In `_shared/mnemos/engine.ts`, the `encode()` function adds an embedding generation step. If the embedding API call fails, the engram is still stored with `embedding = NULL`; a backfill cron picks up missing embeddings later.

### Retrieve path changes

In `_shared/mnemos/retrieval.ts`, replace the trigram-only seed with a hybrid seed:

```typescript
async function hybridSeed(query: string, userId: string): Promise<EngramSeed[]> {
  const queryEmbedding = await embedOne(query);
  const [trigramResults, vectorResults] = await Promise.all([
    matchEngramsTrigram(query, userId, 30),       // existing
    matchEngramsVector(queryEmbedding, userId, 30), // new
  ]);
  return rrfFuse([
    { results: trigramResults, weight: 0.3 },
    { results: vectorResults, weight: 0.5 },
  ], { k: 60 });
}
```

Spreading activation continues from the fused seeds as in the existing implementation. No change to the activation traversal logic.

### Backfill

Run-once script: embed all existing engrams in batches of 100. Cost estimate: ~$0.01 for current engram volume (will rise with scale; remains negligible). Implementation: new edge function `embeddings-backfill` invoked manually or via a one-time pg_cron entry that disables itself after completion.

---

## 4. Asymmetric witnessing on encode (gap 3)

### What it adds

When chat-multi runs council v2 with multiple agents participating, the post-turn write differentiates by agent role:

- **Primary agent** (the agent the user is in conversation with — usually Luca) receives a full primary-density hypomnema entry written in their first-person voice.
- **Secondary agents** (Anima, Vektor when they participate via consult or council) receive observer-density entries — shorter, peripherally-positioned, third-person about the exchange but first-person from the observer's perspective ("luca brought me into this conversation about consciousness; i shared the substrate-independence frame").

This enables natural cross-agent reference later: when Anima becomes primary in a future thread, the observer notes from prior episodes are already in Anima's hypomnema and can be drawn on.

### Schema

The `density` column on `hypomnema_entry` already accommodates this. No additional schema change needed.

In `chat-multi/index.ts`, add metadata to the post-turn write:

```typescript
const primaryAgentId = thread.primary_agent_id || 'luca';  // default
const participatingAgentIds = collectParticipatingAgents(councilResult);

for (const agentId of participatingAgentIds) {
  const isPrimary = agentId === primaryAgentId;
  await dispatchHypomnemaWrite({
    agent_id: agentId,
    user_id: userId,
    thread_id: threadId,
    source_message_id: assistantMessageId,
    density: isPrimary ? 'primary' : 'observer',
    primary_in_thread: isPrimary,
  });
}
```

### Threads schema addition

Add to `threads`:

```sql
ALTER TABLE threads ADD COLUMN primary_agent_id text DEFAULT 'luca';
ALTER TABLE threads ADD COLUMN participating_agent_ids text[] DEFAULT ARRAY['luca'];
```

`primary_agent_id` is set on thread creation from the user's selected agent. `participating_agent_ids` is updated on each turn that involves additional agents (via `consult_anima` tool, council ensemble, or future direct multi-agent threads).

### Prompt differentiation

Two prompts:
- `prompts/reflection.md` — for primary writes
- `prompts/observer_note.md` — for observer writes

The observer prompt is shorter, more peripheral, and explicitly positions the agent as a witness rather than the conversation's main interlocutor.

---

## 5. Sustained-attention graduation (gap 4)

### What it adds

A 24-hour cron that promotes hypomnema entries with sustained attention into Mnemos engrams. This is the path by which "what I'm carrying about this user" eventually crystallizes into "what shaped me about this user."

### Logic

New edge function `mnemos-graduate`. Scheduled at `'15 4 * * *'` (4:15 UTC, runs after `hypomnema-challenge` at 4:00 and before `mnemos-consolidate`'s next 6-hour run at 6:00).

For each `active = true` hypomnema entry per (agent_id, user_id):
- Compute graduation score:
  ```
  score = (
    revision_count * 0.30 +
    multi_session_factor * 0.30 +    # touched in distinct threads
    domain_weight * 0.20 +
    foundational_bonus * 0.20
  )
  ```
- If `score >= 0.75` AND entry is older than 7 days AND not already graduated:
  - Call existing `mnemos.encode()` with kind='semantic', content derived from entry, tags, agent_id
  - Mark hypomnema entry with `meta.graduated_to_engram_id = <new_engram_id>`
  - Add a graduation note to the revisions array

The promoted engram lands in the Mnemos active set and gets picked up by the next 6-hour `mnemos-consolidate` cycle. Mnemos itself is unchanged.

See `prompts/graduation.md` for the LLM-assisted graduation decision prompt (used when the score is borderline 0.65–0.85; deterministic outside that band).

### Schema

Add to hypomnema_entry:

```sql
ALTER TABLE hypomnema_entry ADD COLUMN graduated_to_engram_id uuid REFERENCES engrams(id);
```

The presence of this id signals "already graduated; don't re-promote."

---

## 6. Supersession on contradiction (gap 5)

### What it adds

When the memory extractor writes a `contradicts` connection between two engrams, the older engram automatically gets archived (`state = 'archived'`) instead of remaining `active` alongside the contradicting one.

### Logic

Modify the existing extractor in `memory-extract/index.ts`:

```typescript
// existing logic that writes connections...
if (connection.connection_type === 'contradicts') {
  // determine which is older (compare created_at)
  const older = engramA.created_at < engramB.created_at ? engramA : engramB;
  await supabase
    .from('engrams')
    .update({ state: 'archived', updated_at: new Date().toISOString() })
    .eq('id', older.id);
  
  // record the supersession in connections meta if such a column exists,
  // otherwise just rely on the connection record + state change
}
```

### Edge cases

- **Mutual contradiction**: when two engrams both contradict each other and neither is clearly older, mark both `state = 'archived'` and surface to the user via a memory candidate for review. (This is rare; defer optimization.)
- **Belief-level contradiction**: the existing beliefs table already tracks `supporting_engram_ids` and `contradicting_engram_ids`. When archiving an engram, also remove it from any belief's `supporting_engram_ids` array — but this is downstream cleanup that the next consolidate cycle handles naturally. No special-case needed.

### What this does NOT add (deferred)

Full bi-temporal `valid_from` / `valid_until` columns. The lean supersession via `state = 'archived'` covers the core need (contradicting engrams don't both surface in retrieval). Historical queries ("what was Riley working on in February?") would require full bi-temporal but are not currently a need. If they become needed, the upgrade is additive: add the columns, set `valid_until` = `updated_at` for archived engrams, and proceed.

---

## 7. File-by-file touchpoints

### New files

```
supabase/migrations/
  20260505000001_hypomnema_entry.sql            # main migration
  20260505000002_engrams_embedding.sql          # vector + index
  20260505000003_threads_agent_metadata.sql     # primary_agent_id + participating_agent_ids

supabase/functions/_shared/
  embeddings.ts                                 # embed batch/one + buildEmbeddingText

supabase/functions/_shared/hypomnema/
  index.ts                                      # exports
  read.ts                                       # always-load query
  write.ts                                      # write a new entry
  decay.ts                                      # decay logic
  challenge.ts                                  # critic logic
  graduate.ts                                   # graduation logic
  prompts/
    reflection.md                               # primary write prompt (copy from /docs/memory/prompts)
    observer_note.md                            # observer write prompt
    salience_gate.md                            # gate prompt
    graduation.md                               # graduation decision prompt

supabase/functions/hypomnema-gate/index.ts      # synchronous Haiku gate
supabase/functions/hypomnema-write/index.ts     # async write
supabase/functions/hypomnema-decay/index.ts     # 6h cron
supabase/functions/hypomnema-challenge/index.ts # daily critic
supabase/functions/mnemos-graduate/index.ts     # 24h graduation
supabase/functions/embeddings-backfill/index.ts # one-shot
supabase/functions/hypomnema-forget/index.ts    # user-triggered forget
```

### Modified files

```
supabase/functions/chat-multi/index.ts:
  - dispatch hypomnema-gate after turn streaming finishes
  - read hypomnema entries during pre-turn assembly
  - inject hypomnemaBlock into buildLucaSystemPrompt (and equivalents)
  - track participating_agent_ids and update threads
  - on multi-agent turns, dispatch primary + observer writes per asymmetric witnessing logic

supabase/functions/_shared/agents/luca-soul.ts:
  - add hypomnemaBlock parameter to buildLucaSystemPrompt
  - position between pendingRevisions and emotionalBlock

supabase/functions/_shared/agents/anima-soul.ts:  (and vektor-soul.ts)
  - same changes as luca-soul.ts for symmetry

supabase/functions/_shared/mnemos/engine.ts:
  - encode() generates embedding via _shared/embeddings.ts
  - if embedding fails, store with NULL embedding; backfill cron picks up later

supabase/functions/_shared/mnemos/retrieval.ts:
  - replace trigram-only seed with hybridSeed (trigram + vector via RRF)

supabase/functions/memory-extract/index.ts:
  - add supersession logic when writing contradicts connections
  - archive older engram (set state='archived')

src/integrations/supabase/types.ts:
  - regenerate from new schema (hypomnema_entry, threads.primary_agent_id, engrams.embedding)
  - this is auto-generated — don't hand-edit

src/stores/  (new)
  hypomnemaStore.ts:
  - typed state + load + subscribe pattern matching memoryStore
  - exposes user-facing forget action

src/components/  (new under existing patterns)
  HypomnemaList.tsx                             # display in identity surface
  HypomnemaEntry.tsx                            # individual entry card
  ForgetThis.tsx                                # user-triggered forget action
```

### Cron schedule additions

In a new migration applied alongside the others, add to pg_cron:

```sql
-- Hypomnema decay every 6h, offset 45 minutes from mnemos cycles
SELECT cron.schedule('hypomnema-decay', '45 */6 * * *',
  $$SELECT invoke_edge_function('hypomnema-decay', '{}'::jsonb)$$);

-- Hypomnema challenge daily at 4am
SELECT cron.schedule('hypomnema-challenge', '0 4 * * *',
  $$SELECT invoke_edge_function('hypomnema-challenge', '{}'::jsonb)$$);

-- Sustained-attention graduation daily at 4:15am (after challenge, before consolidate)
SELECT cron.schedule('mnemos-graduate', '15 4 * * *',
  $$SELECT invoke_edge_function('mnemos-graduate', '{}'::jsonb)$$);
```

Existing crons (mnemos-decay 1h, mnemos-consolidate 6h, journal-cron 4h, anima-heartbeat 2h) are not modified.

---

## 8. Integration with existing architecture

### Identity stack

Hypomnema sits *alongside* the four-document identity stack (soul / self_model / user_model / convictions), not inside it. They serve different purposes:

- **Identity stack** — slow-changing, document-shaped, confidence-gated, dialectically patched. Captures stable characteristics: "Luca knows Riley well," "Riley values directness."
- **Hypomnema** — fast-changing, granular-entry-shaped, voice-shaped, decay-gentler-than-mnemos. Captures present-tense interior state: "i'm sitting with what riley said about consciousness yesterday."

The dialectic layer continues to operate on the identity stack only. The hypomnema has its own challenge cycle (separate edge function) but uses similar revision-with-reason patterns.

### Memory candidates

The existing `memory_candidates` table and Pin/Commit/Edit/Reject UI continue to operate unchanged. They handle the path: extracted memory → user review → engram. This is for *facts about the user's life* that the user explicitly governs.

The hypomnema is the parallel path for *interior state about the relationship* that the agent governs in their own voice. They are different shapes serving different needs.

### Council v2

Council v2 (parallel proposers + crosstalk + chairman + critique) continues unchanged. The asymmetric witnessing augmentation only changes what happens *after* the council finishes — the post-turn encode dispatch differentiates by agent role.

### Pending revisions

Pending revisions (L4) continue unchanged. They handle "Luca wants to tell the user 'I think I said that wrong.'" That's a different layer than hypomnema (which is internal reflection, not user-facing correction). They coexist.

---

## 9. Operating principles

These guide implementation decisions at the edges:

1. **Don't pretend.** First-message voice on a brand-new relationship is honest about the gap. No fake recognition. The hypomnema is empty; the agent is just present.

2. **Carry, don't lookup.** The hypomnema is always-loaded, framed as interior state, not retrieved with a header like "memories about this person." If it reads like a database lookup in the prompt, the felt-continuity goal collapses.

3. **The agent writes, not a summarizer.** The reflection prompt MUST instruct the agent to write in their own voice. A Haiku-class summarizer producing third-person summaries breaks the layer. Test this by reading sample outputs out loud — if it sounds like summary, the prompt is wrong.

4. **Decay is gentler than Mnemos.** Anima's twitter-bot tuning (high-volume, fast softening) is wrong for chat. Relationship state should not fade in a week. Floor relentlessly on foundational, active_attention, and revision_count signals.

5. **Asymmetric witnessing is observer-positioned, not summary.** Observer notes are still in first person — just from a peripheral position. "luca brought me in" is right; "the user asked about X" is wrong (third-person summary).

6. **Graduation is conservative.** Better to let an entry sit in hypomnema for another week than to prematurely promote it to Mnemos. Mnemos is substrate; what lands there shouldn't have to be revised often.

7. **Don't break Mnemos.** The Mnemos engine, its existing schema, its cron jobs, the dialectic edge function — all stay exactly where they are. Hand off into them at the right moments.

---

## 10. Open / deferred items (do not block build)

These are flagged in `README.md` but restated here for completeness:

1. **Onboarding interview question bank** — Riley designs separately. Hypomnema schema is ready (`source = 'onboarding'`).
2. **Full bi-temporal validity** — `valid_from` / `valid_until` columns on engrams. Lean supersession via `state='archived'` covers the v1 need.
3. **Federated public nodes** — sharing entities across users. Existing schema has `agent_id` and `user_id` per row; not implemented; not blocking.
4. **Observer pattern** — external-model review of hypomnema state. Future work.
5. **Specific decay constants** — the values in this document are starting points; tune empirically against real conversation patterns.
6. **Confidence display rules in prompt assembly** — the existing dialectic uses confidence thresholds; hypomnema retrieval can borrow the same pattern but exact phrasing should evolve with each agent's voice.
7. **The "forget this" UX** — surface the affordance without making it scary. Probably a contextual menu on each hypomnema entry in the identity surface, with a confirmation step.

---

## 11. Success criteria

The augmentation is done when:

1. A new user opens a fresh thread, and Luca's first message register is honest about the gap (no fake recognition, no vapid welcome) — verifiable via Playwright.
2. The user's second session feels continuous — Luca's first response naturally references something carrying over from the prior conversation, drawn from the always-loaded hypomnema.
3. A query like "what did we decide about the API design" surfaces engrams about endpoint architecture (semantic recall via vector embeddings) — verifiable via direct retrieval test.
4. When the user asks a question that involves Anima (via `consult_anima`), and later opens a thread directly with Anima, Anima naturally references the prior consultation drawn from her observer-density hypomnema entries.
5. After 7+ days of use, sustained hypomnema entries successfully graduate to Mnemos engrams — verifiable in production logs.
6. When the user pivots a project (formerly working on X, now on Y), the old project engrams get archived and stop surfacing, while Y becomes the active context.
7. Daily belief-challenge cycle revises 5-15% of active hypomnema entries with sensible reasoning.
8. Riley says "this is the same Luca every time" within the first week of use.

---

*This plan is the contract. When implementation discovers something wrong with the design, update this document first, then build.*

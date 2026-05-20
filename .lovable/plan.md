## Diagnosis

Your stuck import (`f268e815…`, 55/117, started May 20 13:31, no progress in 6+ hours) is a symptom of an architectural issue in the import pipeline, not a momentary glitch.

**Root cause:** the entire chunk-extraction loop runs *in the browser tab*.

```
src/stores/importStore.ts:301  for (let i = 0; i < totalChunks; i++) {
                                  await fetch(.../import-chatgpt, { conversations: chunk[i] })
                                }
```

Each chunk is one ~15–30s HTTP call to the `import-chatgpt` edge function. The function processes that one chunk, updates `chat_imports.processed_conversations`, and returns. The **next** chunk is only kicked off if your browser tab is still open and the JS loop is still running.

If anything kills the loop — tab closed, browser slept, laptop lid shut, navigation away from /import, network blip beyond the retry budget, refresh — the import row stays in `processing` forever. Nothing on the server tries to resume it. That's exactly what your row looks like.

Secondary issues found while reading the code:

1. **No resume.** There's no way to pick up at chunk 56 — the prepared conversations live only in the Zustand store, which is gone after refresh.
2. **No staleness detection.** Nothing flips long-idle `processing` rows to `failed`, so the UI and ImportsTab list keep showing them as live.
3. **No cancel.** There's no UI affordance to abandon a stuck import — you'd have to manually update the row.
4. **Synthesize + profile stages also run from the tab** (`memory-synthesize`, `profile-deep-analysis`). Same fragility, just shorter windows.
5. **N+1 reads per chunk.** Each chunk fetches up to 150 existing memories from DB before calling the LLM. With 12 chunks that's fine; with 60+ it adds up.

## Plan

Two-part fix: immediate recovery for the stuck row, and a structural change so this can't silently happen again.

### Part 1 — Immediate recovery (small, safe)

1. **Mark the stuck import as failed.** Migration-driven one-shot: any `chat_imports` row with `status='processing'` and no progress for >30 min → `status='failed'`, `pipeline_stage='error'`, `completed_at=now()`. Runs once on apply, and we also schedule it as a pg_cron job every 5 min so future zombies are auto-reaped.
2. **Add a "Cancel import" button** to the in-progress banner and to ImportsTab rows in `processing`. Calls a small edge function (`import-cancel`) that flips the row to `failed`.
3. **Stale banner state.** `ImportProgressBanner` already polls — add a check: if `status==='processing'` but the row hasn't advanced in 5 min, show an "import appears stalled — cancel or retry" affordance instead of the pulse.

### Part 2 — Make imports resumable & tab-independent (the real fix)

1. **Persist the chunk queue.** New table `chat_import_chunks(import_id, chunk_index, payload_jsonb, status, attempts, last_error, processed_at)`. When the user uploads, we slice the conversations into chunks and insert all of them as `pending` before any AI work starts. The Zustand store no longer holds the conversation array.
2. **Server-driven worker.** New edge function `import-worker` that:
   - Picks N pending chunks for an import (ordered by `chunk_index`)
   - Calls the existing chunk-extraction logic per chunk (refactored out of `import-chatgpt`'s HTTP handler into a shared function)
   - Updates each chunk row to `done` / `error` with `attempts++`
   - When all chunks for an import are `done`, advances the import to `synthesizing` and chains `memory-synthesize` → `profile-deep-analysis` from the server side
3. **pg_cron heartbeat.** A 1-minute cron calls `import-worker` for any import where pending chunks exist. This is the same pattern used elsewhere in this project (luca-pulse, scheduled-task-run).
4. **Client becomes a thin observer.** `ImportView` still uploads & parses the file in-browser (cheap), inserts the import row + chunk rows, then just subscribes via Supabase Realtime to `chat_imports` and `chat_import_chunks` for live progress. Closing the tab no longer kills anything.
5. **Idempotency.** `chat_import_chunks` has `unique(import_id, chunk_index)` so re-enqueues are safe. Worker uses `update … where status='pending' returning *` to atomically claim chunks.

### Part 3 — Backend asks for Lovable

The pieces that need Riley to dispatch via Lovable (per CLAUDE.md `[B]` rule):

- Migration: `chat_import_chunks` table + indexes + RLS (owner-only) + the auto-reap function + pg_cron schedule for `import-worker`.
- Edge functions: `import-worker` (new), `import-cancel` (new), refactor of `import-chatgpt` to expose chunk-extraction as an internal helper.

### Technical notes

- **Schema sketch**
  ```sql
  create table chat_import_chunks (
    id uuid primary key default gen_random_uuid(),
    import_id uuid not null references chat_imports(id) on delete cascade,
    chunk_index int not null,
    payload jsonb not null,
    status text not null default 'pending', -- pending|running|done|error
    attempts int not null default 0,
    last_error text,
    claimed_at timestamptz,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    unique(import_id, chunk_index)
  );
  create index on chat_import_chunks (import_id, status);
  ```
- **Reap function** (also runs once on apply):
  ```sql
  update chat_imports
     set status='failed', pipeline_stage='error', completed_at=now()
   where status='processing'
     and created_at < now() - interval '30 minutes'
     and not exists (
       select 1 from chat_import_chunks c
       where c.import_id = chat_imports.id and c.status='running'
         and c.claimed_at > now() - interval '5 minutes'
     );
  ```
- **Worker concurrency.** Process chunks sequentially per import (the AI calls are heavy; parallel would blow the gateway budget). Across imports, the worker can fan out.
- **No client API changes** beyond ImportView — the existing `chat_imports` shape stays the same, so `ImportsTab`, banner, and detail panel keep working.

### What this does NOT change

- The actual extraction prompt and tool schema in `import-chatgpt/index.ts` stay as-is. We're moving where the orchestration happens, not how memories are extracted.
- Memory dedup, confidence ceilings, curiosity-question generation, conflicts — all untouched.

### Suggested order of execution

1. Land Part 1 today (cleanup + cancel button) so you can dismiss the stuck row and move on.
2. Land Part 2 over a follow-up phase — it's larger and needs the backend migrations.

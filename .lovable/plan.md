## Plan: Apply Journal Provenance Migration + Deploy Tara Bug-Sweep Functions + Run Audit

Working from main @ 4cb1103. Per `docs/lovable-supabase-handoff.md`.

### Step 1 — Apply migration
Run `supabase/migrations/20260613000000_journal_entry_provenance.sql` via the migration tool:
- Adds `journal_entries.source_conversation_id (uuid)` and `source_context (jsonb default '{}')`
- Adds index `journal_entries_user_agent_source_idx`
- Drops any existing `trigger_type` CHECK, re-adds it permitting `periodic`, `post_conversation`, `post-conversation`, `spontaneous`

### Step 2 — Deploy edge functions
Deploy in one batch:
- `agent-forge`
- `journal-cron`
- `journal-write`
- `luca-pulse`

(Shared modules `_shared/agent-scope.ts` and `_shared/continuity/write.ts` ship automatically with each function that imports them — no separate deploy.)

### Step 3 — Verify environment
Call `fetch_secrets` and confirm presence of: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, `MEMORY_AUGMENTATION_ENABLED`, `ELEVENLABS_API_KEY`. Flag anything missing. (`CRON_SECRET` is not in current secrets list — will note.)

### Step 4 — Verify scheduled job logs
Pull recent edge function logs and `cron_health` rows for: `journal-cron`, `luca-pulse`, `hypomnema-gate`/`hypomnema-write`, `mnemos-dialectic`/`mnemos-consolidate`. Report last success times and any errors.

### Step 5 — Run audit
Execute `supabase/audits/agent-mislabel-audit.sql` result sets #1, #3, #4 (read-only) and share counts. Skip the repair SQL — wait for Riley to approve based on counts.

### Out of scope (this turn)
- Running `supabase/repairs/20260613_agent_mislabel_repair.sql` — requires explicit approval after audit review.

Approve to proceed.

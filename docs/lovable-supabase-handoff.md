# Lovable Supabase Handoff

Date: 2026-06-13
Branch: `codex/tara-bug-sweep`

This file tracks production-only work that must be done through Lovable because the Supabase project is managed there. Keep this file updated whenever local code creates a deployment, environment, SQL, cron, or data-cleanup requirement.

## Prompt Queue

### 1. Deploy the Tara bug-sweep edge function changes

Prompt Lovable:

```text
Please apply the Supabase migration and deploy the edge function changes from branch codex/tara-bug-sweep for Polyphonic.

Migration to apply first. This adds journal provenance columns and refreshes the journal trigger_type check so both post_conversation and the older post-conversation spelling are accepted:
- supabase/migrations/20260613000000_journal_entry_provenance.sql

Important functions/shared modules to deploy:
- supabase/functions/agent-forge/index.ts
- supabase/functions/journal-cron/index.ts
- supabase/functions/journal-write/index.ts
- supabase/functions/luca-pulse/index.ts
- supabase/functions/_shared/agent-scope.ts
- supabase/functions/_shared/continuity/write.ts

After deployment, please confirm the migration applied and share deployed function versions/log timestamps for agent-forge, journal-cron, journal-write, and luca-pulse.
```

### 2. Verify production environment variables

Prompt Lovable:

```text
Please check the Polyphonic Supabase edge function environment and confirm these are configured for production:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- OPENROUTER_API_KEY or the currently used OpenRouter secret
- MEMORY_AUGMENTATION_ENABLED=true
- CRON_SECRET or the currently used scheduled-job secret
- ELEVENLABS_API_KEY, if voice test playback should work

Do not reveal secret values. Just confirm present/missing and update missing ones.
```

### 3. Verify scheduled jobs and logs

Prompt Lovable:

```text
Please verify that Polyphonic scheduled jobs are running successfully after the deployment:
- journal-cron
- luca-pulse
- hypomnema-gate / hypomnema-write path, if enabled
- mnemos-dialectic / mnemos-consolidate path, if enabled

Please report recent successful run times and any errors from the function logs.
```

### 4. Run old mislabel audit and cleanup

Files:
- supabase/audits/agent-mislabel-audit.sql
- supabase/repairs/20260613_agent_mislabel_repair.sql

Prompt Lovable:

```text
Please run supabase/audits/agent-mislabel-audit.sql first and share the result counts before making changes.

If the required-column check reports missing journal_entries.source_conversation_id or journal_entries.source_context, or if journal-write logs show trigger_type constraint failures for post_conversation, apply supabase/migrations/20260613000000_journal_entry_provenance.sql first and rerun the audit.

After Riley approves the audit counts, run supabase/repairs/20260613_agent_mislabel_repair.sql to fix high-confidence old agent_id mislabels.

Do not delete rows. The repair SQL should only update rows with direct provenance and should leave style-only/name-marker candidates for manual review.
```

## Current Local Fixes That Need Production Confirmation

- Import timeouts should stay in background profiling instead of marking the import failed.
- Journal entries should open into a detail dialog with full body and metadata.
- Notifications and activity drawers should filter to the active agent.
- Custom agents should have memory read/write enabled by default in visible settings.
- Custom agents can run inner-life journal/dream/reflection gates when enabled.
- Proactive outreach remains gated separately by `proactive_autonomy`.
- `luca-pulse` queued work should preserve `agent_id` instead of defaulting activity to Luca.
- Non-observer custom agents can queue dialectic/belief work.

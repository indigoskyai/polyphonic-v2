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

### 2b. Deploy Luca private beta download gate

Prompt Lovable:

```text
Please deploy the new public edge function `luca-download` for the Polyphonic website and confirm it is configured with JWT verification disabled from `supabase/config.toml`.

Required private beta secrets:
- LUCA_DOWNLOAD_PASSPHRASE
- LUCA_DOWNLOAD_FILE_NAME, optional
- LUCA_DOWNLOAD_DISABLED, optional emergency pause switch (`true` disables downloads)

Preferred private-storage delivery:
- Upload the latest notarized Luca Apple Silicon DMG to a private Supabase Storage bucket.
- Set LUCA_DOWNLOAD_STORAGE_BUCKET and LUCA_DOWNLOAD_STORAGE_PATH.
- Confirm SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present so the function can create 15-minute signed URLs.

Fallback delivery if private storage is not ready:
- Set LUCA_DOWNLOAD_URL to the hosted DMG URL.

Do not reveal secret values. Confirm only present/missing and the function deployment timestamp.
```

### 2c. Deploy agent X/social connection and autopilot functions

Prompt Lovable:

```text
Please deploy and verify the Polyphonic agent X/social edge-function slice.

Functions to deploy:
- supabase/functions/agent-social-x-oauth-start
- supabase/functions/agent-social-x-oauth-callback
- supabase/functions/agent-social-x-channel
- supabase/functions/agent-social-x-autopilot
- shared module supabase/functions/_shared/social-x.ts

Migration/cron to apply:
- supabase/migrations/20260629113000_agent_social_x_autopilot_cron.sql

Required secrets:
- X_CLIENT_ID
- SOCIAL_TOKEN_ENCRYPTION_KEY

Optional secrets:
- X_CLIENT_SECRET, if the X app is configured as confidential
- X_REDIRECT_URI, if production should override the default edge-function callback URL

Please confirm only present/missing, not secret values. After deployment, confirm:
- OAuth start returns an authorization URL.
- OAuth callback can store encrypted credentials.
- agent-social-x-channel can read channel health for an authenticated user.
- agent-social-x-autopilot respects policy/approval gates and either creates a draft or reports a clear blocked/skipped reason.
- recent cron/job logs for agent-social-x-autopilot show no repeated failures.
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

### 5. Deploy Polyphonic Mnemos repair contracts

Prompt Lovable:

```text
Please deploy the Polyphonic Mnemos repair slice.

Apply this migration first:
- supabase/migrations/20260704120000_mnemos_repair_contracts.sql

Deploy these edge functions/shared modules:
- supabase/functions/_shared/mnemos/constants.ts
- supabase/functions/_shared/mnemos/types.ts
- supabase/functions/_shared/mnemos/encoding.ts
- supabase/functions/_shared/mnemos/retrieval.ts
- supabase/functions/_shared/mnemos/consolidation.ts
- supabase/functions/_shared/mnemos/settings.ts
- supabase/functions/_shared/mnemos/softening.ts
- supabase/functions/_shared/continuity/write.ts
- supabase/functions/mnemos-consolidate/index.ts
- supabase/functions/mnemos-decay/index.ts
- supabase/functions/mnemos-digest-build/index.ts
- supabase/functions/mnemos-digest-action/index.ts
- supabase/functions/mnemos-digest-suggest/index.ts
- supabase/functions/mnemos-soften/index.ts
- supabase/functions/mnemos-verify/index.ts
- supabase/functions/memory-candidate-action/index.ts

Confirm these flags/secrets without revealing values:
- BELIEF_LLM_SYNTHESIS_ENABLED=true
- BELIEF_SYNTHESIS_AUTOACTIVATE, if intentionally enabled
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY

After deployment, confirm:
- memory_settings.full_cognition_enabled exists and defaults false
- mnemos_cohort() returns only users with BYOK plus full_cognition_enabled=true
- mnemos_run_rehearsal_cohort() no longer updates last_accessed_at or accessibility
- mnemos_reconsolidate(uuid[], uuid, text) exists
- connections allows connection_type='co_occurs' and has formed_by
- digest review writes reviewed_by
- mnemos_softening_proposals and continuity_events exist

Do not rewrite git history or change repository visibility from this prompt. The historical UUID/username/email exposure needs a separate explicit Riley approval for history rewrite or privatization.
```

### 6. Keep chat attachments inside the Lovable/Supabase deployment

The first attachment release briefly introduced an external Docker worker. That service is retired. The production path is now the same architecture as the rest of Polyphonic: authenticated browser preparation, private Supabase Storage, Supabase Edge Functions, and OpenRouter multimodal inputs.

Prompt Lovable:

```text
Please deploy the Supabase-native Polyphonic attachment repair from latest main.

Apply:
- supabase/migrations/20260715013000_supabase_native_attachments.sql

Redeploy:
- attachment-init
- attachment-finalize
- attachment-retry
- attachment-bind
- attachment-cancel
- attachment-url
- chat
- chat-multi
- group-agent-request
- group-message-send
- agent-consult
- subagent-run

Include the current shared modules under supabase/functions/_shared, especially:
- attachments.ts
- attachment-finalization.ts

Verify that:
- attachment_processing_jobs and lease_attachment_processing_job no longer exist
- new uploads transition directly to ready after attachment-finalize
- text, code, DOCX, PPTX, XLSX, and ZIP uploads retain bounded extracted_text
- private images and PDFs reach OpenRouter through short-lived signed URLs
- audio and video up to 20 MB can be delivered or prepared through OpenRouter
- no Render, Docker, ClamAV, Tika, LibreOffice, or FFmpeg service is required

Do not create replacement external infrastructure and do not expose service-role credentials.
```

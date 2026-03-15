

## Plan: Full Supabase Setup for New Anima Codebase

This is a large infrastructure setup task. Here's what needs to happen and in what order:

### 1. Run all 37 database migrations
The database is currently empty (tables were dropped). I'll run all 37 migration SQL files in order using the database migration tool. These create ~20+ tables with RLS policies, functions, triggers, and enum types.

### 2. Enable extensions
- `pg_net` — needed for `trigger_resonance()` in the activity gate migration
- `pg_cron` — needed for scheduled jobs
- `pgsodium` — needed for API key encryption functions

These were partially enabled in a prior step but need to be verified/re-enabled for the fresh schema.

### 3. Delete old edge function & deploy all 21 new ones
- Delete `multi-model-chat` if it still exists on the deployment side (code is already gone)
- Update `supabase/config.toml` to include all 21 function entries with `verify_jwt = false` (currently only 8 are listed)
- Deploy all 21 functions

### 4. Create `generated-images` storage bucket (private)
For AI-generated image uploads.

### 5. Verify secrets
`OPENROUTER_API_KEY` is already set per the secrets list. No action needed.

### 6. Configure auth
- Email/password is likely already enabled (default)
- Google OAuth is available via Lovable Cloud's managed provider
- Will verify and configure as needed

### 7. Database settings for inner life
The `ALTER DATABASE postgres SET app.supabase_url` and `app.service_role_key` commands — these are **not allowed** in Lovable Cloud migrations (`ALTER DATABASE postgres` is blocked). I'll need to find an alternative approach or note this limitation.

### 8. Cron jobs
Set up `pg_cron` schedules for journal generation, memory decay, and anima processes. Same `ALTER DATABASE` limitation applies to the cron jobs that reference `current_setting('app.service_role_key')`.

---

### Important Limitations

- **`ALTER DATABASE postgres SET ...` is not allowed** in Lovable Cloud. The resonance cascade trigger and cron jobs that use `current_setting('app.service_role_key')` will need a workaround — likely storing these values in a config table instead, or hardcoding them in the trigger function.
- Migrations will be run sequentially as a single batch via the migration tool.

### Execution Order
1. Enable extensions (pg_net, pg_cron, pgsodium)
2. Run all 37 migrations in order
3. Update config.toml with all function entries
4. Delete old multi-model-chat, deploy all 21 functions
5. Create storage bucket
6. Configure auth
7. Address the `ALTER DATABASE` limitation for inner life config
8. Set up cron schedules


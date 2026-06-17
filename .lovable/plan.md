# Deploy Polyphonic account portability backend

All code is already present in the working tree (migration, 5 edge functions, `_shared/account-portability/{archive,server}.ts`, `/settings/portability` route, `AccountPortabilityPanel`, store, tests). This is a deploy + verification pass — no code changes.

## Steps

1. **Apply migration** `supabase/migrations/20260616000000_account_portability.sql` via the migration tool.
   - Creates `account_portability_jobs`, `account_portability_row_map`, private `account-portability` storage bucket, RLS policies, storage object policies scoped to `auth.uid()::text = (storage.foldername(name))[1]`, and service-role full access.

2. **Deploy edge functions** (one call, bundles shared code automatically):
   - `account-export-create`
   - `account-import-preview`
   - `account-import-apply`
   - `account-import-rollback`
   - `account-portability-status`

3. **Secrets check.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are already present (confirmed in `<secrets>` block). No action.

4. **Verification (smoke tests via `supabase--curl_edge_functions`):**
   - Unauth call to each of the 5 functions with `Authorization: Bearer invalid` → expect `401`.
   - Auth call to `account-portability-status` (preview-session token) → expect `200`, returns only signed-in user's jobs.
   - Auth call to `account-import-preview` with a payload encrypted via the shared archive helper → expect `200` with preview body, and no rows written (verify via `supabase--read_query` count of `account_portability_jobs` before/after).
   - Auth call to `account-import-apply` with the same archive → expect `200`, row_map entries scoped to the calling user_id.
   - Auth call to `account-import-rollback` with that job id → expect deletion limited to mapped rows (verify `account_portability_row_map` empties for that job).
   - `supabase--read_query` on `storage.buckets` → confirm `account-portability` row has `public = false`.
   - Browser-side: navigate to `/settings/portability` and confirm the panel renders inside the settings shell.

5. **Report.** Migration result, function deploy result, all verification outcomes, scanner state (no new findings expected since RLS + GRANTs already in migration).

## Out of scope

- Existing ChatGPT/Claude `chat_imports` flow is untouched.
- No edits to `agent_configs`, `app_config`, or `cron_health` policies.
- No frontend changes — code already on disk.

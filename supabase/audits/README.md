# Audits

Read-only SQL inspection scripts for production-readiness gates. None of these
mutate state. Run from psql connected to staging, or paste into the Supabase
SQL editor.

| Script | Gate (PRODUCTION_LAUNCH_CHECKLIST.md) | Purpose |
|---|---|---|
| `rls-coverage.sql` | Security #3 | Find public-schema tables missing RLS or policies |
| `policy-owner-scope.sql` | Security #3 | Find policies that may not be owner-scoped |
| `user-cascade.sql` | Reliability #4 | Find user-FK relations missing `ON DELETE CASCADE` |

## Running

```bash
psql "$STAGING_DATABASE_URL" -f supabase/audits/rls-coverage.sql
psql "$STAGING_DATABASE_URL" -f supabase/audits/policy-owner-scope.sql
psql "$STAGING_DATABASE_URL" -f supabase/audits/user-cascade.sql
```

Or, in the Supabase Dashboard → SQL Editor, paste the file contents and run.

## Pass criteria

Each script ends with a comment block stating its pass criterion. In short:

- **rls-coverage.sql** — result sets #1 and #2 both return zero rows.
- **policy-owner-scope.sql** — every row in result set #1 is reviewed and
  either confirmed owner-scoped (false positive: the policy uses a function
  or join that resolves to `auth.uid()` indirectly) or documented as an
  intentional service-only / published-read exception in
  `PRODUCTION_AUDIT.md` §14 Accepted-risk register.
- **user-cascade.sql** — result set #1 returns zero rows, or every row is
  documented as intentional in §14 Accepted-risk.

After updating §14, mark the corresponding box in
`PRODUCTION_LAUNCH_CHECKLIST.md` and add a Verified row to the findings ledger
with command + result-set evidence.

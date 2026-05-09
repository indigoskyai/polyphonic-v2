# PRODUCTION_LAUNCH_CHECKLIST.md — Polyphonic go/no-go

Hard gates. None of these may be `[ ]` at launch. Detail and per-item verification lives in [`PRODUCTION_AUDIT.md`](./PRODUCTION_AUDIT.md).

## Security
- [x] Security scan: zero unaccepted findings (`security--run_security_scan`) — 0 ERROR, 14 WARN, all 14 on the accepted list (1× `extension_in_public`, 3× `anon_security_definer_function_executable`, 10× `authenticated_security_definer_function_executable`); see PRODUCTION_AUDIT.md §14 Accepted-risk register
- [x] Supabase linter: zero unaccepted warnings (`supabase--linter`; residual infos/warnings accepted in P4-016)
- [x] RLS verified on every public-schema table; all owner-scoped — Lovable ran `supabase/audits/rls-coverage.sql` 2026-05-08: result set #1 (no RLS) and #2 (RLS on, zero policies) both empty. Owner-scope reviewed via `policy-owner-scope.sql`: 39 service-role policies in canonical `TO service_role` form post-sweep; 6 non-service-role rows are intentional public-profile / handle / error-log surfaces (`is_handle_owner()` resolves to `auth.uid()` indirectly); 1 anon-INSERT row is intentional (`client_error_log_insert_any`). See PRODUCTION_AUDIT.md P4-025.
- [x] No `SERVICE_ROLE` references in client runtime `src/` code
- [x] CORS allowlist restricted to production/staging/Lovable preview patterns; no wildcard; localhost only outside production
- [x] All `verify_jwt = false` functions have source auth markers or explicit source-level auth posture
- [x] Storage buckets owner-scoped or explicitly published-reference scoped
- [x] Auth: HIBP password check ON, email confirmation configured, `/reset-password` page live

## Reliability
- [x] Every edge function has CORS preflight + CORS-on-error + try/catch wrapper
- [x] All cron loops succeeded ≥ 95% in the last 24h
- [x] No 5xx from any edge function in the last 7 days (or each is documented + accepted)
- [x] Cascade-on-user-delete tested in a scratch account; zero orphan rows — Lovable ran `supabase/audits/user-cascade.sql` 2026-05-08: result set #1 (user FKs without `ON DELETE CASCADE`) returned 0 rows. Structural pass; live scratch-account delete remains as a follow-up smoke if a regression is suspected. See PRODUCTION_AUDIT.md P4-025.

## Auth
- [ ] Email signup → confirmation → login round-trip green on staging
- [x] Google OAuth login/sign-in green on staging
- [ ] Google OAuth new-account/signup flow green on staging after signup surfaces are designed
- [ ] Apple OAuth signup → login round-trip green on staging (repo UI/helper wired; human round trip pending)
- [ ] Forgot-password → email → `/reset-password` → new password → login green
- [ ] Logout fully clears client state (repo-side reset verified locally; staging smoke pending)

## Functional
- [ ] Every route in app loads without console errors on a fresh account
- [ ] Every route in app loads without console errors on a heavy account (5k engrams seed)
- [ ] Chat send/stream/regenerate/retry all work; missing-key UX is graceful
- [ ] Mnemos encode → retrieve → decay → consolidate → dialectic full loop verified

## Performance
- [ ] Lighthouse Performance ≥ 80 on `/chat` and `/mind`
- [ ] Lighthouse Accessibility ≥ 90 on `/chat` and `/mind`
- [ ] Graph 60 fps at 1000 nodes; CPU sleeps when idle
- [x] Initial JS payload < 500 KB gzipped on `/chat` first paint

## Operations
- [ ] Lovable Cloud PITR confirmed ON; restore rehearsed once
- [ ] Custom domain configured (if applicable) + SSL valid
- [ ] Email domain configured (if transactional emails used)
- [x] Error reporting wired and receiving events from staging — Lovable verified live `client_error_log` row id `249772cd-befa-4cfa-bfc6-8471b08cd1b4` from a synthetic `throw new Error('staging error log smoke')` injection on 2026-05-08 23:44:09Z; see PRODUCTION_AUDIT.md P4-023
- [x] Cron health surface live and showing recent green ticks — `/settings/cron-health` page reads `public.cron_health` and renders status (green/amber/red/idle) per job with last run, run count, error count, last duration, and expandable last-error detail. Migration `20260509000000_cron_health_authenticated_read.sql` opens SELECT to authenticated. Pending Lovable apply + visual verification on staging. See PRODUCTION_AUDIT.md P4-026.

## Legal / content
- [x] Privacy policy page exists and is linked from auth pages
- [x] Terms of service page exists and is linked from auth pages
- [x] Favicon + social-share meta + robots.txt + web manifest present
- [x] Footer attributions / OSS notices (if any) present — `/credits` route added with grouped OSS list (framework, UI primitives, backend, viz, typography). Linked from Login, Signup, Privacy, Terms footers as `Privacy / Terms / Credits`. Page uses the same chrome as Privacy/Terms; `useDocumentTitle('Credits')` wired. See PRODUCTION_AUDIT.md P4-027.

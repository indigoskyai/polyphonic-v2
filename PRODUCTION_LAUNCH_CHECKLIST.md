# PRODUCTION_LAUNCH_CHECKLIST.md — Polyphonic go/no-go

Hard gates. None of these may be `[ ]` at launch. Detail and per-item verification lives in [`PRODUCTION_AUDIT.md`](./PRODUCTION_AUDIT.md).

## Security
- [ ] Security scan: zero unaccepted findings (`security--run_security_scan`)
- [x] Supabase linter: zero unaccepted warnings (`supabase--linter`; residual infos/warnings accepted in P4-016)
- [ ] RLS verified on every public-schema table; all owner-scoped
- [ ] No `SERVICE_ROLE` references in client `src/`
- [ ] CORS allowlist contains production domain only (no wildcard)
- [ ] All `verify_jwt = false` functions documented as either in-code-validating or intentionally public
- [x] Storage buckets owner-scoped or explicitly published-reference scoped
- [x] Auth: HIBP password check ON, email confirmation configured, `/reset-password` page live

## Reliability
- [ ] Every edge function has CORS preflight + CORS-on-error + try/catch wrapper
- [x] All cron loops succeeded ≥ 95% in the last 24h
- [x] No 5xx from any edge function in the last 7 days (or each is documented + accepted)
- [ ] Cascade-on-user-delete tested in a scratch account; zero orphan rows

## Auth
- [ ] Email signup → confirmation → login round-trip green on staging
- [ ] Google OAuth signup → login round-trip green on staging (hosted provider configured; human round trip pending)
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
- [ ] Initial JS payload < 500 KB gzipped on `/chat` first paint

## Operations
- [ ] Lovable Cloud PITR confirmed ON; restore rehearsed once
- [ ] Custom domain configured (if applicable) + SSL valid
- [ ] Email domain configured (if transactional emails used)
- [ ] Error reporting wired and receiving events from staging
- [ ] Cron health surface live and showing recent green ticks

## Legal / content
- [x] Privacy policy page exists and is linked from auth pages
- [x] Terms of service page exists and is linked from auth pages
- [ ] Favicon + social-share meta + robots.txt present
- [ ] Footer attributions / OSS notices (if any) present

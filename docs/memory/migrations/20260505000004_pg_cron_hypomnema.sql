-- pg_cron schedules for the new hypomnema-related background jobs.
-- See docs/memory/PLAN.md section 6 for full design.
-- These coordinate with the existing mnemos-decay (1h), mnemos-consolidate (6h),
-- journal-cron (4h), and anima-heartbeat (2h) jobs without touching them.

-- Hypomnema decay every 6 hours, offset 45 minutes from existing mnemos cycles.
SELECT cron.schedule(
  'hypomnema-decay',
  '45 */6 * * *',
  $$SELECT invoke_edge_function('hypomnema-decay', '{}'::jsonb)$$
);

-- Hypomnema challenge daily at 4:00 UTC (low-traffic window).
-- Belief-challenge LLM critic re-examines active hypomnema entries.
SELECT cron.schedule(
  'hypomnema-challenge',
  '0 4 * * *',
  $$SELECT invoke_edge_function('hypomnema-challenge', '{}'::jsonb)$$
);

-- Sustained-attention graduation daily at 4:15 UTC.
-- Promotes hypomnema entries with sustained attention into Mnemos engrams.
-- Runs AFTER hypomnema-challenge (so freshly-revised entries are eligible)
-- and BEFORE the next mnemos-consolidate at 06:00 (so promoted engrams land in
-- the same consolidation pass).
SELECT cron.schedule(
  'mnemos-graduate',
  '15 4 * * *',
  $$SELECT invoke_edge_function('mnemos-graduate', '{}'::jsonb)$$
);

-- Optional: a one-time embedding backfill cron that runs every 10 minutes for the first 24 hours,
-- then disables itself once all engrams have embeddings. Implementation alternative: just call
-- the backfill function manually once.
-- (Not scheduled here; create manually if needed via the embeddings-backfill edge function.)

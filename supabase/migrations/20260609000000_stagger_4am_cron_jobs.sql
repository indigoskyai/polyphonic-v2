-- Stagger the 4am cron pile-up.
--
-- Previously both `luca-dream` and `hypomnema-challenge` fired at '0 4 * * *'
-- (04:00 UTC), each kicking off per-user model calls at the same instant, on
-- top of `mnemos-graduate` at '15 4 * * *' (04:15). Two heavy model-calling
-- jobs hitting at the exact same minute spikes upstream/LLM load and DB
-- contention nightly.
--
-- This moves the anima dream job to 04:30 so the three heavy nightly jobs run
-- in sequence (hypomnema-challenge 04:00 -> mnemos-graduate 04:15 ->
-- luca-dream 04:30) instead of two firing together. Only `luca-dream` is
-- touched; the hypomnema/mnemos jobs keep their existing schedules and relative
-- order. dream landing last also means it runs after the memory-reinforcement
-- batch rather than racing it.
--
-- cron.schedule upserts by jobname; the guarded unschedule-then-schedule below
-- matches the existing migration style and is idempotent on re-run.

SELECT cron.unschedule('luca-dream') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'luca-dream');
SELECT cron.schedule('luca-dream', '30 4 * * *', $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-dream"}'::jsonb)$$);

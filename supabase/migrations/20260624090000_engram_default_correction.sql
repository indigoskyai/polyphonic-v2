-- Correct off-canonical engrams column DEFAULTs to match the reference Mnemos engine
-- (core/types.py): strength/accessibility = 0.5, stability = 0.1. Prod created these as
-- strength 1.0 / stability 0.0 / accessibility 1.0.
--
-- These defaults are LATENT: the encoding path (encoding.ts) always sets all three
-- explicitly on insert, so no existing row carries the old default and no behavior
-- changes today. This is pure hygiene/future-proofing — it stops any future raw-SQL
-- insert that omits these columns from silently creating an over-strong, zero-stability
-- engram (which would never consolidate and would resist decay wrongly). Non-breaking.
ALTER TABLE public.engrams ALTER COLUMN strength      SET DEFAULT 0.5;
ALTER TABLE public.engrams ALTER COLUMN stability     SET DEFAULT 0.1;
ALTER TABLE public.engrams ALTER COLUMN accessibility SET DEFAULT 0.5;

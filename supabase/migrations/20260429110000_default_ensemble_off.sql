-- Default the ensemble setting to OFF.
--
-- The L1 rollup defaulted multi_model_enabled to true, which routed every
-- chat turn through chat-multi's three-voice synthesis. The single-Luca path
-- with the tool planner gives a coherent voice with lower latency, and the
-- synthesis judge has historically editorialized away real tool calls (the
-- subagent dispatch denial caught during the L9–L12 smoke).
--
-- Existing rows that were NULL or stuck on the old default flip to false so
-- the new default is the actual experience. Any user who has explicitly
-- opted in via the Settings UI will have their row updated and can simply
-- toggle it back on; ensemble lock + arm in ChatView still work the same.

ALTER TABLE public.user_settings
  ALTER COLUMN multi_model_enabled SET DEFAULT false;

UPDATE public.user_settings
   SET multi_model_enabled = false
 WHERE multi_model_enabled IS NULL OR multi_model_enabled = true;

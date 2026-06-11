-- Fix emotional_state primary key so per-agent rows can coexist.
-- The old PK was on (user_id), which silently blocked INSERTs for non-Luca agents.
-- A unique index on (user_id, agent_id) already exists, so we swap the PK.
ALTER TABLE public.emotional_state DROP CONSTRAINT IF EXISTS emotional_state_pkey;
ALTER TABLE public.emotional_state ADD CONSTRAINT emotional_state_pkey PRIMARY KEY (user_id, agent_id);
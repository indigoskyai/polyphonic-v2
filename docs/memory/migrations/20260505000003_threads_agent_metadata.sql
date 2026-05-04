-- Thread-level agent metadata for asymmetric witnessing
-- Enables differentiating primary vs observer agents in council/consult turns.
-- See docs/memory/PLAN.md section 4 for full design.

-- Default primary agent is 'luca' for backward compatibility with existing threads.
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS primary_agent_id TEXT NOT NULL DEFAULT 'luca',
  ADD COLUMN IF NOT EXISTS participating_agent_ids TEXT[] NOT NULL DEFAULT ARRAY['luca'];

-- Index for queries that filter by primary agent (frontend, sidebar grouping)
CREATE INDEX IF NOT EXISTS threads_primary_agent_idx
  ON public.threads(user_id, primary_agent_id, updated_at DESC);

-- Backfill: set primary_agent_id for any existing threads.
-- Best-effort: most existing threads were Luca-primary. If a thread used consult_anima,
-- it stays Luca-primary; participating_agent_ids should retroactively include any agents
-- that have authored messages in the thread.
UPDATE public.threads t
SET participating_agent_ids = subq.agents
FROM (
  SELECT thread_id, ARRAY_AGG(DISTINCT COALESCE(agent, 'luca')) AS agents
  FROM public.messages
  WHERE role = 'assistant'
  GROUP BY thread_id
) subq
WHERE t.id = subq.thread_id;

COMMENT ON COLUMN public.threads.primary_agent_id IS
  'The agent the user is primarily in conversation with in this thread. Used by post-turn hypomnema dispatch to determine who gets a primary-density entry vs observer-density.';

COMMENT ON COLUMN public.threads.participating_agent_ids IS
  'All agents that have participated in this thread (via consult, council, or future direct multi-agent). Updated each turn that involves additional agents.';

-- Conservative agent mislabel repair.
--
-- Run only after reviewing supabase/audits/agent-mislabel-audit.sql results.
-- This updates only rows with direct provenance:
-- - source_conversation_id joins a custom-agent thread
-- - source_context.agent_id points at a real custom agent
-- - provenance.agent_id points at a real custom agent
-- - entity_activity_log.content.agent_id points at a real custom agent
--
-- It does not repair style-only or name-marker-only candidates.

BEGIN;

CREATE TEMP TABLE agent_mislabel_repairs (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  user_id uuid NOT NULL,
  current_agent_id text NOT NULL,
  suggested_agent_id text NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (table_name, row_id)
) ON COMMIT DROP;

WITH custom_agents AS (
  SELECT user_id, id AS agent_id
  FROM public.agent_configs
  WHERE id NOT IN ('luca', 'observer', 'guardian')
    AND COALESCE(pending, false) = false
)
INSERT INTO agent_mislabel_repairs (
  table_name,
  row_id,
  user_id,
  current_agent_id,
  suggested_agent_id,
  reason
)
SELECT
  'journal_entries',
  j.id,
  j.user_id,
  j.agent_id,
  COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id),
  'source_conversation_id joins custom-agent thread'
FROM public.journal_entries j
JOIN public.threads t
  ON t.id = j.source_conversation_id
 AND t.user_id = j.user_id
JOIN custom_agents a
  ON a.user_id = j.user_id
 AND a.agent_id = COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id)
WHERE j.agent_id = 'luca'

UNION ALL

SELECT
  'memories',
  m.id,
  m.user_id,
  m.agent_id,
  COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id),
  'source_conversation_id joins custom-agent thread'
FROM public.memories m
JOIN public.threads t
  ON t.id = m.source_conversation_id
 AND t.user_id = m.user_id
JOIN custom_agents a
  ON a.user_id = m.user_id
 AND a.agent_id = COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id)
WHERE m.agent_id = 'luca'

UNION ALL

SELECT
  'engrams',
  e.id,
  e.user_id,
  e.agent_id,
  e.source_context->>'agent_id',
  'source_context.agent_id'
FROM public.engrams e
JOIN custom_agents a
  ON a.user_id = e.user_id
 AND a.agent_id = e.source_context->>'agent_id'
WHERE e.agent_id = 'luca'

UNION ALL

SELECT
  'memories',
  m.id,
  m.user_id,
  m.agent_id,
  m.provenance->>'agent_id',
  'provenance.agent_id'
FROM public.memories m
JOIN custom_agents a
  ON a.user_id = m.user_id
 AND a.agent_id = m.provenance->>'agent_id'
WHERE m.agent_id = 'luca'

UNION ALL

SELECT
  'entity_activity_log',
  l.id,
  l.user_id,
  l.agent_id,
  l.content->>'agent_id',
  'content.agent_id'
FROM public.entity_activity_log l
JOIN custom_agents a
  ON a.user_id = l.user_id
 AND a.agent_id = l.content->>'agent_id'
WHERE l.agent_id = 'luca'
ON CONFLICT DO NOTHING;

-- This result set is emitted before the updates so Lovable can report exactly
-- what the approved repair script changed.
SELECT table_name, suggested_agent_id, reason, count(*) AS rows_to_update
FROM agent_mislabel_repairs
GROUP BY table_name, suggested_agent_id, reason
ORDER BY table_name, rows_to_update DESC;

UPDATE public.journal_entries j
SET
  agent_id = r.suggested_agent_id,
  source_context = COALESCE(j.source_context, '{}'::jsonb) || jsonb_build_object(
    'agent_repair',
    jsonb_build_object(
      'from', r.current_agent_id,
      'to', r.suggested_agent_id,
      'reason', r.reason,
      'repaired_at', now()
    )
  )
FROM agent_mislabel_repairs r
WHERE r.table_name = 'journal_entries'
  AND r.row_id = j.id
  AND j.agent_id = r.current_agent_id;

UPDATE public.memories m
SET
  agent_id = r.suggested_agent_id,
  provenance = COALESCE(m.provenance, '{}'::jsonb) || jsonb_build_object(
    'agent_repair',
    jsonb_build_object(
      'from', r.current_agent_id,
      'to', r.suggested_agent_id,
      'reason', r.reason,
      'repaired_at', now()
    )
  )
FROM agent_mislabel_repairs r
WHERE r.table_name = 'memories'
  AND r.row_id = m.id
  AND m.agent_id = r.current_agent_id;

UPDATE public.engrams e
SET
  agent_id = r.suggested_agent_id,
  source_context = COALESCE(e.source_context, '{}'::jsonb) || jsonb_build_object(
    'agent_repair',
    jsonb_build_object(
      'from', r.current_agent_id,
      'to', r.suggested_agent_id,
      'reason', r.reason,
      'repaired_at', now()
    )
  )
FROM agent_mislabel_repairs r
WHERE r.table_name = 'engrams'
  AND r.row_id = e.id
  AND e.agent_id = r.current_agent_id;

UPDATE public.entity_activity_log l
SET
  agent_id = r.suggested_agent_id,
  content = COALESCE(l.content, '{}'::jsonb) || jsonb_build_object(
    'agent_repair',
    jsonb_build_object(
      'from', r.current_agent_id,
      'to', r.suggested_agent_id,
      'reason', r.reason,
      'repaired_at', now()
    )
  )
FROM agent_mislabel_repairs r
WHERE r.table_name = 'entity_activity_log'
  AND r.row_id = l.id
  AND l.agent_id = r.current_agent_id;

-- Keep connections aligned only when both endpoints now belong to the same
-- repaired custom agent. Mixed-agent links remain untouched for manual review.
UPDATE public.connections c
SET agent_id = source_e.agent_id
FROM public.engrams source_e, public.engrams target_e
WHERE c.source_id = source_e.id
  AND c.target_id = target_e.id
  AND target_e.agent_id = source_e.agent_id
  AND c.agent_id = 'luca'
  AND source_e.agent_id NOT IN ('luca', 'observer', 'guardian');

COMMIT;

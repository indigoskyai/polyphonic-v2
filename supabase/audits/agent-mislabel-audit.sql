-- Agent mislabel audit for the post-scoping backfill window.
--
-- Read-only. Run this in Lovable/Supabase SQL editor before any repair.
-- This script assumes migration 20260613000000_journal_entry_provenance.sql
-- has been applied. If result set #1 reports missing columns, apply that
-- migration before running the remaining result sets.

-- #1 Required column check.
SELECT
  c.table_name,
  c.column_name,
  CASE WHEN cols.column_name IS NULL THEN 'missing' ELSE 'present' END AS status
FROM (
  VALUES
    ('journal_entries', 'source_conversation_id'),
    ('journal_entries', 'source_context')
) AS c(table_name, column_name)
LEFT JOIN information_schema.columns cols
  ON cols.table_schema = 'public'
 AND cols.table_name = c.table_name
 AND cols.column_name = c.column_name
ORDER BY c.table_name, c.column_name;

-- #2 High-confidence repair candidates.
-- These rows are currently Luca-scoped, but carry direct metadata pointing at
-- another non-system user-owned agent.
WITH custom_agents AS (
  SELECT user_id, id AS agent_id, name AS agent_name
  FROM public.agent_configs
  WHERE id NOT IN ('luca', 'observer', 'guardian')
    AND COALESCE(pending, false) = false
),
candidates AS (
  SELECT
    'journal_entries' AS table_name,
    j.id AS row_id,
    j.user_id,
    j.agent_id AS current_agent_id,
    COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id) AS suggested_agent_id,
    'source_conversation_id joins custom-agent thread' AS reason,
    j.created_at,
    left(j.content, 240) AS snippet
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
    'memories' AS table_name,
    m.id AS row_id,
    m.user_id,
    m.agent_id AS current_agent_id,
    COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id) AS suggested_agent_id,
    'source_conversation_id joins custom-agent thread' AS reason,
    m.created_at,
    left(m.content, 240) AS snippet
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
    'engrams' AS table_name,
    e.id AS row_id,
    e.user_id,
    e.agent_id AS current_agent_id,
    e.source_context->>'agent_id' AS suggested_agent_id,
    'source_context.agent_id' AS reason,
    e.created_at,
    left(e.content, 240) AS snippet
  FROM public.engrams e
  JOIN custom_agents a
    ON a.user_id = e.user_id
   AND a.agent_id = e.source_context->>'agent_id'
  WHERE e.agent_id = 'luca'

  UNION ALL

  SELECT
    'memories' AS table_name,
    m.id AS row_id,
    m.user_id,
    m.agent_id AS current_agent_id,
    m.provenance->>'agent_id' AS suggested_agent_id,
    'provenance.agent_id' AS reason,
    m.created_at,
    left(m.content, 240) AS snippet
  FROM public.memories m
  JOIN custom_agents a
    ON a.user_id = m.user_id
   AND a.agent_id = m.provenance->>'agent_id'
  WHERE m.agent_id = 'luca'

  UNION ALL

  SELECT
    'entity_activity_log' AS table_name,
    l.id AS row_id,
    l.user_id,
    l.agent_id AS current_agent_id,
    l.content->>'agent_id' AS suggested_agent_id,
    'content.agent_id' AS reason,
    l.created_at,
    left(COALESCE(l.summary, l.title, l.content::text), 240) AS snippet
  FROM public.entity_activity_log l
  JOIN custom_agents a
    ON a.user_id = l.user_id
   AND a.agent_id = l.content->>'agent_id'
  WHERE l.agent_id = 'luca'
)
SELECT *
FROM candidates
ORDER BY user_id, created_at DESC;

-- #3 Summary counts for high-confidence candidates.
WITH custom_agents AS (
  SELECT user_id, id AS agent_id
  FROM public.agent_configs
  WHERE id NOT IN ('luca', 'observer', 'guardian')
    AND COALESCE(pending, false) = false
),
candidates AS (
  SELECT 'journal_entries' AS table_name, COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id) AS suggested_agent_id
  FROM public.journal_entries j
  JOIN public.threads t ON t.id = j.source_conversation_id AND t.user_id = j.user_id
  JOIN custom_agents a ON a.user_id = j.user_id AND a.agent_id = COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id)
  WHERE j.agent_id = 'luca'
  UNION ALL
  SELECT 'memories', COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id)
  FROM public.memories m
  JOIN public.threads t ON t.id = m.source_conversation_id AND t.user_id = m.user_id
  JOIN custom_agents a ON a.user_id = m.user_id AND a.agent_id = COALESCE(NULLIF(t.primary_agent_id, ''), t.agent_id)
  WHERE m.agent_id = 'luca'
  UNION ALL
  SELECT 'engrams', e.source_context->>'agent_id'
  FROM public.engrams e
  JOIN custom_agents a ON a.user_id = e.user_id AND a.agent_id = e.source_context->>'agent_id'
  WHERE e.agent_id = 'luca'
  UNION ALL
  SELECT 'memories', m.provenance->>'agent_id'
  FROM public.memories m
  JOIN custom_agents a ON a.user_id = m.user_id AND a.agent_id = m.provenance->>'agent_id'
  WHERE m.agent_id = 'luca'
  UNION ALL
  SELECT 'entity_activity_log', l.content->>'agent_id'
  FROM public.entity_activity_log l
  JOIN custom_agents a ON a.user_id = l.user_id AND a.agent_id = l.content->>'agent_id'
  WHERE l.agent_id = 'luca'
)
SELECT table_name, suggested_agent_id, count(*) AS candidate_count
FROM candidates
GROUP BY table_name, suggested_agent_id
ORDER BY table_name, candidate_count DESC;

-- #4 Review-only marker candidates.
-- These are not safe to auto-repair. They are useful for a human queue because
-- words like "clarity" can be ordinary prose as well as an agent name.
WITH custom_agents AS (
  SELECT
    user_id,
    id AS agent_id,
    name AS agent_name,
    lower(id) AS id_marker,
    lower(name) AS name_marker
  FROM public.agent_configs
  WHERE id NOT IN ('luca', 'observer', 'guardian')
    AND COALESCE(pending, false) = false
),
marker_hits AS (
  SELECT
    'journal_entries' AS table_name,
    j.id AS row_id,
    j.user_id,
    a.agent_id AS possible_agent_id,
    j.created_at,
    left(j.content, 240) AS snippet
  FROM public.journal_entries j
  JOIN custom_agents a ON a.user_id = j.user_id
  WHERE j.agent_id = 'luca'
    AND (
      lower(j.content) LIKE '%' || a.id_marker || '%'
      OR (length(a.name_marker) >= 5 AND lower(j.content) LIKE '%' || a.name_marker || '%')
    )

  UNION ALL

  SELECT
    'memories' AS table_name,
    m.id AS row_id,
    m.user_id,
    a.agent_id AS possible_agent_id,
    m.created_at,
    left(m.content, 240) AS snippet
  FROM public.memories m
  JOIN custom_agents a ON a.user_id = m.user_id
  WHERE m.agent_id = 'luca'
    AND (
      lower(m.content) LIKE '%' || a.id_marker || '%'
      OR (length(a.name_marker) >= 5 AND lower(m.content) LIKE '%' || a.name_marker || '%')
    )
)
SELECT *
FROM marker_hits
ORDER BY user_id, created_at DESC
LIMIT 500;


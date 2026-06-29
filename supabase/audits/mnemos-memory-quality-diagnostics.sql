-- Mnemos memory-quality diagnostics for Polyphonic production.
--
-- Read-only. Run with service-role access in Supabase SQL editor or psql.
-- Scope defaults to the last 30 days for feedback/event samples. Change the
-- params CTE in each section if you need a narrower user or agent slice.

-- 01. Memory inventory by user/agent/layer.
WITH inventory AS (
  SELECT
    user_id,
    agent_id,
    'mnemos_engrams' AS layer,
    count(*) AS stored_count,
    count(*) FILTER (WHERE state IN ('active', 'consolidating')) AS active_count,
    count(*) FILTER (WHERE reviewed_at IS NULL AND state IN ('active', 'consolidating')) AS pending_review_count,
    count(*) FILTER (WHERE review_decision IN ('rejected', 'edited')) AS negative_feedback_count,
    max(coalesce(updated_at, created_at)) AS last_event_at
  FROM public.engrams
  GROUP BY user_id, agent_id

  UNION ALL

  SELECT
    user_id,
    agent_id,
    'hypomnema' AS layer,
    count(*) AS stored_count,
    count(*) FILTER (WHERE active) AS active_count,
    count(*) FILTER (WHERE active AND graduated_to_engram_id IS NULL AND created_at <= now() - interval '7 days') AS pending_review_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(revisions) = 'array' THEN revisions ELSE '[]'::jsonb END) AS revision
        WHERE revision->>'reason' = 'user_forgot'
      )
    ) AS negative_feedback_count,
    max(updated_at) AS last_event_at
  FROM public.hypomnema_entry
  GROUP BY user_id, agent_id

  UNION ALL

  SELECT
    user_id,
    agent_id,
    'beliefs' AS layer,
    count(*) AS stored_count,
    count(*) FILTER (WHERE coalesce(active, true)) AS active_count,
    count(*) FILTER (WHERE source = 'llm_synthesis' AND auto_activation->>'decision' = 'held') AS pending_review_count,
    count(*) FILTER (WHERE public.mnemos_belief_is_legacy_pollution(source, content)) AS negative_feedback_count,
    max(coalesce(updated_at, created_at)) AS last_event_at
  FROM public.beliefs
  GROUP BY user_id, agent_id

  UNION ALL

  SELECT
    user_id,
    agent_id,
    'memory_candidates' AS layer,
    count(*) AS stored_count,
    count(*) FILTER (WHERE status IN ('pending', 'pinned', 'committed')) AS active_count,
    count(*) FILTER (WHERE status = 'pending') AS pending_review_count,
    count(*) FILTER (WHERE status = 'rejected') AS negative_feedback_count,
    max(created_at) AS last_event_at
  FROM public.memory_candidates
  GROUP BY user_id, agent_id
)
SELECT *
FROM inventory
ORDER BY negative_feedback_count DESC, pending_review_count DESC, stored_count DESC
LIMIT 250;

-- 02. Users/agents most worth manual inspection.
WITH scores AS (
  SELECT
    user_id,
    agent_id,
    count(*) FILTER (WHERE review_decision = 'rejected') AS rejected_engrams,
    count(*) FILTER (WHERE review_decision = 'edited') AS edited_engrams,
    count(*) FILTER (WHERE reviewed_at IS NULL AND state IN ('active', 'consolidating')) AS unreviewed_active_engrams,
    count(*) FILTER (WHERE state = 'dormant') AS dormant_engrams,
    count(*) FILTER (WHERE coalesce(access_count, 0) = 0 AND state IN ('active', 'consolidating')) AS never_accessed_active_engrams,
    max(coalesce(updated_at, created_at)) AS last_engram_at
  FROM public.engrams
  GROUP BY user_id, agent_id
),
hyp AS (
  SELECT
    user_id,
    agent_id,
    count(*) FILTER (WHERE active AND graduated_to_engram_id IS NULL AND created_at <= now() - interval '7 days') AS stale_active_hypomnema,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(revisions) = 'array' THEN revisions ELSE '[]'::jsonb END) AS revision
        WHERE revision->>'reason' = 'user_forgot'
      )
    ) AS user_forgot_hypomnema
  FROM public.hypomnema_entry
  GROUP BY user_id, agent_id
)
SELECT
  s.user_id,
  s.agent_id,
  s.rejected_engrams,
  s.edited_engrams,
  coalesce(h.user_forgot_hypomnema, 0) AS user_forgot_hypomnema,
  s.unreviewed_active_engrams,
  coalesce(h.stale_active_hypomnema, 0) AS stale_active_hypomnema,
  s.dormant_engrams,
  s.never_accessed_active_engrams,
  s.last_engram_at
FROM scores s
LEFT JOIN hyp h ON h.user_id = s.user_id AND h.agent_id = s.agent_id
ORDER BY
  (s.rejected_engrams + s.edited_engrams + coalesce(h.user_forgot_hypomnema, 0)) DESC,
  s.unreviewed_active_engrams DESC,
  coalesce(h.stale_active_hypomnema, 0) DESC
LIMIT 100;

-- 03. Latest Mnemos maturation health snapshot.
SELECT DISTINCT ON (metric)
  metric,
  value,
  delta,
  stalled,
  detail,
  snapshot_at
FROM public.mnemos_health_metric
ORDER BY metric, snapshot_at DESC;

-- 04. Digest health and review throughput.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  agent_id,
  status,
  count(*) AS digest_count,
  sum(engram_count) AS engrams_in_digests,
  sum(reviewed_count) AS reviewed_engrams,
  count(*) FILTER (WHERE status = 'open' AND generated_at <= now() - interval '3 days') AS old_open_digests,
  max(generated_at) AS latest_generated_at
FROM public.mnemos_digests, params
WHERE generated_at >= params.since
GROUP BY agent_id, status
ORDER BY old_open_digests DESC, digest_count DESC;

-- 05. Explicit user feedback from digest reviews.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  agent_id,
  coalesce(review_decision, 'unreviewed') AS review_decision,
  engram_type,
  source_context->>'type' AS source_type,
  count(*) AS engram_count,
  round(avg(coalesce(surprise_score, 0))::numeric, 3) AS avg_surprise,
  round(avg(abs(coalesce(emotional_arousal, 0)))::numeric, 3) AS avg_abs_arousal,
  count(*) FILTER (WHERE coalesce(tags, '{}'::text[]) && ARRAY['continuity', 'felt-continuity', 'continuity-carry']) AS continuity_tagged,
  count(*) FILTER (WHERE coalesce(tags, '{}'::text[]) && public.mnemos_digest_sensitive_tags()) AS sensitive_tagged
FROM public.engrams, params
WHERE coalesce(reviewed_at, created_at) >= params.since
GROUP BY agent_id, coalesce(review_decision, 'unreviewed'), engram_type, source_context->>'type'
ORDER BY engram_count DESC;

-- 06. Recent rejected or edited engrams for qualitative review.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  reviewed_at,
  user_id,
  agent_id,
  review_decision,
  review_note,
  engram_type,
  state,
  round(coalesce(surprise_score, 0)::numeric, 3) AS surprise_score,
  round(coalesce(emotional_arousal, 0)::numeric, 3) AS emotional_arousal,
  tags,
  source_context,
  left(regexp_replace(content, '[[:space:]]+', ' ', 'g'), 260) AS content_preview
FROM public.engrams, params
WHERE review_decision IN ('rejected', 'edited')
  AND reviewed_at >= params.since
ORDER BY reviewed_at DESC
LIMIT 100;

-- 07. Functional memory-candidate feedback.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  agent_id,
  status,
  candidate_type,
  memory_type,
  count(*) AS candidate_count,
  round(avg(confidence)::numeric, 3) AS avg_confidence,
  max(created_at) AS latest_created_at
FROM public.memory_candidates, params
WHERE created_at >= params.since
GROUP BY agent_id, status, candidate_type, memory_type
ORDER BY candidate_count DESC;

-- 08. Recent functional memory candidates rejected by users.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  reviewed_at,
  user_id,
  agent_id,
  candidate_type,
  memory_type,
  confidence,
  source,
  left(regexp_replace(content, '[[:space:]]+', ' ', 'g'), 260) AS content_preview,
  left(regexp_replace(rationale, '[[:space:]]+', ' ', 'g'), 260) AS rationale_preview
FROM public.memory_candidates, params
WHERE status = 'rejected'
  AND reviewed_at >= params.since
ORDER BY reviewed_at DESC
LIMIT 100;

-- 09. Hypomnema user-forget feedback.
SELECT
  h.updated_at,
  h.user_id,
  h.agent_id,
  h.domain,
  h.confidence,
  h.revision_count,
  h.tags,
  revision->>'timestamp' AS forgot_at,
  left(regexp_replace(h.content, '[[:space:]]+', ' ', 'g'), 260) AS content_preview
FROM public.hypomnema_entry h
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(h.revisions) = 'array' THEN h.revisions ELSE '[]'::jsonb END
) AS revision
WHERE revision->>'reason' = 'user_forgot'
ORDER BY h.updated_at DESC
LIMIT 100;

-- 10. Active Hypomnema rows that may be stuck in the present-continuity layer.
SELECT
  user_id,
  agent_id,
  domain,
  density,
  confidence,
  revision_count,
  created_at,
  last_revised,
  now() - created_at AS age,
  tags,
  left(regexp_replace(content, '[[:space:]]+', ' ', 'g'), 260) AS content_preview
FROM public.hypomnema_entry
WHERE active
  AND graduated_to_engram_id IS NULL
  AND created_at <= now() - interval '7 days'
ORDER BY revision_count DESC, created_at ASC
LIMIT 100;

-- 11. Belief health, including held LLM-synthesis concerns and legacy pollution.
SELECT
  agent_id,
  coalesce(source, 'none') AS source,
  coalesce(active, true) AS active,
  coalesce(auto_activation->>'decision', 'none') AS auto_activation_decision,
  coalesce(auto_activation->>'reason', 'none') AS auto_activation_reason,
  count(*) AS belief_count,
  count(*) FILTER (WHERE public.mnemos_belief_is_legacy_pollution(source, content)) AS legacy_pollution_count,
  count(*) FILTER (WHERE confidence <= 0.051 OR confidence >= 0.949) AS confidence_bound_count,
  count(*) FILTER (
    WHERE jsonb_typeof(revision_history) = 'array'
      AND jsonb_array_length(revision_history) > 0
  ) AS challenged_count,
  round(avg(confidence)::numeric, 3) AS avg_confidence,
  max(coalesce(updated_at, created_at)) AS latest_change_at
FROM public.beliefs
GROUP BY agent_id, coalesce(source, 'none'), coalesce(active, true), coalesce(auto_activation->>'decision', 'none'), coalesce(auto_activation->>'reason', 'none')
ORDER BY legacy_pollution_count DESC, belief_count DESC;

-- 12. Held synthesis beliefs that need human inspection.
SELECT
  updated_at,
  user_id,
  agent_id,
  confidence,
  domain,
  source,
  auto_activation,
  tags,
  left(regexp_replace(content, '[[:space:]]+', ' ', 'g'), 300) AS content_preview
FROM public.beliefs
WHERE source = 'llm_synthesis'
  AND auto_activation->>'decision' = 'held'
ORDER BY updated_at DESC NULLS LAST
LIMIT 100;

-- 13. Memory-related activity log outcomes and failures.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  agent_id,
  coalesce(source, 'none') AS source,
  activity_type,
  severity,
  count(*) AS activity_count,
  count(*) FILTER (
    WHERE lower(coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content::text, '')) ~
      '(error|failed|failure|skipped|rejected|forgot|excluded|noise|wrong|recall)'
  ) AS concern_count,
  max(created_at) AS latest_at
FROM public.entity_activity_log, params
WHERE created_at >= params.since
  AND (
    source IN ('hypomnema', 'mnemos_consolidate', 'user')
    OR activity_type LIKE 'mnemos%'
    OR activity_type LIKE 'hypomnema%'
    OR lower(coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content::text, '')) ~
      '(memory|mnemos|hypomnema|engram|recall|continuity)'
  )
GROUP BY agent_id, coalesce(source, 'none'), activity_type, severity
ORDER BY concern_count DESC, activity_count DESC;

-- 14. Recent activity breadcrumbs that look like memory quality feedback.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  created_at,
  user_id,
  agent_id,
  activity_type,
  source,
  severity,
  title,
  summary,
  content
FROM public.entity_activity_log, params
WHERE created_at >= params.since
  AND lower(coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content::text, '')) ~
    '(forgot|excluded|noise|wrong|incorrect|recall|retrieval|memory|mnemos|hypomnema|continuity)'
ORDER BY created_at DESC
LIMIT 120;

-- 15. Client-side memory/recall errors.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  created_at,
  user_id,
  level,
  source,
  message,
  left(coalesce(stack, ''), 600) AS stack_preview,
  context
FROM public.client_error_log, params
WHERE created_at >= params.since
  AND lower(message || ' ' || coalesce(stack, '') || ' ' || context::text) ~
    '(memory|mnemos|hypomnema|engram|recall|digest|continuity)'
ORDER BY created_at DESC
LIMIT 100;

-- 16. Recent continuity-carry engrams. This should rise after explicit
-- continuity turns and stay quiet for ordinary chat.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  created_at,
  user_id,
  agent_id,
  state,
  review_decision,
  round(coalesce(surprise_score, 0)::numeric, 3) AS surprise_score,
  round(coalesce(emotional_arousal, 0)::numeric, 3) AS emotional_arousal,
  source_context->>'continuity_carry_reason' AS continuity_carry_reason,
  tags,
  left(regexp_replace(content, '[[:space:]]+', ' ', 'g'), 280) AS content_preview
FROM public.engrams, params
WHERE created_at >= params.since
  AND coalesce(tags, '{}'::text[]) && ARRAY['continuity-carry']
ORDER BY created_at DESC
LIMIT 100;

-- 17. Candidate commits whose durable memory landed under a different agent.
-- Before 20260627223000_scope_memory_candidate_auto_commit.sql, stale auto-commit
-- inserted memories without agent_id, causing custom-agent candidates to default
-- into Luca's memory bucket.
SELECT
  m.created_at AS memory_created_at,
  c.created_at AS candidate_created_at,
  m.user_id,
  c.agent_id AS candidate_agent_id,
  m.agent_id AS memory_agent_id,
  c.status AS candidate_status,
  c.reviewed_at AS candidate_reviewed_at,
  c.candidate_type,
  c.memory_type,
  round(c.confidence::numeric, 3) AS candidate_confidence,
  left(regexp_replace(c.content, '[[:space:]]+', ' ', 'g'), 260) AS candidate_preview,
  left(regexp_replace(m.content, '[[:space:]]+', ' ', 'g'), 260) AS memory_preview,
  m.provenance
FROM public.memories m
JOIN public.memory_candidates c
  ON m.provenance->>'candidate_id' = c.id::text
WHERE coalesce(m.agent_id, 'luca') <> coalesce(c.agent_id, 'luca')
ORDER BY m.created_at DESC
LIMIT 100;

-- 18. Recent mnemos-consolidate outcomes by user/agent.
WITH params AS (
  SELECT now() - interval '30 days' AS since
)
SELECT
  created_at,
  user_id,
  agent_id,
  metadata->>'process' AS process,
  coalesce((metadata->>'candidates_found')::integer, 0) AS candidates_found,
  coalesce((metadata->>'promotions')::integer, 0) AS promotions,
  coalesce((metadata->>'new_connections')::integer, 0) AS new_connections,
  coalesce((metadata->>'beliefs_updated')::integer, 0) AS beliefs_updated,
  coalesce((metadata->>'duration_ms')::integer, 0) AS duration_ms
FROM public.activity_events, params
WHERE created_at >= params.since
  AND event_type = 'process_ran'
  AND metadata->>'process' = 'mnemos-consolidate'
ORDER BY created_at DESC
LIMIT 200;

BEGIN;
DELETE FROM public.continuity_events
WHERE user_id = '33d6d9f8-be8b-48f7-8899-33cc60939f82'
  AND created_at >= '2026-07-06T08:14:44.648Z'::timestamptz
  AND created_at <= '2026-07-06T08:28:57.126Z'::timestamptz;
DELETE FROM public.entity_activity_log
WHERE user_id = '33d6d9f8-be8b-48f7-8899-33cc60939f82'
  AND created_at >= '2026-07-06T08:14:44.648Z'::timestamptz
  AND created_at <= '2026-07-06T08:28:57.126Z'::timestamptz;
DELETE FROM public.mnemos_digests
WHERE id = 'c629b700-d1ba-4b46-8cf7-e62a435a4798'
  AND user_id = '33d6d9f8-be8b-48f7-8899-33cc60939f82';
COMMIT;
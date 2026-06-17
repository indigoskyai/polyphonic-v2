BEGIN;

CREATE TABLE IF NOT EXISTS public.account_portability_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('export', 'import')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'previewed', 'completed', 'failed', 'rolled_back')),
  archive_version integer NOT NULL DEFAULT 1,
  archive_hash text,
  file_name text,
  storage_bucket text,
  storage_path text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview jsonb,
  manifest jsonb,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.account_portability_jobs TO authenticated;
GRANT ALL ON public.account_portability_jobs TO service_role;

CREATE INDEX IF NOT EXISTS account_portability_jobs_user_created_idx
  ON public.account_portability_jobs(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_portability_import_hash_uidx
  ON public.account_portability_jobs(user_id, archive_hash)
  WHERE direction = 'import' AND archive_hash IS NOT NULL AND status IN ('processing', 'previewed', 'completed');

ALTER TABLE public.account_portability_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own portability jobs" ON public.account_portability_jobs;
CREATE POLICY "Users can read own portability jobs"
  ON public.account_portability_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access account_portability_jobs" ON public.account_portability_jobs;
CREATE POLICY "Service role full access account_portability_jobs"
  ON public.account_portability_jobs AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.account_portability_row_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.account_portability_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  table_name text NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL,
  source_agent_id text,
  target_agent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, table_name, source_id)
);

GRANT SELECT ON public.account_portability_row_map TO authenticated;
GRANT ALL ON public.account_portability_row_map TO service_role;

CREATE INDEX IF NOT EXISTS account_portability_row_map_user_job_idx
  ON public.account_portability_row_map(user_id, job_id, table_name);

ALTER TABLE public.account_portability_row_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own portability row maps" ON public.account_portability_row_map;
CREATE POLICY "Users can read own portability row maps"
  ON public.account_portability_row_map FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access account_portability_row_map" ON public.account_portability_row_map;
CREATE POLICY "Service role full access account_portability_row_map"
  ON public.account_portability_row_map AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users read own account portability archives" ON storage.objects;
CREATE POLICY "users read own account portability archives"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'account-portability'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "users delete own account portability archives" ON storage.objects;
CREATE POLICY "users delete own account portability archives"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'account-portability'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "service role full access account portability archives" ON storage.objects;
CREATE POLICY "service role full access account portability archives"
  ON storage.objects AS PERMISSIVE FOR ALL TO service_role
  USING (bucket_id = 'account-portability')
  WITH CHECK (bucket_id = 'account-portability');

COMMIT;
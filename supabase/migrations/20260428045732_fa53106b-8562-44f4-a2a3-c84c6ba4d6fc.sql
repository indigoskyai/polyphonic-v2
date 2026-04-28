-- Phase 1: OpenClaw realtime backend

-- Ensure pgcrypto for token hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1.1 openclaw_jobs table
CREATE TABLE IF NOT EXISTS public.openclaw_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  agent_config_id text,
  thread_id uuid,
  kind text NOT NULL CHECK (kind IN ('completion','deploy_spec','health_ping','mcp_test')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','timeout')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_openclaw_jobs_device_status_created
  ON public.openclaw_jobs (device_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_openclaw_jobs_user_created
  ON public.openclaw_jobs (user_id, created_at DESC);

ALTER TABLE public.openclaw_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access openclaw_jobs"
  ON public.openclaw_jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own openclaw jobs"
  ON public.openclaw_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- 1.2 device_token_hash on openclaw_devices
ALTER TABLE public.openclaw_devices
  ADD COLUMN IF NOT EXISTS device_token_hash text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_openclaw_devices_token_hash
  ON public.openclaw_devices (device_token_hash);

-- Helper: verify a device token (cleartext) against a stored hash.
-- Uses sha256 of (device_id || ':' || token) so two devices with same
-- token generate distinct hashes (defense in depth).
CREATE OR REPLACE FUNCTION public.openclaw_verify_device_token(
  p_device_id uuid,
  p_token text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.openclaw_devices
    WHERE id = p_device_id
      AND status <> 'revoked'
      AND device_token_hash = encode(
        digest(p_device_id::text || ':' || p_token, 'sha256'),
        'hex'
      )
  );
$$;

-- OpenClaw devices: one row per paired machine
CREATE TABLE public.openclaw_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  platform text,
  bridge_version text,
  status text NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.openclaw_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own openclaw devices" ON public.openclaw_devices
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access openclaw_devices" ON public.openclaw_devices
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_openclaw_devices_user ON public.openclaw_devices(user_id);
CREATE TRIGGER trg_openclaw_devices_updated
  BEFORE UPDATE ON public.openclaw_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pairing codes: short-lived 6-digit codes the helper CLI uses to claim a device
CREATE TABLE public.openclaw_pairing_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_device_id uuid REFERENCES public.openclaw_devices(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.openclaw_pairing_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own pairing codes" ON public.openclaw_pairing_codes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access openclaw_pairing_codes" ON public.openclaw_pairing_codes
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_openclaw_pairing_codes_user ON public.openclaw_pairing_codes(user_id);

-- Agent specs synced to local runtime
CREATE TABLE public.openclaw_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_config_id text NOT NULL,
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  spec_version int NOT NULL DEFAULT 1,
  sync_history boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_config_id)
);
ALTER TABLE public.openclaw_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own openclaw agents" ON public.openclaw_agents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access openclaw_agents" ON public.openclaw_agents
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_openclaw_agents_user ON public.openclaw_agents(user_id);
CREATE TRIGGER trg_openclaw_agents_updated
  BEFORE UPDATE ON public.openclaw_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ephemeral relay sessions (debugging / observability)
CREATE TABLE public.openclaw_relay_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES public.openclaw_devices(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.openclaw_relay_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own relay sessions" ON public.openclaw_relay_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access openclaw_relay_sessions" ON public.openclaw_relay_sessions
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_openclaw_relay_sessions_device ON public.openclaw_relay_sessions(device_id);

-- Mark agent_configs rows as locally-routed
ALTER TABLE public.agent_configs
  ADD COLUMN openclaw_agent_id uuid REFERENCES public.openclaw_agents(id) ON DELETE SET NULL,
  ADD COLUMN preferred_device_id uuid REFERENCES public.openclaw_devices(id) ON DELETE SET NULL;
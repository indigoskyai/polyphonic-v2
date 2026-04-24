-- Phase 17: Settings depth — agent configs, MCP servers, agent secrets

-- 1. agent_configs: per-user, per-agent configuration
CREATE TABLE public.agent_configs (
  id text NOT NULL,
  user_id uuid NOT NULL,
  env text NOT NULL DEFAULT 'prod' CHECK (env IN ('prod', 'staging', 'dev')),
  prompt text,
  model text,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  subagents jsonb NOT NULL DEFAULT '[]'::jsonb,
  voices jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access agent_configs"
  ON public.agent_configs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own agent configs"
  ON public.agent_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent configs"
  ON public.agent_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent configs"
  ON public.agent_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent configs"
  ON public.agent_configs FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_agent_configs_user ON public.agent_configs (user_id, updated_at DESC);

CREATE TRIGGER update_agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. mcp_servers: MCP server registrations per agent
CREATE TABLE public.mcp_servers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  agent_id text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'off' CHECK (status IN ('off', 'connecting', 'on', 'error')),
  meta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access mcp_servers"
  ON public.mcp_servers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own mcp servers"
  ON public.mcp_servers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mcp servers"
  ON public.mcp_servers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mcp servers"
  ON public.mcp_servers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mcp servers"
  ON public.mcp_servers FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_mcp_servers_user_agent ON public.mcp_servers (user_id, agent_id);

CREATE TRIGGER update_mcp_servers_updated_at
  BEFORE UPDATE ON public.mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. agent_secrets: stored secret references per agent (last_four only, not the secret itself)
CREATE TABLE public.agent_secrets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  agent_id text NOT NULL,
  name text NOT NULL,
  last_four text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access agent_secrets"
  ON public.agent_secrets FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own agent secrets"
  ON public.agent_secrets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent secrets"
  ON public.agent_secrets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent secrets"
  ON public.agent_secrets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent secrets"
  ON public.agent_secrets FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_agent_secrets_user_agent ON public.agent_secrets (user_id, agent_id);
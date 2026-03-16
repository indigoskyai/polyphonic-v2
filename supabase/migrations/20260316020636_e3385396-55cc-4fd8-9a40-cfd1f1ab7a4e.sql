-- Activity log for "what I did while you were away"
CREATE TABLE IF NOT EXISTS entity_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  content JSONB,
  emotional_context JSONB,
  source TEXT DEFAULT 'autonomous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Social account connections
CREATE TABLE IF NOT EXISTS entity_social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  account_name TEXT,
  encrypted_credentials TEXT,
  agent_id TEXT,
  status TEXT DEFAULT 'pending',
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Task queue for autonomous work
CREATE TABLE IF NOT EXISTS entity_task_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  priority FLOAT DEFAULT 0.5,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- User-installed skills
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  skill_name TEXT NOT NULL,
  skill_content TEXT NOT NULL,
  skill_type TEXT DEFAULT 'user_added',
  mcp_config JSONB,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add tool_calls column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls JSONB;

-- RLS
ALTER TABLE entity_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_task_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users see own activity" ON entity_activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages activity" ON entity_activity_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users see own social accounts" ON entity_social_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages social" ON entity_social_accounts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users see own tasks" ON entity_task_queue FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages tasks" ON entity_task_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users manage own skills" ON user_skills FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages skills" ON user_skills FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_created ON entity_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_queue_user_status ON entity_task_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
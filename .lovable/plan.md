

## Plan: Run Migration + Deploy Edge Functions

### 1. Run migration `20260315070000_v1_agent_platform.sql`
Creates 4 new tables (`entity_activity_log`, `entity_social_accounts`, `entity_task_queue`, `user_skills`) with RLS policies, indexes, and adds `tool_calls JSONB` column to `messages`.

### 2. Deploy edge functions
Deploy the 3 new functions (`anima-web-search`, `anima-web-read`, `anima-image-create`) plus redeploy the updated `chat` function with tool-calling capability.

All functions are already registered in `config.toml`. No code or config changes needed.


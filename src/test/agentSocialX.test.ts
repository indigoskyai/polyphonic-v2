import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('agent X channel integration', () => {
  const migration = readRepoFile('supabase/migrations/20260629103000_agent_social_x_channels.sql');
  const cronMigration = readRepoFile('supabase/migrations/20260629113000_agent_social_x_autopilot_cron.sql');
  const helper = readRepoFile('supabase/functions/_shared/social-x.ts');
  const oauthStart = readRepoFile('supabase/functions/agent-social-x-oauth-start/index.ts');
  const oauthCallback = readRepoFile('supabase/functions/agent-social-x-oauth-callback/index.ts');
  const channel = readRepoFile('supabase/functions/agent-social-x-channel/index.ts');
  const autopilot = readRepoFile('supabase/functions/agent-social-x-autopilot/index.ts');
  const config = readRepoFile('supabase/config.toml');
  const store = readRepoFile('src/stores/agentSocialChannelStore.ts');
  const panel = readRepoFile('src/components/settings/AgentXChannel.tsx');
  const detail = readRepoFile('src/pages/settings/AgentDetail.tsx');

  it('adds per-agent social channel schema without exposing raw X tokens to RLS users', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_social_channels');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_social_channel_credentials');
    expect(migration).toContain('encrypted_access_token text NOT NULL');
    expect(migration).toContain('encrypted_refresh_token text');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_social_posts');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_social_credit_ledger');
    expect(migration).toContain('CONSTRAINT agent_social_channels_unique_agent_platform UNIQUE (user_id, agent_id, platform)');
    expect(migration).toContain('Service role manages agent social credentials');
    expect(migration).not.toMatch(/\baccess_token text\b/i);
    expect(migration).not.toMatch(/\brefresh_token text\b/i);
  });

  it('uses official X OAuth with PKCE and encrypted server-side token storage', () => {
    expect(helper).toContain('"tweet.write"');
    expect(helper).toContain('"offline.access"');
    expect(helper).toContain('pkceChallenge');
    expect(helper).toContain('encryptSocialToken');
    expect(helper).toContain('SOCIAL_TOKEN_ENCRYPTION_KEY');
    expect(oauthStart).toContain('code_challenge_method');
    expect(oauthStart).toContain('agent-social-x-oauth-callback');
    expect(oauthCallback).toContain('X_TOKEN_URL');
    expect(oauthCallback).toContain('X_API_BASE}/users/me');
    expect(oauthCallback).toContain('encrypted_access_token');
  });

  it('guards posting with connection, compliance, approval, rate budget, and credits', () => {
    expect(channel).toContain('policyAllowsPosting');
    expect(channel).toContain('posting_enabled');
    expect(channel).toContain('explicit_approval');
    expect(channel).toContain('Insufficient social posting credits');
    expect(channel).toContain('Daily social posting credit limit reached');
    expect(channel).toContain('agent_social_credit_ledger');
    expect(channel).toContain('post_debit');
    expect(channel).toContain('POST');
    expect(channel).toContain('${X_API_BASE}/tweets');
  });

  it('includes a real autonomous posting worker rather than only a draft composer', () => {
    expect(config).toContain('[functions.agent-social-x-autopilot]');
    expect(cronMigration).toContain("cron.schedule");
    expect(cronMigration).toContain("'*/5 * * * *'");
    expect(cronMigration).toContain("public.invoke_edge_function");
    expect(cronMigration).toContain("'agent-social-x-autopilot'");
    expect(autopilot).toContain('authorizeCronOrSelf(req');
    expect(autopilot).toContain('trackCronJob("agent-social-x-autopilot"');
    expect(autopilot).toContain('resolveOpenRouterKeyForUser');
    expect(autopilot).toContain('buildCustomAgentSystemPrompt');
    expect(autopilot).toContain('openRouterChat');
    expect(autopilot).toContain('runAutonomousTurn');
    expect(autopilot).toContain('cadence_per_day');
    expect(autopilot).toContain('policyAllowsPosting');
    expect(autopilot).toContain('agent_social_credit_balance');
    expect(autopilot).toContain('approval_mode !== "autopilot"');
    expect(autopilot).toContain('agent_social_credit_ledger');
    expect(autopilot).toContain('source: "post_debit"');
    expect(autopilot).toContain('${X_API_BASE}/tweets');
  });

  it('exposes a no-code agent settings surface for X connection and policy', () => {
    expect(store).toContain("agent-social-x-oauth-start");
    expect(store).toContain("agent-social-x-channel");
    expect(store).toContain("agent-social-x-autopilot");
    expect(store).toContain("runXAutopilot");
    expect(panel).toContain('Connect X');
    expect(panel).toContain('Autonomous posting');
    expect(panel).toContain('Run autonomy check');
    expect(panel).toContain('Acknowledge X automation rules');
    expect(panel).toContain('Subscription credits');
    expect(panel).toContain('$MNEMOS credits');
    expect(panel).toContain('Manual test draft');
    expect(panel).toContain('Post now');
    expect(detail).toContain('<AgentXChannel agentId={agent.id} agentName={agent.name} />');
  });
});

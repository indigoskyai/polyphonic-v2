import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('feature-based token access', () => {
  it('does not use token verification as a route-wide app gate', () => {
    const app = readRepoFile('src/App.tsx');

    expect(app).not.toContain('import AuthGate');
    expect(app).not.toContain('<AuthGate>');
    expect(app).toContain('return <>{children}</>');
    expect(app).toContain('hydrateTokenGate');
  });

  it('keeps additional custom-agent creation behind the temporary token entitlement', () => {
    const helper = readRepoFile('supabase/functions/_shared/custom-agent-entitlements.ts');
    const configSave = readRepoFile('supabase/functions/agent-config-save/index.ts');
    const forge = readRepoFile('supabase/functions/agent-forge/index.ts');

    expect(helper).toContain('FREE_CUSTOM_AGENT_LIMIT = 1');
    expect(helper).toContain('CUSTOM_AGENT_LIMIT_MESSAGE');
    expect(helper).toContain('token_gate_verifications');
    expect(helper).toContain('token_gate_email_allowlist');
    expect(helper).toContain('.eq("is_system", false)');
    expect(helper).toContain('.eq("locked", false)');

    expect(configSave).toContain('ensureCanCreateCustomAgent(admin, userId, userEmail)');
    expect(forge).toContain('ensureCanCreateCustomAgent(admin, userId, userEmail)');
  });

  it('explains the new one-agent-included rule in user-facing surfaces', () => {
    const agents = readRepoFile('src/pages/settings/AgentsList.tsx');
    const access = readRepoFile('src/pages/AccessGatePage.tsx');
    const help = readRepoFile('src/pages/settings/HelpGuide.tsx');

    expect(agents).toContain('user can create one custom agent');
    expect(agents).toContain('Unlock more');
    expect(access).toContain('Unlock additional agents');
    expect(help).toContain('Your first custom agent is included');
  });
});

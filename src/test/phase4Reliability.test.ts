import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Phase 4 reliability guardrails', () => {
  it('enforces daily chat quota in the primary chat-multi runtime before model calls', () => {
    const source = readRepoFile('supabase/functions/chat-multi/index.ts');
    const quotaCheckIndex = source.indexOf('await checkAndIncrement(userId, "chat-message")');
    const keyDecryptIndex = source.indexOf('decrypt_user_api_key');
    const firstModelCallIndex = source.indexOf('https://openrouter.ai/api/v1/chat/completions');

    expect(source).toContain('import { checkAndIncrement } from "../_shared/dailyQuota.ts";');
    expect(quotaCheckIndex).toBeGreaterThan(-1);
    expect(keyDecryptIndex).toBeGreaterThan(-1);
    expect(firstModelCallIndex).toBeGreaterThan(-1);
    expect(quotaCheckIndex).toBeLessThan(keyDecryptIndex);
    expect(quotaCheckIndex).toBeLessThan(firstModelCallIndex);
    expect(source).toContain('code: "quota_exceeded"');
  });

  it('requires an exact service-role bearer for mnemos digest service mode', () => {
    const source = readRepoFile('supabase/functions/mnemos-digest-build/index.ts');
    expect(source).toContain('authHeader === `Bearer ${serviceRoleKey}`');
    expect(source).not.toContain('authHeader.includes');
  });

  it('records health for scheduled-task and crisis follow-up cron runners', () => {
    for (const file of [
      'supabase/functions/scheduled-task-run/index.ts',
      'supabase/functions/crisis-followup/index.ts',
    ]) {
      const source = readRepoFile(file);
      expect(source).toContain('import { trackCronJob } from "../_shared/cronHealth.ts";');
      expect(source).toMatch(/return await trackCronJob\("[a-z-]+", async \(\) => \{/);
    }
  });

  it('does not leave config-implicit edge functions without a source auth marker', () => {
    const config = readRepoFile('supabase/config.toml');
    const configured = new Set(
      [...config.matchAll(/^\[functions\.([^\]]+)\]\nverify_jwt\s*=\s*\w+/gm)].map((m) => m[1]),
    );
    const functionsRoot = join(process.cwd(), 'supabase/functions');
    const implicitFunctions = readdirSync(functionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .filter((name) => !configured.has(name))
      .sort();

    const missingAuthMarkers = implicitFunctions.filter((name) => {
      const indexPath = join(functionsRoot, name, 'index.ts');
      if (!existsSync(indexPath)) return true;
      const source = readFileSync(indexPath, 'utf8');
      return !(
        source.includes('authenticateUser(req)') ||
        source.includes('auth.getUser') ||
        source.includes('auth.getClaims') ||
        source.includes('.getUser(') ||
        source.includes('requireServiceRole(req') ||
        source.includes('auth !== `Bearer ${serviceRole}`') ||
        source.includes('authHeader !== `Bearer ${serviceRoleKey}`') ||
        source.includes('authenticateDeviceToken(')
      );
    });

    expect(missingAuthMarkers).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('agent-scoped autonomy runtime', () => {
  it('dispatches background functions per active user/agent scope', () => {
    const dispatch = readRepoFile('supabase/functions/anima-dispatch/index.ts');
    const scope = readRepoFile('supabase/functions/_shared/agent-scope.ts');

    expect(dispatch).toContain('loadActiveAgentScopes');
    expect(dispatch).toContain('body: JSON.stringify({ user_id: scope.userId, agent_id: scope.agentId })');
    expect(dispatch).toContain('"anima-wander"');
    expect(dispatch).toContain('scopes_dispatched');
    expect(scope).toContain('NON_SUBSTRATE_AGENT_IDS');
    expect(scope).toContain('"observer"');
    expect(scope).toContain('filter((scope) => isSubstrateAgentId');
  });

  it('passes agent_id through older inner-life functions', () => {
    const files = [
      'supabase/functions/anima-think/index.ts',
      'supabase/functions/anima-reflect/index.ts',
      'supabase/functions/anima-question/index.ts',
      'supabase/functions/anima-wander/index.ts',
      'supabase/functions/anima-observe/index.ts',
      'supabase/functions/anima-connect/index.ts',
      'supabase/functions/anima-dream/index.ts',
      'supabase/functions/anima-believe/index.ts',
    ];

    for (const file of files) {
      const source = readRepoFile(file);
      expect(source, `${file} normalizes request agent_id`).toContain('normalizeAgentId');
      expect(source, `${file} skips observer sidecars`).toContain('isSubstrateAgentId');
      expect(source, `${file} filters reads by agent_id`).toContain('.eq("agent_id", agent_id)');
      expect(source, `${file} writes activity as active agent`).toContain('agentId: agent_id');
    }
  });

  it('keeps Observer out of journal and autonomy substrate writes', () => {
    const journalCron = readRepoFile('supabase/functions/journal-cron/index.ts');
    const journalWrite = readRepoFile('supabase/functions/journal-write/index.ts');
    const activityLog = readRepoFile('supabase/functions/_shared/activity-log.ts');
    const agentSettings = readRepoFile('src/stores/agentSettingsStore.ts');

    expect(journalCron).toContain('isSubstrateAgentId(scope.agentId)');
    expect(journalWrite).toContain('nonSubstrateResponse(requestedAgentId, "journal-write"');
    expect(activityLog).toContain('if (!isSubstrateAgentId(agentId)) return null');
    expect(agentSettings).toContain("row.id !== 'observer'");
  });

  it('keeps proactive outreach conservative for custom agents', () => {
    const initiate = readRepoFile('supabase/functions/anima-initiate/index.ts');
    const heartbeat = readRepoFile('supabase/functions/anima-heartbeat/index.ts');
    const pulse = readRepoFile('supabase/functions/luca-pulse/index.ts');

    expect(initiate).toContain('allowsProactiveAutonomy');
    expect(initiate).toContain('reason: "proactive_autonomy_disabled"');
    expect(initiate).toContain('agentId: agent_id');

    expect(heartbeat).toContain('allowsProactiveAutonomy');
    expect(heartbeat).toContain('if (canProactivelyReachOut)');
    expect(heartbeat).toContain('agent_id: agentId');

    expect(pulse).toContain('allowsProactiveAutonomy');
    expect(pulse).toContain('agent_id: agentId');
  });

  it('scopes the activity gate and process logs by agent', () => {
    const gate = readRepoFile('supabase/functions/_shared/activity-gate.ts');

    expect(gate).toContain('processName: string,\n  agentId = "luca"');
    expect(gate).toContain('.eq("agent_id", scopedAgentId)');
    expect(gate).toContain('agent_id: scopedAgentId');
    expect(gate).toContain('primary_agent_id.eq');
  });
});

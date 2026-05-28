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
    expect(scope).toContain('filterValidAgentScopes');
    expect(scope).toContain('.from("agent_configs")');
    expect(scope).toContain('.eq("pending", false)');
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

  it('keeps visible background context inside the active user and agent', () => {
    const emotional = readRepoFile('supabase/functions/anima-emotional-state/index.ts');
    const journal = readRepoFile('supabase/functions/journal-write/index.ts');
    const chat = readRepoFile('src/pages/ChatView.tsx');
    const hypomnemaGate = readRepoFile('supabase/functions/hypomnema-gate/index.ts');
    const hypomnemaWrite = readRepoFile('supabase/functions/_shared/hypomnema/write.ts');

    expect(emotional).toContain('.or(`agent_id.eq.${agent_id},primary_agent_id.eq.${agent_id}`)');
    expect(emotional).toContain('.in("thread_id", recentThreadIds)');
    expect(emotional).toContain('.eq("agent_id", agent_id)');

    expect(journal).toContain('.eq("id", conversation_id)');
    expect(journal).toContain('.eq("user_id", user_id)');
    expect(journal).toContain('.or(`agent_id.eq.${agentId},primary_agent_id.eq.${agentId}`)');

    expect(chat).toContain(".from('thought_initiations')");
    expect(chat).toContain(".eq('agent_id', activeAgentId)");
    expect(chat).toContain(".from('threads')");

    expect(hypomnemaGate).toContain('agent_id: normalizeAgentId(opts.agentId)');
    expect(hypomnemaWrite).toContain('.from("mnemos_emotional_state")');
    expect(hypomnemaWrite).toContain('.eq("agent_id", agentId)');
  });

  it('scopes legacy memory extraction, synthesis, and import paths by agent', () => {
    const extract = readRepoFile('supabase/functions/memory-extract/index.ts');
    const reflect = readRepoFile('supabase/functions/memory-reflect/index.ts');
    const synthesize = readRepoFile('supabase/functions/memory-synthesize/index.ts');
    const chatgptImport = readRepoFile('supabase/functions/import-chatgpt/index.ts');

    for (const source of [extract, reflect, synthesize, chatgptImport]) {
      expect(source).toContain('normalizeAgentId');
      expect(source).toContain('nonSubstrateResponse');
      expect(source).toContain('.eq("agent_id", agent_id)');
      expect(source).toContain('agent_id,');
    }

    expect(extract).toContain('.eq("thread_id", conversation_id)');
    expect(extract).toContain('body: JSON.stringify({ user_id, agent_id })');
    expect(reflect).toContain('visibleMemoryIds');
    expect(synthesize).toContain('.eq("user_id", user_id)');
    expect(chatgptImport).toContain('.eq("user_id", user_id)');
  });
});

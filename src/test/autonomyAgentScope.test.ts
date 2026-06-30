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
    const journalCron = readRepoFile('supabase/functions/journal-cron/index.ts');
    const continuityWrite = readRepoFile('supabase/functions/_shared/continuity/write.ts');

    expect(initiate).toContain('allowsProactiveAutonomy');
    expect(initiate).toContain('reason: "proactive_autonomy_disabled"');
    expect(initiate).toContain('agentId: agent_id');

    expect(heartbeat).toContain('allowsProactiveAutonomy');
    expect(heartbeat).toContain('if (canProactivelyReachOut)');
    expect(heartbeat).toContain('agent_id: agentId');

    expect(pulse).toContain('allowsProactiveAutonomy');
    expect(pulse).toContain('agent_id: agentId');
    expect(pulse).toContain('const agentId = normalizeAgentId(metadata.agent_id)');
    expect(pulse).toContain('agentId,');
    expect(pulse).toContain('payload = { url: urlMatch[0], user_id: userId, agent_id: agentId }');

    expect(journalCron).toContain('allowsInnerLifeAutonomy');
    expect(journalCron).toContain('allowsProactiveAutonomy');
    expect(journalCron).toContain('reason: "inner_life_disabled"');
    expect(journalCron).toContain('reason: "proactive_autonomy_disabled"');
    expect(journalCron).not.toContain('scope.agentId === "luca"');

    expect(continuityWrite).toContain('agentId !== "observer"');
    expect(continuityWrite).not.toContain('agentId === "luca" && Boolean(opts.authHeader)');
  });

  it('scopes the activity gate and process logs by agent', () => {
    const gate = readRepoFile('supabase/functions/_shared/activity-gate.ts');
    const consolidate = readRepoFile('supabase/functions/mnemos-consolidate/index.ts');
    const candidateAutoCommit = readRepoFile('supabase/migrations/20260628002851_a6cb05f4-acb3-4939-be83-6e3a783c35c1.sql');

    expect(gate).toContain('processName: string,\n  agentId = "luca"');
    expect(gate).toContain('.eq("agent_id", scopedAgentId)');
    expect(gate).toContain('agent_id: scopedAgentId');
    expect(gate).toContain('primary_agent_id.eq');
    expect(consolidate).toContain('.from("activity_events")');
    expect(consolidate).toContain('.eq("agent_id", agentId)');
    expect(consolidate).toContain('.eq("metadata->>process", "mnemos-consolidate")');
    expect(consolidate).toContain('logProcessRan(supabase, uid, "mnemos-consolidate"');
    expect(consolidate).toContain('.gte("created_at", cutoff)');
    expect(consolidate).toContain('.gte("last_accessed_at", cutoff)');

    expect(candidateAutoCommit).toContain('SELECT id, user_id, agent_id, content, memory_type, confidence, source');
    expect(candidateAutoCommit).toContain('user_id, agent_id, content, memory_type, confidence, provenance');
    expect(candidateAutoCommit).toContain("COALESCE(v_candidate.agent_id, 'luca')");
  });

  it('surfaces promoted Mnemos engrams as agent-scoped durable memory candidates', () => {
    const consolidation = readRepoFile('supabase/functions/_shared/mnemos/consolidation.ts');
    const engine = readRepoFile('supabase/functions/_shared/mnemos/engine.ts');
    const overview = readRepoFile('src/components/memory/MnemosOverview.tsx');

    expect(consolidation).toContain('surfaceDurableCandidatesFromSemanticEngrams');
    expect(consolidation).toContain('.from("memory_candidates")');
    expect(consolidation).toContain('agent_id: agentId');
    expect(consolidation).toContain('origin: "mnemos-consolidate"');
    expect(consolidation).toContain('DURABLE_CANDIDATE_MAX_PER_RUN');
    expect(consolidation).toContain('.select("source, content")');
    expect(consolidation).toContain('.select("provenance, content")');
    expect(consolidation).toContain('usedEngramIds.has(engram.id)');
    expect(consolidation).toContain('domainKeyForTags(draft.tags)');
    expect(consolidation).toContain('memory_candidates_created: memoryCandidatesCreated');
    expect(engine).toContain('memory_candidates_created: report.memory_candidates_created');
    expect(overview).toContain('durable candidates');
  });

  it('keeps scheduled model-writing autonomy explicitly gated', () => {
    const gate = readRepoFile('supabase/functions/_shared/activity-gate.ts');
    const connect = readRepoFile('supabase/functions/anima-connect/index.ts');
    const observe = readRepoFile('supabase/functions/anima-observe/index.ts');
    const dream = readRepoFile('supabase/functions/anima-dream/index.ts');

    for (const process of ['heartbeat', 'wander', 'observe', 'dream', 'connect']) {
      expect(gate, `${process} has an explicit process gate`).toContain(`${process}: {`);
    }
    expect(gate).toContain('no activity gate configured for');
    expect(gate).toContain('gate error — skipping autonomous run');

    expect(connect).toContain('evaluate as activityGate');
    expect(connect).toContain('activityGate(supabase, user_id, "connect", agent_id)');
    expect(observe).toContain('activityGate(supabase, user_id, "observe", agent_id)');
    expect(dream).toContain('activityGate(supabase, user_id, "dream", agent_id)');
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
    const profileAnalysis = readRepoFile('supabase/functions/profile-deep-analysis/index.ts');
    const importStore = readRepoFile('src/stores/importStore.ts');
    const importView = readRepoFile('src/pages/ImportView.tsx');

    for (const source of [extract, reflect, synthesize, chatgptImport, profileAnalysis]) {
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
    expect(profileAnalysis).toContain('source_context: { pipeline: "profile-deep-analysis-v1", import_id, agent_id }');
    expect(importStore).toContain('startImport: async (userId: string, requestedAgentId?: string)');
    expect(importStore).toContain('agent_id: agentId');
    expect(importStore).toContain('body: JSON.stringify({ import_id: importId, agent_id: agentId })');
    expect(importView).toContain('useAgentScopeStore');
    expect(importView).toContain('startImport(user.id, activeAgentId)');
  });

  it('prevents import cleanup and realtime UI from leaking across agents', () => {
    const deleteImport = readRepoFile('supabase/functions/delete-import/index.ts');
    const clearImport = readRepoFile('supabase/functions/clear-import/index.ts');
    const cancelImport = readRepoFile('supabase/functions/import-cancel/index.ts');
    const socialX = readRepoFile('supabase/functions/anima-social-x/index.ts');
    const socialMoltbook = readRepoFile('supabase/functions/anima-social-moltbook/index.ts');
    const checkpointRestore = readRepoFile('supabase/functions/checkpoint-restore/index.ts');
    const cognitiveStore = readRepoFile('src/stores/cognitiveStore.ts');

    for (const source of [deleteImport, clearImport, cancelImport]) {
      expect(source).toContain('select("id, user_id, agent_id');
      expect(source).toContain('.eq("user_id", user.id)');
      expect(source).toContain('.eq("agent_id",');
    }

    for (const source of [socialX, socialMoltbook]) {
      expect(source).toContain('agent_id: requestedAgentId');
      expect(source).toContain('const agent_id = normalizeAgentId(requestedAgentId)');
      expect(source).toContain('agent_id,');
    }

    expect(checkpointRestore).toContain('agent_id: target.agent || "luca"');
    expect(cognitiveStore).toContain('scope: { userId, agentId }');
    expect(cognitiveStore).toContain('if (get().scope?.userId !== userId || get().scope?.agentId !== agentId) return');
    expect(cognitiveStore).toContain('if (!isCurrentScope()) return');
  });

  it('derives sensitive sidecar work from user-owned threads and active agents', () => {
    const chatGuardian = readRepoFile('supabase/functions/chat-guardian/index.ts');
    const observerChat = readRepoFile('supabase/functions/observer-chat/index.ts');
    const observerWatch = readRepoFile('supabase/functions/observer-watch/index.ts');
    const skillsDistill = readRepoFile('supabase/functions/skills-distill/index.ts');
    const dialectic = readRepoFile('supabase/functions/mnemos-dialectic/index.ts');

    for (const source of [chatGuardian, observerChat, observerWatch, skillsDistill, dialectic]) {
      expect(source).toContain('.from("threads")');
      expect(source).toContain('.eq("user_id", user');
      expect(source).toContain('resolveScopeAgentId');
    }

    expect(chatGuardian).toContain('new MnemosEngine(supabase, userId, threadAgentId)');
    expect(chatGuardian).toContain('.eq("thread_id", thread_id)');
    expect(chatGuardian).toContain('.eq("user_id", userId)');
    expect(observerChat).toContain('loadEmotionalState(supabase, user.id, threadAgentId)');
    expect(observerWatch).toContain('ignored mismatched requested agent');
    expect(skillsDistill).toContain('const agentId = threadAgentId');
    expect(dialectic).toContain('const agentId = resolveScopeAgentId(thread)');
  });

  it('scopes profile evidence and OpenClaw enqueue metadata to the active user and agent', () => {
    const profileView = readRepoFile('src/pages/ProfileView.tsx');
    const profilePanel = readRepoFile('src/components/ProfileChatPanel.tsx');
    const profileChat = readRepoFile('supabase/functions/profile-chat/index.ts');
    const openclawEnqueue = readRepoFile('supabase/functions/openclaw-enqueue/index.ts');

    expect(profileView).toContain(".eq('agent_id', activeAgentId)");
    expect(profileView).toContain('agentId={activeAgentId}');
    expect(profilePanel).toContain('agent_id: agentId');
    expect(profileChat).toContain('p_agent_id: agentId');
    expect(profileChat).toContain('nonSubstrateResponse(agentId, "profile-chat"');

    expect(openclawEnqueue).toContain('.from("agent_configs")');
    expect(openclawEnqueue).toContain('.eq("user_id", auth.userId)');
    expect(openclawEnqueue).toContain('.from("threads")');
    expect(openclawEnqueue).toContain('agent_config_id: agentConfigId');
    expect(openclawEnqueue).toContain('thread_id: threadId');
  });

  it('keeps Mnemos verification fixtures out of other agents during cleanup', () => {
    const verify = readRepoFile('supabase/functions/mnemos-verify/index.ts');

    expect(verify).toContain('agentId = normalizeAgentId(body?.agent_id)');
    expect(verify).toContain('new MnemosEngine(supabase, userId, agentId)');
    expect(verify).toContain('source_context: { type: "mnemos_verify", label: beat.label, agent_id: agentId }');
    expect(verify).toContain('.eq("agent_id", agentId)');
  });

  it('keeps hypomnema graduation inside the originating agent substrate', () => {
    const graduate = readRepoFile('supabase/functions/_shared/hypomnema/graduate.ts');
    const migration = readRepoFile('supabase/migrations/20260531225716_scope_chat_imports_by_agent.sql');

    expect(graduate).toContain('agent_id: row.agent_id');
    expect(graduate).toContain('p_agent_id: row.agent_id');
    expect(migration).toContain("e.source_context->>'type' = 'hypomnema_graduation'");
    expect(migration).toContain("SET agent_id = e.source_context->>'agent_id'");
  });

  it('keeps journal provenance schema aligned with journal-write inserts', () => {
    const journal = readRepoFile('supabase/functions/journal-write/index.ts');
    const migration = readRepoFile('supabase/migrations/20260613000000_journal_entry_provenance.sql');
    const handoff = readRepoFile('docs/lovable-supabase-handoff.md');

    expect(journal).toContain('source_conversation_id: validConversationId');
    expect(journal).toContain('source_context: sourceContext');
    expect(journal).toContain('source_conversation_valid: Boolean(validConversationId)');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_conversation_id uuid');
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("CHECK (trigger_type IN ('periodic', 'post_conversation', 'post-conversation', 'spontaneous'))");
    expect(handoff).toContain('trigger_type constraint failures for post_conversation');
    expect(handoff).toContain('supabase/migrations/20260613000000_journal_entry_provenance.sql');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_MODEL,
  defaultRuntimeForAgent,
  getChatModelLabel,
  getModelFamily,
  normalizeThreadRuntimeMode,
} from '@/lib/chatRuntime';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Chat runtime targets', () => {
  it('defaults Luca and custom agents to agent runtime while preserving explicit model chat', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('moonshotai/kimi-k2.6');
    expect(defaultRuntimeForAgent('luca')).toBe('agent');
    expect(defaultRuntimeForAgent('glyph-weaver')).toBe('agent');
    expect(normalizeThreadRuntimeMode(undefined, 'agent')).toBe('agent');
    expect(getModelFamily('openai/gpt-5.1')).toBe('openai');
    expect(getModelFamily('anthropic/claude-sonnet-4.6')).toBe('anthropic');
  });

  it('keeps unknown raw model ids visible until the user replaces them', () => {
    expect(getChatModelLabel('unknown-lab/strange-model-v9')).toBe('unknown-lab/strange-model-v9');
  });

  it('wires the chat view as one Luca runtime plus explicit raw model targets', () => {
    const source = readRepoFile('src/pages/ChatView.tsx');
    const picker = readRepoFile('src/components/composer/ChatTargetPicker.tsx');

    expect(source).toContain('<ChatTargetPicker');
    expect(source).toContain('activeChatTarget');
    expect(picker).toContain("sectionHeader('Agents')");
    expect(picker).toContain('LAB_LABELS');
    expect(source).toContain('const activeChatTarget: ChatTarget = classicChatActive');
    expect(source).toContain("pendingTargetKind === 'model' ? 'classic' : defaultRuntimeForAgent(activeAgentId)");
    expect(source).toContain("persistChatTarget({ kind: 'agent', id })");
    expect(source).toContain("persistChatTarget({ kind: 'model', id: modelId })");
    expect(source).toContain("runtime_mode: effectiveRuntimeMode");
    expect(source).toContain('model: selectedChatModel');
    expect(source).toContain("agent_mode: effectiveRuntimeMode === 'agent' ? 'agent' : 'chat'");
    expect(source).toContain('agent: activeMessageAgent');
    expect(source).toContain('if (classicChatActive) openCompanionFilePicker();');
    expect(source).toContain('!classicChatActive && (');
    expect(source).toContain('normalizeStreamComparableContent');
    expect(source).toContain('messageMatchesActiveStream');
    expect(source).toContain('shouldHideStreamingMirror');
    expect(source).toContain('msg.metadata?.local_stream_stub === true');
  });

  it('keeps chat-multi classic mode direct and quiet', () => {
    const source = readRepoFile('supabase/functions/chat-multi/index.ts');
    const helper = readRepoFile('supabase/functions/_shared/classic-chat.ts');

    expect(source).toContain('buildClassicChatSystemPrompt');
    expect(source).toContain('getClassicMemoryAgentIds(selectedClassicModel)');
    expect(source).toContain('includeIdentity: !classicRuntime');
    expect(source).toContain('includeHypomnema: !classicRuntime');
    expect(source).toContain('includeSkills: !classicRuntime');
    expect(source).toContain('const useEnsemble = agentRuntimeActive && backend.allowEnsemble && multiModelEnabled && agentIsSystemLuca;');
    expect(source).toContain('persistedAgentId: classicRuntime ? null : agentId');
    expect(source).toContain('runtimeProfile: classicRuntime ? "classic" : "agent"');
    expect(helper).toContain('classic:shared');
    expect(helper).toContain('classic:family:${getModelFamily(modelId)}');
    expect(helper).toContain('no visible agentic workflow');
  });

  it('tracks the Supabase columns Lovable must apply before publish', () => {
    const migration = readRepoFile('supabase/migrations/20260614000000_classic_chat_runtime.sql');
    const oneLucaMigration = readRepoFile('supabase/migrations/20260630090000_one_luca_runtime_last_chat_target.sql');
    const types = readRepoFile('src/integrations/supabase/types.ts');

    expect(migration).toContain("runtime_mode IN ('classic', 'agent')");
    expect(migration).toContain('selected_model TEXT');
    expect(migration).toContain('memory_enabled BOOLEAN');
    expect(migration).toContain('continuity_summary TEXT');
    expect(oneLucaMigration).toContain('last_chat_target_kind');
    expect(oneLucaMigration).toContain('continuity_turn_jobs');
    expect(oneLucaMigration).toContain("WHERE status IN ('running', 'completed')");
    expect(oneLucaMigration).toContain('agent_skill_candidates');
    expect(types).toContain('runtime_mode: string');
    expect(types).toContain('selected_model: string | null');
    expect(types).toContain('last_chat_target_kind: string');
    expect(types).toContain('agent_skill_candidates');
  });
});

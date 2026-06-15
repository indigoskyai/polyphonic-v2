import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_MODEL,
  defaultRuntimeForAgent,
  getModelFamily,
  normalizeThreadRuntimeMode,
} from '@/lib/chatRuntime';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Classic Chat runtime', () => {
  it('defaults Luca chats to classic and custom agents to agent runtime', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('moonshotai/kimi-k2.6');
    expect(defaultRuntimeForAgent('luca')).toBe('classic');
    expect(defaultRuntimeForAgent('glyph-weaver')).toBe('agent');
    expect(normalizeThreadRuntimeMode(undefined, 'agent')).toBe('agent');
    expect(getModelFamily('openai/gpt-5.1')).toBe('openai');
    expect(getModelFamily('anthropic/claude-sonnet-4.6')).toBe('anthropic');
  });

  it('wires the chat view as model-first classic chat with explicit Agent Mode', () => {
    const source = readRepoFile('src/pages/ChatView.tsx');
    const picker = readRepoFile('src/components/composer/ChatTargetPicker.tsx');

    expect(source).toContain('<ChatTargetPicker');
    expect(source).toContain('activeChatTarget');
    expect(picker).toContain("sectionHeader('Agents')");
    expect(picker).toContain('LAB_LABELS');
    expect(source).toContain('const activeChatTarget: ChatTarget = classicChatActive');
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
    const types = readRepoFile('src/integrations/supabase/types.ts');

    expect(migration).toContain("runtime_mode IN ('classic', 'agent')");
    expect(migration).toContain('selected_model TEXT');
    expect(migration).toContain('memory_enabled BOOLEAN');
    expect(migration).toContain('continuity_summary TEXT');
    expect(types).toContain('runtime_mode: string');
    expect(types).toContain('selected_model: string | null');
  });
});

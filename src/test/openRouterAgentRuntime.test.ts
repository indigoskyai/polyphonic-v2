import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('OpenRouter Agent SDK runtime gate', () => {
  it('keeps the SDK path Luca-only, feature-gated, and before the legacy tool planner', () => {
    const source = readRepoFile('supabase/functions/chat-multi/index.ts');

    const gateIndex = source.indexOf('if (!forceForgeRequest && agentIsSystemLuca && backend.allowTools && sdkRuntimeRequested && isOpenRouterAgentRuntimeEnabled(userId))');
    const legacyPlannerIndex = source.indexOf('const toolPlannerResult = shouldRunLegacyToolPlanner');

    expect(source).toContain('../_shared/agent-runtime/openrouter-agent.ts');
    expect(source).toContain('openRouterAgentSdkStream({');
    expect(source).toContain('agent_mode: agentMode');
    expect(source).toContain('const sdkRuntimeRequested');
    expect(source).toContain('const shouldRunLegacyToolPlanner');
    expect(source).toContain('? await runToolPlanner(');
    expect(source).toContain('sourceMessageId');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(legacyPlannerIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(legacyPlannerIndex);

    // Existing chat remains the fallback whenever the flag is off or the agent is not Luca.
    expect(source).toContain('singleModelStream(');
    expect(source).toContain('const useEnsemble = backend.allowEnsemble && multiModelEnabled && agentIsSystemLuca;');
  });

  it('uses the SDK as a thin web-safe inner loop instead of a local-machine runtime', () => {
    const source = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');

    expect(source).toContain('npm:@openrouter/agent@0.5.0');
    expect(source).toContain('OPENROUTER_AGENT_SDK_ENABLED');
    expect(source).toContain('OPENROUTER_AGENT_SDK_USER_ALLOWLIST');
    expect(source).toContain('stepCountIs(');
    expect(source).toContain('maxCost(');

    expect(source).toContain('name: "memory_read"');
    expect(source).toContain('name: "web_search"');
    expect(source).toContain('name: "read_url"');
    expect(source).toContain('name: "forge_agent"');
    expect(source).toContain('callMcpTool(registration');

    expect(source).toContain('agent_tool_result');
    expect(source).toContain('thread_id: options.threadId');
    expect(source).toContain('queueContinuityTurnWrites');

    expect(source).not.toContain('workspace_file');
    expect(source).not.toContain('local filesystem');
    expect(source).not.toContain('terminal');
  });

  it('keeps agent runtime opt-in from the composer so normal chat stays fast', () => {
    const source = readRepoFile('src/pages/ChatView.tsx');
    const modesDropdown = readRepoFile('src/components/composer/ModesDropdown.tsx');

    expect(source).toContain('const [agentModeArmed, setAgentModeArmed] = useState(false)');
    expect(source).toContain("agent_mode: byokEnabled && agentModeActive ? 'agent' : 'chat'");
    // Agent runtime is opt-in via the consolidated ModesDropdown — verify
    // it's wired with the right state + handler so users can toggle it.
    expect(source).toContain('<ModesDropdown');
    expect(source).toContain('agentModeArmed={agentModeArmed}');
    expect(source).toContain('onToggleAgentMode={() => setAgentModeArmed');
    expect(modesDropdown).toContain('Agent runtime');
    expect(source).toContain("Message Luca (agent)");
  });

  it('surfaces agent runtime tool events and parses SSE blocks robustly', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');
    const runtime = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');

    expect(chatView).toContain("data.type === 'agent_runtime'");
    expect(chatView).toContain("data.type === 'tool_progress'");
    expect(chatView).toContain("data.type === 'tool_start'");
    expect(chatView).toContain("data.type === 'tool_result'");
    expect(chatView).toContain('agentTraceLine(data)');
    expect(chatView).toContain('let sseBuffer');
    expect(chatView).toContain('sseBuffer.split(/\\r?\\n\\r?\\n/)');

    expect(runtime).toContain('const agentTrace: string[] = []');
    expect(runtime).toContain('formatToolResultTrace');
    expect(runtime).toContain('thinking_content: persistedThinking');
  });
});

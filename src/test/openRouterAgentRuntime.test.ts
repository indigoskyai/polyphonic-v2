import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('OpenRouter Agent SDK runtime gate', () => {
  it('keeps the SDK path Luca-only, feature-gated, and before the legacy tool planner', () => {
    const source = readRepoFile('supabase/functions/chat-multi/index.ts');

    const gateIndex = source.indexOf('if (agentIsSystemLuca && sdkRuntimeRequested && isOpenRouterAgentRuntimeEnabled(userId))');
    const legacyPlannerIndex = source.indexOf('const toolMessages = await runToolPlanner');

    expect(source).toContain('../_shared/agent-runtime/openrouter-agent.ts');
    expect(source).toContain('openRouterAgentSdkStream({');
    expect(source).toContain('agent_mode: agentMode');
    expect(source).toContain('const sdkRuntimeRequested');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(legacyPlannerIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(legacyPlannerIndex);

    // Existing chat remains the fallback whenever the flag is off or the agent is not Luca.
    expect(source).toContain('singleModelStream(');
    expect(source).toContain('const useEnsemble = multiModelEnabled && agentIsSystemLuca;');
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

    expect(source).toContain('const [agentModeArmed, setAgentModeArmed] = useState(false)');
    expect(source).toContain("agent_mode: agentModeActive ? 'agent' : 'chat'");
    expect(source).toContain('agentModePillClass');
    expect(source).toContain('>agent</button>');
    expect(source).toContain("Message Luca (agent)");
  });
});

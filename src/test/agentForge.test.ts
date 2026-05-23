import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Agent Forge runtime', () => {
  it('ships a migration-free agent-forge edge function with proposal, commit, and cancel actions', () => {
    const source = readRepoFile('supabase/functions/agent-forge/index.ts');
    const config = readRepoFile('supabase/config.toml');

    expect(config).toContain('[functions.agent-forge]\nverify_jwt = false');
    expect(source).toContain('action === "propose_create" || action === "propose_update"');
    expect(source).toContain('action === "cancel"');
    expect(source).toContain('action !== "commit"');
    expect(source).not.toContain('Forge requires a saved signed-in account');
    expect(source).toContain('ensureCanCreateCustomAgent');
    expect(source).toContain('RESERVED_AGENT_IDS');
    expect(source).toContain('agent_configs');
    expect(source).toContain('agent_identity');
    expect(source).toContain('kind: "permission_request"');
    expect(source).toContain('forge_kind: "agent_forge_proposal"');
  });

  it('validates complete Open Clause blueprints before any persistent write', () => {
    const source = readRepoFile('supabase/functions/agent-forge/index.ts');

    expect(source).toContain('identity_docs');
    expect(source).toContain('"soul", "convictions", "user_model", "self_model"');
    expect(source).toContain('Blueprint runtime instructions are required');
    expect(source).toContain('Blueprint model is not allowed');
    expect(source).toContain('Resident or locked agents cannot be modified by Forge');
    expect(source).toContain('createUniqueAgentId');
  });

  it('exposes forge_agent through both Luca tool paths and updates prompt guidance', () => {
    const planner = readRepoFile('supabase/functions/anima-tool-execute/index.ts');
    const sdk = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');
    const lucaSoul = readRepoFile('supabase/functions/_shared/agents/luca-soul.ts');

    expect(planner).toContain('name: "forge_agent"');
    expect(planner).toContain('edgeFn = "agent-forge"');
    expect(planner).toContain('draft the full Open Clause shape');
    expect(planner).toContain('forceForgeOnly');
    expect(planner).toContain('max_tokens: forceForgeOnly ? 12_000 : 700');
    expect(planner).toContain('force_forge_only === true');
    expect(planner).toContain('If the user asks for a generic agent, companion agent, test agent');
    expect(planner).toContain('Never use create_artifact to create, define, or test a custom agent');

    expect(sdk).toContain('name: "forge_agent"');
    expect(sdk).toContain('invokeEdgeJson(options, "agent-forge"');
    expect(sdk).toContain('Never changes agent data directly');

    expect(chatMulti).toContain('const agentIsSystemLuca = agentId === "luca"');
    expect(chatMulti).toContain('!forceForgeRequest && agentIsSystemLuca && backend.allowTools && sdkRuntimeRequested');
    expect(chatMulti).toContain('force_forge_only: forceForgeOnly');
    expect(chatMulti).toContain('tool_planner_fallback: true');
    expect(chatMulti).toContain('findForgeToolError');
    expect(chatMulti).toContain('forge_proposal_failed');
    expect(chatMulti).toContain('forge_agent (draft complete custom-agent blueprints as inline approval cards)');
    expect(chatMulti).toContain('findForgeProposalResult');
    expect(chatMulti).toContain('return sseDoneResponse(corsHeaders, { duplicate: true, ...donePayload })');
    expect(lucaSoul).toContain('when the user wants a custom agent');
  });

  it('renders Forge proposal messages before the generic permission card and refreshes agents on approval', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');
    const card = readRepoFile('src/components/agents/AgentForgeCard.tsx');

    const forgeBranchIndex = chatView.indexOf('const forgeProposal = getForgeProposalMetadata(msg)');
    const permissionBranchIndex = chatView.indexOf("if (msg.kind === 'permission_request')");

    expect(chatView).toContain("supabase.functions.invoke('agent-forge'");
    expect(chatView).toContain('await loadAgentSettings(user.id)');
    expect(chatView).toContain('onSwitch={(agentId) => { void switchToForgedAgent(agentId); }}');
    expect(chatView).toContain('<div className="msg-body">\n                    <AgentForgeCard');
    expect(forgeBranchIndex).toBeGreaterThan(-1);
    expect(permissionBranchIndex).toBeGreaterThan(-1);
    expect(forgeBranchIndex).toBeLessThan(permissionBranchIndex);

    expect(card).toContain('Create agent');
    expect(card).toContain('Update agent');
    expect(card).toContain('Switch to agent');
    expect(card).toContain('Review full blueprint');
  });

  it('prevents Forge approval follow-ups from leaking raw tool-call JSON into chat', () => {
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');

    expect(chatMulti).toContain('function looksLikeForgeApprovalFollowup');
    expect(chatMulti).toContain('loadLatestForgeProposalForThread');
    expect(chatMulti).toContain('commitForgeProposalFromChat');
    expect(chatMulti).toContain('forge_acknowledgement');
    expect(chatMulti).toContain('RAW_FORGE_TOOL_LEAK_MESSAGE');
    expect(chatMulti).toContain('function looksLikeRawForgeToolLeak');
    expect(chatMulti).toContain('pendingContent');
    expect(chatMulti).toContain('Please try again; I should show a Forge proposal card, not a forge_agent text block.');
  });
});

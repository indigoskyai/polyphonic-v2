import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('inline simulation runtime wiring', () => {
  it('teaches Luca chat to emit hidden simulation artifact payloads', () => {
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');

    expect(chatMulti).toContain('Inline Simulation Turns');
    expect(chatMulti).toContain('fenced block tagged exactly');
    expect(chatMulti).toContain('containing valid JSON');
    expect(chatMulti).toContain('Allowed preview presets: wave-scattering, reaction-diffusion, fluid-field, field-lines, particle-shell');
    expect(chatMulti).toContain('Do not use any fenced code block except the one simulation JSON block.');
    expect(chatMulti).toContain('Do not output a separate truth-card table');
    expect(chatMulti).toContain('asksForSimulationPreview');
    expect(chatMulti).toContain('simulationRequestWithoutForgeSubject');
    expect(chatMulti).toContain('looksLikeAgentForgeRequest(visibleMessageForRouting)');
    expect(chatMulti).toContain('turnSystemPrompt + artifactNote + simulationArtifactNote + toolCapabilityNote');
  });

  it('adds a local Luca simulation-turn hint for undeployed edge runtimes', () => {
    const chatView = readRepoFile('src/pages/ChatView.tsx');
    const intent = readRepoFile('src/lib/simulationTurnIntent.ts');

    expect(chatView).toContain('looksLikeSimulationTurnRequest(messageText)');
    expect(chatView).toContain('withClientSimulationTurnDirective(messageText)');
    expect(chatView).toContain('addLocalArtifacts(tid!, localSimulationArtifacts)');
    expect(intent).toContain('Do not answer with html, svg, jsx, tsx, react, or mermaid artifact fences.');
  });

  it('routes natural simulation requests through The Well tool path', () => {
    const planner = readRepoFile('supabase/functions/anima-tool-execute/index.ts');
    const sdk = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');

    expect(planner).toContain('show/model/compare turbulence');
    expect(planner).toContain('use the_well_research before answering');
    expect(sdk).toContain('ground an inline simulation artifact');
  });

  it('updates artifact persistence and UI renderers for simulation kind', () => {
    const store = readRepoFile('src/stores/artifactStore.ts');
    const extractor = readRepoFile('src/lib/streamingArtifacts.ts');
    const renderer = readRepoFile('src/components/canvas/ArtifactRenderer.tsx');
    const chip = readRepoFile('src/components/canvas/ArtifactChip.tsx');

    expect(store).toContain("'simulation'");
    expect(extractor).toContain("simulation: 'simulation'");
    expect(renderer).toContain("artifact.kind === 'simulation'");
    expect(chip).toContain('StreamingArtifactChip');
    expect(chip).toContain('<SimulationCard artifact={artifact} compact />');
  });
});

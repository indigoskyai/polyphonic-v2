import { describe, expect, it } from 'vitest';
import {
  SIMULATION_TURN_DIRECTIVE,
  looksLikeSimulationTurnRequest,
  withClientSimulationTurnDirective,
} from '@/lib/simulationTurnIntent';

describe('simulation turn intent', () => {
  it('detects natural Luca physics simulation requests', () => {
    expect(looksLikeSimulationTurnRequest('show me what radiative cooling does to turbulence')).toBe(true);
    expect(looksLikeSimulationTurnRequest('compare MHD field lines with and without cooling')).toBe(true);
    expect(looksLikeSimulationTurnRequest('can you build an inline simulation with a timestep scrubber?')).toBe(true);
  });

  it('does not trigger for ordinary chat', () => {
    expect(looksLikeSimulationTurnRequest('what should I work on today?')).toBe(false);
    expect(looksLikeSimulationTurnRequest('summarize this paper in plain language')).toBe(false);
  });

  it('adds a simulation-only directive without changing the visible prompt prefix', () => {
    const prompt = 'Show me cooling in turbulence.';
    const next = withClientSimulationTurnDirective(prompt);

    expect(next.startsWith(prompt)).toBe(true);
    expect(next).toContain(SIMULATION_TURN_DIRECTIVE);
    expect(next).toContain('Do not answer with html, svg, jsx, tsx, react, or mermaid artifact fences.');
    expect(next).toContain('"raw_ingest_default": false');
    expect(next).not.toContain('agent-mode');
  });
});

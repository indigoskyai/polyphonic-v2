import { describe, expect, it } from 'vitest';
import {
  SIMULATION_PRESETS,
  parseSimulationArtifactContent,
  simulationTitleFromContent,
  validateSimulationArtifactPayload,
} from '@/lib/simulationArtifacts';

export const sampleSimulationPayload = {
  version: 1,
  title: 'Cooling Turbulence Probe',
  question: 'Show what cooling does to turbulence.',
  dataset: {
    family_id: 'turbulent_radiative_layer',
    label: 'Turbulent radiative layer',
    access_name: 'turbulent_radiative_layer_2D',
    docs_url: 'https://polymathic-ai.org/the_well/datasets/turbulent_radiative_layer/',
  },
  evidence: {
    claim_boundary: 'Evidence is conditional on a simulated radiation hydrodynamics setup.',
    evidence_level: 'simulation-direct',
    measurements: ['density contrast', 'rollout window error'],
    caveats: ['This is simulated evidence, not direct observation.'],
  },
  preview: {
    preset: 'fluid-field',
    fields: ['density', 'pressure', 'velocity'],
    parameters: { cooling: 1, contrast: 1.2 },
    initial_state: { timestep: 0.38 },
    color_mode: 'thermal',
  },
  access: {
    streaming_snippet: 'from the_well.data import WellDataset',
    download_command: 'the-well-download --dataset turbulent_radiative_layer_2D --split train',
    raw_ingest_default: false,
  },
} as const;

describe('simulation artifact payload contract', () => {
  it('accepts the v1 declarative simulation payload', () => {
    const parsed = parseSimulationArtifactContent(JSON.stringify(sampleSimulationPayload));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.preview.preset).toBe('fluid-field');
    expect(parsed.payload.access.raw_ingest_default).toBe(false);
    expect(parsed.payload.dataset.access_name).toBe('turbulent_radiative_layer_2D');
  });

  it('rejects unsupported presets and raw-ingest claims', () => {
    const invalid = {
      ...sampleSimulationPayload,
      preview: { ...sampleSimulationPayload.preview, preset: 'made-up-preset' },
      access: { ...sampleSimulationPayload.access, raw_ingest_default: true },
    };

    const parsed = validateSimulationArtifactPayload(invalid);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.details?.join(' ')).toContain('preview.preset');
    expect(parsed.details?.join(' ')).toContain('access.raw_ingest_default must be false');
  });

  it('keeps title extraction graceful for invalid payloads', () => {
    expect(simulationTitleFromContent(JSON.stringify(sampleSimulationPayload))).toBe('Cooling Turbulence Probe');
    expect(simulationTitleFromContent('{')).toBe('Simulation preview');
  });

  it('defines the expected Hybrid v1 renderer presets', () => {
    expect(SIMULATION_PRESETS).toEqual([
      'wave-scattering',
      'reaction-diffusion',
      'fluid-field',
      'field-lines',
      'particle-shell',
    ]);
  });
});


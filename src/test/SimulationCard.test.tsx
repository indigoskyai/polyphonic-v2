import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SimulationCard from '@/components/simulations/SimulationCard';
import type { Artifact } from '@/stores/artifactStore';

const sampleSimulationPayload = {
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
};

function artifactFor(content: string): Artifact {
  return {
    id: 'artifact-sim-1',
    user_id: 'user-1',
    thread_id: 'thread-1',
    source_message_id: 'message-1',
    kind: 'simulation',
    title: 'Simulation',
    content,
    parent_artifact_id: null,
    version: 1,
    created_at: new Date().toISOString(),
  };
}

function fakeContext(fillCalls: string[]) {
  const gradient = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(() => fillCalls.push('fillRect')),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => fillCalls.push('fill')),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('SimulationCard', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRaf = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  let fillCalls: string[] = [];

  beforeEach(() => {
    fillCalls = [];
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext(fillCalls)) as any;
    window.requestAnimationFrame = vi.fn(() => 1) as any;
    window.cancelAnimationFrame = vi.fn() as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
  });

  it.each([
    'wave-scattering',
    'reaction-diffusion',
    'fluid-field',
    'field-lines',
    'particle-shell',
  ])('renders a nonblank canvas for %s preset', async (preset) => {
    const payload = {
      ...sampleSimulationPayload,
      preview: { ...sampleSimulationPayload.preview, preset },
    };

    render(
      <MemoryRouter>
        <SimulationCard artifact={artifactFor(JSON.stringify(payload))} compact />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('simulation-card')).toBeInTheDocument();
    expect(screen.getByText('Cooling Turbulence Probe')).toBeInTheDocument();
    await waitFor(() => expect(fillCalls.length).toBeGreaterThan(0));
  });

  it('renders a graceful fallback for invalid simulation JSON', () => {
    render(
      <MemoryRouter>
        <SimulationCard artifact={artifactFor('{')} compact />
      </MemoryRouter>,
    );

    expect(screen.getByText('Simulation could not render')).toBeInTheDocument();
  });

  it('keeps evidence details progressive in compact chat mode', async () => {
    render(
      <MemoryRouter>
        <SimulationCard artifact={artifactFor(JSON.stringify(sampleSimulationPayload))} compact />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('turbulent_radiative_layer_2D').length).toBeGreaterThan(0);
    expect(screen.getAllByText('simulation direct').length).toBeGreaterThan(0);
    expect(screen.queryByText('density contrast')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /evidence boundary/i }));

    expect(screen.getByText('density contrast')).toBeInTheDocument();
    expect(screen.getByText('This is simulated evidence, not direct observation.')).toBeInTheDocument();
  });
});

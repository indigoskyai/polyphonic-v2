import { describe, expect, it } from 'vitest';
import { THE_WELL_CATALOG, createWellTruthCard } from '@/lib/theWellCatalog';
import {
  buildResearchCardTitle,
  buildWellRawAccess,
  normalizeResearchCard,
} from '@/stores/researchStore';

describe('research evidence card helpers', () => {
  const dataset = THE_WELL_CATALOG.find((entry) => entry.id === 'turbulent_radiative_layer')!;

  it('persists The Well access as pointers instead of raw tensor payloads', () => {
    const access = buildWellRawAccess(dataset);

    expect(access.raw_ingest_default).toBe(false);
    expect(access.ingest_boundary).toBe('catalog_metadata_first_raw_tensors_on_demand');
    expect(access.dataset_name).toBe('turbulent_radiative_layer_2D');
    expect(access.streaming_snippet).toContain('well_base_path="hf://datasets/polymathic-ai/"');
    expect(access.download_command).toContain('--dataset turbulent_radiative_layer_2D --split train');
    expect(access).not.toHaveProperty('raw_tensors');
    expect(access).not.toHaveProperty('hdf5_payload');
  });

  it('normalizes saved cards defensively for UI rendering', () => {
    const card = normalizeResearchCard({
      id: 'card_1',
      user_id: 'user_1',
      title: '',
      question: 'How does the layer mix?',
      dataset_id: 'turbulent_radiative_layer',
      dataset_label: 'Turbulent radiative layer',
      evidence_level: 'simulation-direct',
      access_plan: ['Use metadata first'],
      measurements: ['density contrast'],
      caveats: ['simulated evidence'],
      archived: false,
      status: 'ready',
    });

    expect(card.id).toBe('card_1');
    expect(card.agent_id).toBe('luca');
    expect(card.title).toBe('Untitled evidence card');
    expect(card.access_plan).toEqual(['Use metadata first']);
    expect(card.raw_access).toEqual({});
    expect(card.status).toBe('ready');
  });

  it('keeps evidence card titles compact enough for saved-card rows', () => {
    const truthCard = createWellTruthCard(
      'Can Luca compare radiative cooling, turbulence, density structure, and long rollout divergence without pretending the simulation is an observation?',
      dataset,
    );

    const title = buildResearchCardTitle(truthCard);
    expect(title.length).toBeLessThanOrEqual(74);
    expect(title.endsWith('...')).toBe(true);
  });
});

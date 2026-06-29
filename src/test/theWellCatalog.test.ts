import { describe, expect, it } from 'vitest';
import {
  THE_WELL_CATALOG,
  buildDownloadCommand,
  buildStreamingSnippet,
  buildWellResearchPrompt,
  createWellTruthCard,
  getDatasetById,
  getPrimaryAccessName,
  getWellCatalogStats,
  rankWellDatasets,
} from '@/lib/theWellCatalog';

describe('The Well catalog', () => {
  it('tracks the documented family count, access variants, and catalog scale', () => {
    const stats = getWellCatalogStats();

    expect(stats.familyCount).toBe(16);
    expect(stats.variantCount).toBe(23);
    expect(stats.totalSizeGb).toBeGreaterThan(15000);
    expect(stats.totalSizeLabel).toBe('15.1 TB');
  });

  it('distinguishes families from exact access names', () => {
    const mhd = getDatasetById('MHD_64');

    expect(mhd?.id).toBe('MHD');
    expect(getPrimaryAccessName(mhd!)).toBe('MHD_64');
    expect(buildStreamingSnippet(mhd!)).toContain('well_dataset_name="MHD_64"');
  });

  it('ranks datasets by physics language in the query', () => {
    const eulerMatches = rankWellDatasets('shock fronts and discontinuities in compressible Euler flow', 3);
    const supernovaMatches = rankWellDatasets('explosion shock front morphology in supernova ejecta', 3);

    expect(eulerMatches[0].id).toBe('euler_multi_quadrants');
    expect(supernovaMatches[0].id).toBe('supernova_explosion');
  });

  it('keeps raw data pointer-based in generated evidence cards', () => {
    const dataset = THE_WELL_CATALOG.find((entry) => entry.id === 'turbulent_radiative_layer')!;
    const card = createWellTruthCard('What is the smallest first physics probe Luca can run?', dataset);

    expect(buildDownloadCommand(dataset)).toContain('--dataset turbulent_radiative_layer_2D --split train');
    expect(card.accessPlan.join(' ')).toContain('Access only the needed split and variant');
    expect(card.caveats.join(' ')).toContain('not part of Luca memory by default');
  });

  it('builds a Luca handoff prompt with exact access names and raw-data boundaries', () => {
    const dataset = getDatasetById('MHD_64')!;
    const card = createWellTruthCard('Can Luca test magnetic field evolution from simulated MHD?', dataset);
    const prompt = buildWellResearchPrompt(card, dataset);

    expect(prompt).toContain('Dataset family: Magnetohydrodynamics (MHD)');
    expect(prompt).toContain('Exact access name: MHD_64');
    expect(prompt).toContain('Raw data boundary: do not assume tensors are loaded');
    expect(prompt).toContain('Answer as Luca');
  });
});

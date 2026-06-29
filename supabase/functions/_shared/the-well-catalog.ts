export type WellDimension = '2D' | '3D' | 'Spherical' | 'Log-Spherical' | 'Angular';

export interface WellDatasetVariant {
  id: string;
  label: string;
  sizeGb?: number;
  note?: string;
}

export interface WellDatasetFamily {
  id: string;
  label: string;
  domain: string;
  coordinateSystem: string;
  dimension: WellDimension;
  resolution: string;
  nSteps: string;
  trajectories: string;
  sizeGb: number;
  software: string;
  runtime: string;
  hardware: string;
  variants: WellDatasetVariant[];
  fields: string[];
  phenomena: string[];
  evidenceQuestions: string[];
  accessNotes: string[];
  sourcePath: string;
  benchmarkId?: string;
}

export interface WellTruthCard {
  question: string;
  datasetId: string;
  datasetLabel: string;
  evidenceLevel: 'simulation-direct' | 'simulation-proxy' | 'catalog-only';
  claimBoundary: string;
  accessPlan: string[];
  measurements: string[];
  caveats: string[];
}

export const THE_WELL_SOURCE_URL = 'https://polymathic-ai.org/the_well/';
export const THE_WELL_DATASET_OVERVIEW_URL = 'https://polymathic-ai.org/the_well/datasets_overview/';
export const THE_WELL_DATA_FORMAT_URL = 'https://polymathic-ai.org/the_well/data_format/';
export const THE_WELL_API_URL = 'https://polymathic-ai.org/the_well/api/';
export const THE_WELL_BENCHMARKS_URL = 'https://polymathic-ai.org/the_well/benchmarks/';
export const THE_WELL_HF_BASE = 'hf://datasets/polymathic-ai/';

export const THE_WELL_CATALOG: WellDatasetFamily[] = [
  {
    id: 'acoustic_scattering',
    label: 'Acoustic scattering',
    domain: 'Acoustics',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '256 x 256',
    nSteps: '100',
    trajectories: '8,000',
    sizeGb: 751,
    software: 'Clawpack',
    runtime: '0.25-0.33 h per simulation',
    hardware: '64 CPU cores',
    variants: [
      { id: 'acoustic_scattering_discontinuous', label: 'Discontinuous media', sizeGb: 157 },
      { id: 'acoustic_scattering_inclusions', label: 'Inclusions', sizeGb: 283 },
      { id: 'acoustic_scattering_maze', label: 'Maze', sizeGb: 311 },
    ],
    fields: ['pressure', 'velocity', 'density map', 'bulk modulus'],
    phenomena: ['wave propagation', 'scattering', 'inverse design', 'material interfaces'],
    evidenceQuestions: [
      'How do pressure waves propagate through structured media?',
      'Which surrogate model preserves reflection and transmission behavior?',
      'Where should material boundaries be changed to alter wave arrival?',
    ],
    accessNotes: ['Choose the maze, inclusions, or discontinuous variant before download.', 'Good first target for visual truth cards.'],
    sourcePath: '/datasets/acoustic_scattering_maze/',
    benchmarkId: 'acoustic_scattering_maze',
  },
  {
    id: 'active_matter',
    label: 'Active matter',
    domain: 'Biological physics',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '256 x 256',
    nSteps: '81',
    trajectories: '360',
    sizeGb: 51.3,
    software: 'Python',
    runtime: '0.33 h per simulation',
    hardware: 'A100 GPU',
    variants: [{ id: 'active_matter', label: 'Active matter', sizeGb: 51.3 }],
    fields: ['concentration', 'velocity', 'orientation tensor', 'strain-rate tensor'],
    phenomena: ['self-organization', 'rod-like active particles', 'Stokes flow', 'instability onset'],
    evidenceQuestions: [
      'When do small orientation perturbations become coherent flows?',
      'Which fields carry the earliest signal of active-matter organization?',
      'Can a surrogate preserve tensor-field evolution without washing out structure?',
    ],
    accessNotes: ['Small enough for early local-cache experiments.', 'Tensor fields make it useful for graph schema testing.'],
    sourcePath: '/datasets/active_matter/',
    benchmarkId: 'active_matter',
  },
  {
    id: 'convective_envelope_rsg',
    label: 'Red supergiant convective envelope',
    domain: 'Astrophysics',
    coordinateSystem: 'Spherical',
    dimension: 'Spherical',
    resolution: '256 x 128 x 256',
    nSteps: '100',
    trajectories: '29',
    sizeGb: 570,
    software: 'Athena++',
    runtime: '1460 h per simulation',
    hardware: '80 CPU cores',
    variants: [{ id: 'convective_envelope_rsg', label: 'Convective envelope', sizeGb: 570 }],
    fields: ['energy', 'density', 'pressure', 'velocity'],
    phenomena: ['stellar convection', 'turbulence', 'radiation hydrodynamics', 'supernova progenitors'],
    evidenceQuestions: [
      'What convective structures persist across timesteps?',
      'How does a surrogate handle 3D spherical turbulence?',
      'Which physical fields best reveal large-scale envelope motion?',
    ],
    accessNotes: ['Heavy 3D dataset. Prefer streaming probes before local caching.', 'Use for high-value astrophysics demonstrations.'],
    sourcePath: '/datasets/convective_envelope_rsg/',
    benchmarkId: 'convective_envelope_rsg',
  },
  {
    id: 'euler_multi_quadrants',
    label: 'Euler multi-quadrants',
    domain: 'Compressible fluids',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '512 x 512',
    nSteps: '100',
    trajectories: '10,000',
    sizeGb: 5170,
    software: 'Clawpack',
    runtime: '80 h total',
    hardware: '160 CPU cores total',
    variants: [
      { id: 'euler_multi_quadrants_openBC', label: 'Open boundaries' },
      { id: 'euler_multi_quadrants_periodicBC', label: 'Periodic boundaries' },
    ],
    fields: ['density', 'energy', 'pressure', 'momentum'],
    phenomena: ['shock formation', 'rarefaction waves', 'contact discontinuities', 'Riemann problems'],
    evidenceQuestions: [
      'Does the proposed model preserve shocks and contact discontinuities?',
      'How do boundary conditions alter wave interactions?',
      'Which regions create the highest prediction error in discontinuous flow?',
    ],
    accessNotes: ['Very large family. Always pick split and boundary condition first.', 'Excellent for truth cards about discontinuities.'],
    sourcePath: '/datasets/euler_multi_quadrants_openBC/',
    benchmarkId: 'euler_multi_quadrants_periodicBC',
  },
  {
    id: 'gray_scott_reaction_diffusion',
    label: 'Gray-Scott reaction diffusion',
    domain: 'Pattern formation',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '128 x 128',
    nSteps: '1,001',
    trajectories: '1,200',
    sizeGb: 154,
    software: 'Matlab',
    runtime: '33 h total',
    hardware: '40 CPU cores total',
    variants: [{ id: 'gray_scott_reaction_diffusion', label: 'Reaction diffusion', sizeGb: 154 }],
    fields: ['chemical concentration u', 'chemical concentration v'],
    phenomena: ['reaction diffusion', 'pattern formation', 'spot replication', 'nonlinear dynamics'],
    evidenceQuestions: [
      'Which parameter regimes create stable spots, stripes, or chaotic mixing?',
      'Can a model roll out 1,000-step pattern dynamics without collapse?',
      'Which local features forecast later global pattern changes?',
    ],
    accessNotes: ['Long trajectories make it useful for rollout-stability evidence.', 'Moderate size, good for first local cache after tiny probes.'],
    sourcePath: '/datasets/gray_scott_reaction_diffusion/',
    benchmarkId: 'gray_scott_reaction_diffusion',
  },
  {
    id: 'helmholtz_staircase',
    label: 'Helmholtz staircase',
    domain: 'Wave equations',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '1024 x 256',
    nSteps: '50',
    trajectories: '512',
    sizeGb: 52,
    software: 'Python',
    runtime: '0.11 h per simulation',
    hardware: '64 CPU cores',
    variants: [{ id: 'helmholtz_staircase', label: 'Helmholtz staircase', sizeGb: 52 }],
    fields: ['wave field', 'medium coefficients', 'boundary response'],
    phenomena: ['frequency-domain waves', 'staircase scattering', 'elliptic solves', 'structured boundaries'],
    evidenceQuestions: [
      'How do geometric boundaries change the Helmholtz solution field?',
      'Can a model preserve high-resolution wave detail?',
      'Which boundary features dominate prediction error?',
    ],
    accessNotes: ['Small by Well standards and visually crisp.', 'Good for search-to-simulation demos.'],
    sourcePath: '/datasets/helmholtz_staircase/',
    benchmarkId: 'helmholtz_staircase',
  },
  {
    id: 'MHD',
    label: 'Magnetohydrodynamics',
    domain: 'Plasma physics',
    coordinateSystem: 'Cartesian',
    dimension: '3D',
    resolution: '64^3 and 256^3',
    nSteps: '100',
    trajectories: '100',
    sizeGb: 4652,
    software: 'Fortran MPI',
    runtime: '48 h per MHD_256 simulation',
    hardware: '64 CPU cores',
    variants: [
      { id: 'MHD_64', label: '64^3', sizeGb: 72 },
      { id: 'MHD_256', label: '256^3', sizeGb: 4580 },
    ],
    fields: ['density', 'pressure', 'velocity', 'magnetic field'],
    phenomena: ['magnetic turbulence', 'plasma flow', 'field-line coupling', 'scale transfer'],
    evidenceQuestions: [
      'How do magnetic-field structures evolve across 3D turbulent flow?',
      'Which resolution is enough for a given surrogate experiment?',
      'Does a model preserve coupling between velocity and magnetic fields?',
    ],
    accessNotes: ['Start with MHD_64 before touching the 4.6 TB high-resolution set.', 'Natural target for multi-resolution evidence cards.'],
    sourcePath: '/datasets/MHD_64/',
    benchmarkId: 'MHD_64',
  },
  {
    id: 'planetswe',
    label: 'Planet shallow water equations',
    domain: 'Climate and geophysical flow',
    coordinateSystem: 'Angular',
    dimension: 'Angular',
    resolution: '256 x 512',
    nSteps: '1,008',
    trajectories: '120',
    sizeGb: 186,
    software: 'Dedalus',
    runtime: '0.75 h per simulation',
    hardware: '64 CPU cores',
    variants: [{ id: 'planetswe', label: 'Planet SWE', sizeGb: 186 }],
    fields: ['height', 'velocity', 'vorticity-like flow structure'],
    phenomena: ['planetary waves', 'shallow water dynamics', 'zonal flow', 'long-horizon rollout'],
    evidenceQuestions: [
      'How stable are long rollouts on angular grids?',
      'What flow structures persist across planetary time horizons?',
      'Can a model preserve global transport rather than only local texture?',
    ],
    accessNotes: ['Good bridge between physics simulation and climate-style reasoning.', 'Long trajectories reward evidence cards with rollout windows.'],
    sourcePath: '/datasets/planetswe/',
    benchmarkId: 'planetswe',
  },
  {
    id: 'post_neutron_star_merger',
    label: 'Post neutron star merger',
    domain: 'Relativistic astrophysics',
    coordinateSystem: 'Log-Spherical',
    dimension: 'Log-Spherical',
    resolution: '192 x 128 x 66',
    nSteps: '181',
    trajectories: '8',
    sizeGb: 110,
    software: 'nuhbhlight',
    runtime: '505 h total',
    hardware: '300 CPU cores total',
    variants: [{ id: 'post_neutron_star_merger', label: 'Merger remnant', sizeGb: 110 }],
    fields: ['density', 'temperature', 'velocity', 'composition proxies'],
    phenomena: ['compact-object remnants', 'outflows', 'log-spherical dynamics', 'nuclear astrophysics'],
    evidenceQuestions: [
      'Which remnant structures persist across the available trajectories?',
      'Can a model preserve rare, high-energy regions?',
      'What is the right caveat when simulation count is small?',
    ],
    accessNotes: ['Small trajectory count means strong provenance and caveats matter.', 'Useful for teaching evidence strength boundaries.'],
    sourcePath: '/datasets/post_neutron_star_merger/',
    benchmarkId: 'post_neutron_star_merger',
  },
  {
    id: 'rayleigh_benard',
    label: 'Rayleigh-Benard convection',
    domain: 'Thermal fluids',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '512 x 128',
    nSteps: '200',
    trajectories: '1,750',
    sizeGb: 358,
    software: 'Dedalus',
    runtime: '60 h total',
    hardware: '768 CPU cores total',
    variants: [
      { id: 'rayleigh_benard', label: 'Rayleigh-Benard', sizeGb: 358 },
      { id: 'rayleigh_benard_uniform', label: 'Uniform variant', note: 'Documented as a separate access page.' },
    ],
    fields: ['temperature', 'velocity', 'pressure-like state'],
    phenomena: ['convection cells', 'thermal plumes', 'buoyancy', 'chaotic rollouts'],
    evidenceQuestions: [
      'When do convection rolls emerge from thermal forcing?',
      'Which plumes create high long-horizon surrogate error?',
      'How does heat transport evolve across trajectories?',
    ],
    accessNotes: ['Rollout benchmarks are difficult here, so caveats should be prominent.', 'Good target for testing explanation honesty.'],
    sourcePath: '/datasets/rayleigh_benard/',
    benchmarkId: 'rayleigh_benard',
  },
  {
    id: 'rayleigh_taylor_instability',
    label: 'Rayleigh-Taylor instability',
    domain: 'Fluid instabilities',
    coordinateSystem: 'Cartesian',
    dimension: '3D',
    resolution: '128 x 128 x 128',
    nSteps: '120',
    trajectories: '45',
    sizeGb: 256,
    software: 'TurMix3D',
    runtime: '65 h total',
    hardware: '128 CPU cores total',
    variants: [{ id: 'rayleigh_taylor_instability', label: 'Rayleigh-Taylor instability', sizeGb: 256 }],
    fields: ['density', 'velocity', 'pressure-like state', 'mixing structure'],
    phenomena: ['fluid instability', 'mixing layers', 'plume growth', 'Atwood-number sensitivity'],
    evidenceQuestions: [
      'How fast does the mixing layer grow under the chosen parameters?',
      'Where do surrogate rollouts fail during nonlinear plume growth?',
      'Which statistics distinguish early linear growth from later turbulence?',
    ],
    accessNotes: ['Small trajectory count but high visual value.', 'Use validation/test split language carefully.'],
    sourcePath: '/datasets/rayleigh_taylor_instability/',
    benchmarkId: 'rayleigh_taylor_instability',
  },
  {
    id: 'shear_flow',
    label: 'Shear flow',
    domain: 'Fluid dynamics',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '128 x 256',
    nSteps: '200',
    trajectories: '1,120',
    sizeGb: 115,
    software: 'Dedalus',
    runtime: '5 h total',
    hardware: '448 CPU cores total',
    variants: [{ id: 'shear_flow', label: 'Shear flow', sizeGb: 115 }],
    fields: ['velocity', 'pressure-like state', 'vorticity-like structure'],
    phenomena: ['Kelvin-Helmholtz behavior', 'shear instabilities', 'vortex roll-up', 'mixing'],
    evidenceQuestions: [
      'Which initial shear profiles lead to vortex roll-up?',
      'Can a model keep coherent vortices through long rollouts?',
      'What field derivative best exposes instability growth?',
    ],
    accessNotes: ['Moderate size and strong visual interpretability.', 'Good candidate for a first real query-to-metric tool.'],
    sourcePath: '/datasets/shear_flow/',
    benchmarkId: 'shear_flow',
  },
  {
    id: 'supernova_explosion',
    label: 'Supernova explosion',
    domain: 'Astrophysics',
    coordinateSystem: 'Cartesian',
    dimension: '3D',
    resolution: '64^3 and 128^3',
    nSteps: '59',
    trajectories: '1,000',
    sizeGb: 1022,
    software: 'ASURA-FDPS',
    runtime: '4 h total',
    hardware: '1040 CPU cores total',
    variants: [
      { id: 'supernova_explosion_64', label: '64^3', sizeGb: 268 },
      { id: 'supernova_explosion_128', label: '128^3', sizeGb: 754 },
    ],
    fields: ['density', 'pressure', 'velocity', 'energy-like state'],
    phenomena: ['explosion fronts', 'shock propagation', '3D ejecta structure', 'resolution comparison'],
    evidenceQuestions: [
      'How does resolution affect explosion-front morphology?',
      'Can a surrogate retain large-scale shock geometry?',
      'Which fields reveal failure before a rollout visibly diverges?',
    ],
    accessNotes: ['Use 64^3 for early experiments, 128^3 only when resolution matters.', 'Good for multi-resolution truth cards.'],
    sourcePath: '/datasets/supernova_explosion_64/',
    benchmarkId: 'supernova_explosion_64',
  },
  {
    id: 'turbulence_gravity_cooling',
    label: 'Turbulence with gravity and cooling',
    domain: 'Astrophysical fluids',
    coordinateSystem: 'Cartesian',
    dimension: '3D',
    resolution: '64 x 64 x 64',
    nSteps: '50',
    trajectories: '2,700',
    sizeGb: 829,
    software: 'ASURA-FDPS',
    runtime: '577 h total',
    hardware: '1040 CPU cores total',
    variants: [{ id: 'turbulence_gravity_cooling', label: 'Gravity cooling turbulence', sizeGb: 829 }],
    fields: ['density', 'pressure', 'velocity', 'cooling-related state'],
    phenomena: ['self-gravity', 'cooling flows', 'compressible turbulence', 'structure formation'],
    evidenceQuestions: [
      'How do gravity and cooling alter turbulent density structure?',
      'Which statistics separate texture matching from physical fidelity?',
      'Can a model preserve rare dense regions?',
    ],
    accessNotes: ['Large, but lower resolution than several 3D sets.', 'Strong candidate for density-statistic evidence cards.'],
    sourcePath: '/datasets/turbulence_gravity_cooling/',
    benchmarkId: 'turbulence_gravity_cooling',
  },
  {
    id: 'turbulent_radiative_layer',
    label: 'Turbulent radiative layer',
    domain: 'Radiation hydrodynamics',
    coordinateSystem: 'Cartesian',
    dimension: '3D',
    resolution: '2D: 128 x 384, 3D: 128 x 128 x 256',
    nSteps: '101',
    trajectories: '90 per variant',
    sizeGb: 751.9,
    software: 'Athena++',
    runtime: '2 h total for 2D, 271 h total for 3D',
    hardware: '48 CPU cores for 2D, 128 CPU cores for 3D',
    variants: [
      { id: 'turbulent_radiative_layer_2D', label: '2D', sizeGb: 6.9 },
      { id: 'turbulent_radiative_layer_3D', label: '3D', sizeGb: 745 },
    ],
    fields: ['density', 'pressure', 'velocity', 'radiative state'],
    phenomena: ['radiation hydrodynamics', 'stratified turbulence', 'cooling layers', '2D-to-3D comparison'],
    evidenceQuestions: [
      'What changes when the same radiative layer is studied in 2D vs 3D?',
      'Can a quick 2D probe decide whether the 3D cache is worth downloading?',
      'Which metrics survive dimensionality changes?',
    ],
    accessNotes: ['The 2D variant is the smallest Well dataset and ideal for first probes.', 'Treat the 3D variant as an on-demand cache target.'],
    sourcePath: '/datasets/turbulent_radiative_layer_2D/',
    benchmarkId: 'turbulent_radiative_layer_2D',
  },
  {
    id: 'viscoelastic_instability',
    label: 'Viscoelastic instability',
    domain: 'Complex fluids',
    coordinateSystem: 'Cartesian',
    dimension: '2D',
    resolution: '512 x 512',
    nSteps: 'variable',
    trajectories: '260',
    sizeGb: 66,
    software: 'Dedalus',
    runtime: '34 h total',
    hardware: '64 CPU cores',
    variants: [{ id: 'viscoelastic_instability', label: 'Viscoelastic instability', sizeGb: 66 }],
    fields: ['velocity', 'polymer stress', 'pressure-like state'],
    phenomena: ['elastic turbulence', 'polymer stress', 'instability onset', 'complex fluid flow'],
    evidenceQuestions: [
      'How do polymer stresses drive or reveal instability?',
      'Which observables are most useful when trajectory length varies?',
      'Can a surrogate preserve stress-flow coupling?',
    ],
    accessNotes: ['Small enough for early experiments, but variable steps need careful batching.', 'Good for testing tensor-aware schema design.'],
    sourcePath: '/datasets/viscoelastic_instability/',
    benchmarkId: 'viscoelastic_instability',
  },
];

const DOMAIN_MEASUREMENTS: Record<string, string[]> = {
  Acoustics: ['wave arrival time', 'reflection amplitude', 'pressure-field error', 'boundary-condition sensitivity'],
  'Biological physics': ['order-parameter growth', 'tensor-field coherence', 'flow-alignment score', 'field-wise VRMSE'],
  Astrophysics: ['density contrast', 'velocity divergence', 'shock or plume morphology', 'field-wise rollout error'],
  'Compressible fluids': ['shock location error', 'contact-discontinuity sharpness', 'conserved-field drift', 'rollout VRMSE'],
  'Pattern formation': ['pattern wavelength', 'spot or stripe count', 'long-horizon divergence', 'spectral error'],
  'Wave equations': ['phase error', 'boundary response', 'frequency-band error', 'coefficient sensitivity'],
  'Plasma physics': ['magnetic-field energy', 'velocity-field coupling', 'spectral energy transfer', 'resolution sensitivity'],
  'Climate and geophysical flow': ['height-field transport', 'zonal-flow persistence', 'long-horizon VRMSE', 'spectral drift'],
  'Relativistic astrophysics': ['outflow morphology', 'rare-region preservation', 'trajectory-to-trajectory variance', 'field-wise error'],
  'Thermal fluids': ['heat transport proxy', 'plume growth', 'rollout stability', 'temperature-field spectrum'],
  'Fluid instabilities': ['mixing-layer width', 'plume-tip growth', 'density-gradient statistics', 'rollout divergence'],
  'Fluid dynamics': ['vortex coherence', 'vorticity spectrum', 'mixing-rate proxy', 'long-horizon rollout error'],
  'Astrophysical fluids': ['density PDF', 'rare dense-region recall', 'cooling-flow morphology', 'spectral slope'],
  'Radiation hydrodynamics': ['2D-to-3D metric transfer', 'radiative-layer structure', 'density contrast', 'rollout window error'],
  'Complex fluids': ['stress-flow coupling', 'elastic-instability growth', 'trajectory-length coverage', 'tensor-aware error'],
};

export function getWellCatalogStats() {
  const totalSizeGb = THE_WELL_CATALOG.reduce((sum, dataset) => sum + dataset.sizeGb, 0);
  const variantCount = THE_WELL_CATALOG.reduce((sum, dataset) => sum + dataset.variants.length, 0);
  const threeDimensional = THE_WELL_CATALOG.filter((dataset) =>
    dataset.dimension === '3D' || dataset.dimension === 'Spherical' || dataset.dimension === 'Log-Spherical',
  ).length;

  return {
    familyCount: THE_WELL_CATALOG.length,
    variantCount,
    totalSizeGb,
    totalSizeLabel: formatSizeGb(totalSizeGb),
    threeDimensional,
  };
}

export function formatSizeGb(sizeGb: number): string {
  if (sizeGb >= 1000) {
    const tb = sizeGb / 1000;
    return `${tb >= 10 ? tb.toFixed(1) : tb.toFixed(2)} TB`;
  }
  if (sizeGb < 10) {
    return `${sizeGb.toFixed(1)} GB`;
  }
  return `${Math.round(sizeGb).toLocaleString()} GB`;
}

export function getDatasetById(id: string): WellDatasetFamily | undefined {
  return THE_WELL_CATALOG.find((dataset) => dataset.id === id || dataset.variants.some((variant) => variant.id === id));
}

export function getPrimaryAccessName(dataset: WellDatasetFamily): string {
  return dataset.variants[0]?.id ?? dataset.id;
}

export function buildWellDatasetUrl(dataset: WellDatasetFamily): string {
  return `${THE_WELL_SOURCE_URL.replace(/\/$/, '')}${dataset.sourcePath}`;
}

export function buildDownloadCommand(dataset: WellDatasetFamily, split = 'train'): string {
  const accessName = getPrimaryAccessName(dataset);
  return `the-well-download --base-path ./well-cache --dataset ${accessName} --split ${split}`;
}

export function buildStreamingSnippet(dataset: WellDatasetFamily, split = 'train'): string {
  const accessName = getPrimaryAccessName(dataset);
  return [
    'from the_well.data import WellDataset',
    '',
    'dataset = WellDataset(',
    `    well_base_path="${THE_WELL_HF_BASE}",`,
    `    well_dataset_name="${accessName}",`,
    `    well_split_name="${split}",`,
    ')',
  ].join('\n');
}

export function buildWellResearchPrompt(truthCard: WellTruthCard, dataset: WellDatasetFamily): string {
  const accessName = getPrimaryAccessName(dataset);
  return [
    'Research Lab handoff: use The Well as a simulated-evidence substrate, not as an oracle.',
    '',
    `Question: ${truthCard.question}`,
    `Dataset family: ${dataset.label} (${dataset.id})`,
    `Exact access name: ${accessName}`,
    `Domain: ${dataset.domain}`,
    `Grid: ${dataset.coordinateSystem} ${dataset.dimension}`,
    `Resolution: ${dataset.resolution}`,
    `Steps: ${dataset.nSteps}`,
    `Trajectories: ${dataset.trajectories}`,
    `Raw data boundary: do not assume tensors are loaded. Stream or cache only the selected split/variant if needed.`,
    '',
    'Claim boundary:',
    truthCard.claimBoundary,
    '',
    'Evidence plan:',
    ...truthCard.accessPlan.map((step, index) => `${index + 1}. ${step}`),
    '',
    `Candidate measurements: ${truthCard.measurements.join(', ')}`,
    `Caveats: ${truthCard.caveats.join(' ')}`,
    '',
    'Answer as Luca by first stating what this simulated evidence can and cannot test, then propose the smallest reproducible next step.',
  ].join('\n');
}

export function rankWellDatasets(query: string, limit = 5): WellDatasetFamily[] {
  const terms = normalizeTerms(query);
  if (terms.length === 0) return THE_WELL_CATALOG.slice(0, limit);

  return THE_WELL_CATALOG
    .map((dataset) => ({ dataset, score: scoreDataset(dataset, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.dataset.sizeGb - a.dataset.sizeGb)
    .slice(0, limit)
    .map((entry) => entry.dataset);
}

export function createWellTruthCard(question: string, dataset: WellDatasetFamily): WellTruthCard {
  const normalizedQuestion = question.trim() || `What can ${dataset.label} test?`;
  const primaryAccessName = getPrimaryAccessName(dataset);
  const directness = normalizedQuestion.length > 16 ? 'simulation-direct' : 'catalog-only';

  return {
    question: normalizedQuestion,
    datasetId: dataset.id,
    datasetLabel: dataset.label,
    evidenceLevel: directness,
    claimBoundary: `Evidence is conditional on The Well's simulated ${dataset.domain.toLowerCase()} setup, ${dataset.coordinateSystem.toLowerCase()} grid, ${dataset.resolution} resolution, and generated ${dataset.software} trajectories.`,
    accessPlan: [
      `Use catalog metadata first: ${dataset.label}, ${dataset.resolution}, ${dataset.nSteps} steps, ${dataset.trajectories} trajectories.`,
      `Access only the needed split and variant: ${primaryAccessName}.`,
      `Prefer Hugging Face streaming for triage, then local cache if repeated or large-batch analysis is needed.`,
      `Record exact split, trajectory ids, timestep window, fields, metrics, and code in the truth card.`,
    ],
    measurements: DOMAIN_MEASUREMENTS[dataset.domain] ?? ['field-wise error', 'rollout divergence', 'spectral drift', 'trajectory variance'],
    caveats: [
      'This is simulated evidence, not direct observational measurement.',
      'A result should state equations, solver, parameters, grid, split, and boundary conditions when known.',
      'Raw tensor data is not part of Luca memory by default; it is streamed or cached only for the selected task.',
    ],
  };
}

function normalizeTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function scoreDataset(dataset: WellDatasetFamily, terms: string[]): number {
  const haystack = [
    dataset.id,
    dataset.label,
    dataset.domain,
    dataset.coordinateSystem,
    dataset.dimension,
    dataset.resolution,
    dataset.software,
    ...dataset.variants.map((variant) => `${variant.id} ${variant.label}`),
    ...dataset.fields,
    ...dataset.phenomena,
    ...dataset.evidenceQuestions,
  ].join(' ').toLowerCase();

  return terms.reduce((score, term) => {
    if (dataset.id.toLowerCase().includes(term)) return score + 6;
    if (dataset.label.toLowerCase().includes(term)) return score + 5;
    if (dataset.domain.toLowerCase().includes(term)) return score + 4;
    if (dataset.fields.some((field) => field.toLowerCase().includes(term))) return score + 3;
    if (dataset.phenomena.some((phenomenon) => phenomenon.toLowerCase().includes(term))) return score + 3;
    if (haystack.includes(term)) return score + 1;
    return score;
  }, 0);
}

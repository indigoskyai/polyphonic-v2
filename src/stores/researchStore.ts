import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  THE_WELL_API_URL,
  THE_WELL_BENCHMARKS_URL,
  THE_WELL_DATASET_OVERVIEW_URL,
  THE_WELL_DATA_FORMAT_URL,
  THE_WELL_HF_BASE,
  buildDownloadCommand,
  buildStreamingSnippet,
  buildWellDatasetUrl,
  getPrimaryAccessName,
  type WellDatasetFamily,
  type WellTruthCard,
} from '@/lib/theWellCatalog';
import type { SimulationArtifactPayload } from '@/lib/simulationArtifacts';

type EvidenceLevel = WellTruthCard['evidenceLevel'];
type EvidenceStatus = 'draft' | 'ready' | 'validated' | 'archived';

export interface ResearchEvidenceCard {
  id: string;
  user_id: string;
  agent_id: string;
  thread_id: string | null;
  project_id: string | null;
  source_message_id: string | null;
  artifact_id: string | null;
  title: string;
  question: string;
  dataset_id: string;
  dataset_label: string;
  evidence_level: EvidenceLevel;
  claim_boundary: string;
  access_plan: string[];
  measurements: string[];
  caveats: string[];
  raw_access: Record<string, unknown>;
  result_summary: string | null;
  status: EvidenceStatus;
  metadata: Record<string, unknown>;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface SaveResearchCardInput {
  userId: string;
  agentId?: string;
  truthCard: WellTruthCard;
  dataset: WellDatasetFamily;
  threadId?: string | null;
  projectId?: string | null;
  sourceMessageId?: string | null;
  resultSummary?: string | null;
  status?: EvidenceStatus;
  artifactId?: string | null;
}

interface SaveSimulationCardInput {
  userId: string;
  payload: SimulationArtifactPayload;
  artifactId?: string | null;
  threadId?: string | null;
  sourceMessageId?: string | null;
  resultSummary?: string | null;
  status?: EvidenceStatus;
}

interface ResearchState {
  cards: ResearchEvidenceCard[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  selectedCardId: string | null;
  loadCards: (userId: string) => Promise<void>;
  saveWellTruthCard: (input: SaveResearchCardInput) => Promise<ResearchEvidenceCard>;
  saveSimulationTruthCard: (input: SaveSimulationCardInput) => Promise<ResearchEvidenceCard>;
  archiveCard: (cardId: string) => Promise<void>;
  setSelectedCardId: (cardId: string | null) => void;
  clearError: () => void;
}

const db = supabase as any;

async function insertResearchEvidenceCard(payload: Record<string, unknown>) {
  const first = await db
    .from('research_evidence_cards')
    .insert(payload)
    .select()
    .single();

  if (!first.error || !('artifact_id' in payload) || !isMissingArtifactIdColumnError(first.error)) {
    return first;
  }

  const { artifact_id: _artifactId, ...legacyPayload } = payload;
  return db
    .from('research_evidence_cards')
    .insert(legacyPayload)
    .select()
    .single();
}

function isMissingArtifactIdColumnError(error: unknown): boolean {
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message
    : String(error || '');
  return /artifact_id/i.test(message) && /(column|schema|cache|could not find|unknown)/i.test(message);
}

export function buildResearchCardTitle(truthCard: WellTruthCard): string {
  const question = truthCard.question.trim().replace(/\s+/g, ' ');
  if (question.length <= 74) return question;
  return `${question.slice(0, 71).trim()}...`;
}

export function buildWellRawAccess(dataset: WellDatasetFamily) {
  const datasetName = getPrimaryAccessName(dataset);
  return {
    source: 'the_well',
    raw_ingest_default: false,
    ingest_boundary: 'catalog_metadata_first_raw_tensors_on_demand',
    hf_base_path: THE_WELL_HF_BASE,
    dataset_name: datasetName,
    preferred_split: 'train',
    streaming_snippet: buildStreamingSnippet(dataset),
    download_command: buildDownloadCommand(dataset),
    docs: {
      dataset: buildWellDatasetUrl(dataset),
      overview: THE_WELL_DATASET_OVERVIEW_URL,
      format: THE_WELL_DATA_FORMAT_URL,
      api: THE_WELL_API_URL,
      benchmarks: THE_WELL_BENCHMARKS_URL,
    },
    variants: dataset.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      size_gb: variant.sizeGb ?? null,
      note: variant.note ?? null,
    })),
  };
}

export function normalizeResearchCard(row: Record<string, unknown>): ResearchEvidenceCard {
  const now = new Date().toISOString();
  return {
    id: stringOr(row.id, crypto.randomUUID()),
    user_id: stringOr(row.user_id, ''),
    agent_id: stringOr(row.agent_id, 'luca'),
    thread_id: nullableString(row.thread_id),
    project_id: nullableString(row.project_id),
    source_message_id: nullableString(row.source_message_id),
    artifact_id: nullableString(row.artifact_id),
    title: stringOr(row.title, 'Untitled evidence card'),
    question: stringOr(row.question, ''),
    dataset_id: stringOr(row.dataset_id, ''),
    dataset_label: stringOr(row.dataset_label, ''),
    evidence_level: isEvidenceLevel(row.evidence_level) ? row.evidence_level : 'catalog-only',
    claim_boundary: stringOr(row.claim_boundary, ''),
    access_plan: stringArray(row.access_plan),
    measurements: stringArray(row.measurements),
    caveats: stringArray(row.caveats),
    raw_access: objectOrEmpty(row.raw_access),
    result_summary: nullableString(row.result_summary),
    status: isEvidenceStatus(row.status) ? row.status : 'draft',
    metadata: objectOrEmpty(row.metadata),
    archived: row.archived === true,
    created_at: stringOr(row.created_at, now),
    updated_at: stringOr(row.updated_at, stringOr(row.created_at, now)),
  };
}

export const useResearchStore = create<ResearchState>((set, get) => ({
  cards: [],
  loading: false,
  saving: false,
  error: null,
  selectedCardId: null,

  loadCards: async (userId) => {
    set({ loading: true, error: null });
    const { data, error } = await db
      .from('research_evidence_cards')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(80);

    if (error) {
      set({ cards: [], loading: false, error: error.message || 'Failed to load research evidence cards.' });
      return;
    }

    set({
      cards: (data || []).map((row: Record<string, unknown>) => normalizeResearchCard(row)),
      loading: false,
      error: null,
    });
  },

  saveWellTruthCard: async ({
    userId,
    agentId = 'luca',
    truthCard,
    dataset,
    threadId = null,
    projectId = null,
    sourceMessageId = null,
    resultSummary = null,
    status = 'ready',
    artifactId = null,
  }) => {
    set({ saving: true, error: null });
    const payload = {
      user_id: userId,
      agent_id: agentId,
      thread_id: threadId,
      project_id: projectId,
      source_message_id: sourceMessageId,
      artifact_id: artifactId,
      title: buildResearchCardTitle(truthCard),
      question: truthCard.question,
      dataset_id: truthCard.datasetId,
      dataset_label: truthCard.datasetLabel,
      evidence_level: truthCard.evidenceLevel,
      claim_boundary: truthCard.claimBoundary,
      access_plan: truthCard.accessPlan,
      measurements: truthCard.measurements,
      caveats: truthCard.caveats,
      raw_access: buildWellRawAccess(dataset),
      result_summary: resultSummary,
      status,
      metadata: {
        source: 'the_well',
        generated_by: 'research_lab',
        source_dataset_path: dataset.sourcePath,
        benchmark_id: dataset.benchmarkId ?? null,
        domain: dataset.domain,
        coordinate_system: dataset.coordinateSystem,
        dimension: dataset.dimension,
      },
    };

    const { data, error } = await insertResearchEvidenceCard(payload);

    if (error || !data) {
      const message = error?.message || 'Failed to save research evidence card.';
      set({ saving: false, error: message });
      throw new Error(message);
    }

    const card = normalizeResearchCard(data);
    set((state) => ({
      saving: false,
      error: null,
      selectedCardId: card.id,
      cards: [card, ...state.cards.filter((item) => item.id !== card.id)],
    }));
    return card;
  },

  saveSimulationTruthCard: async ({
    userId,
    payload,
    artifactId = null,
    threadId = null,
    sourceMessageId = null,
    resultSummary = null,
    status = 'ready',
  }) => {
    set({ saving: true, error: null });
    const cardPayload = {
      user_id: userId,
      agent_id: 'luca',
      thread_id: threadId,
      project_id: null,
      source_message_id: sourceMessageId,
      artifact_id: artifactId,
      title: payload.title,
      question: payload.question,
      dataset_id: payload.dataset.family_id,
      dataset_label: payload.dataset.label,
      evidence_level: payload.evidence.evidence_level,
      claim_boundary: payload.evidence.claim_boundary,
      access_plan: [
        `Use the inline simulation artifact as the preview workspace: ${payload.title}.`,
        `Access only the selected Well split and variant: ${payload.dataset.access_name}.`,
        'Keep raw tensors out of memory by default; stream or cache only for an explicit analysis step.',
        'Record exact fields, timestep window, parameters, and measurements before treating the result as evidence.',
      ],
      measurements: payload.evidence.measurements,
      caveats: payload.evidence.caveats,
      raw_access: {
        source: 'the_well',
        raw_ingest_default: false,
        ingest_boundary: 'catalog_metadata_first_raw_tensors_on_demand',
        dataset_name: payload.dataset.access_name,
        streaming_snippet: payload.access.streaming_snippet,
        download_command: payload.access.download_command,
        docs: {
          dataset: payload.dataset.docs_url,
          overview: THE_WELL_DATASET_OVERVIEW_URL,
          format: THE_WELL_DATA_FORMAT_URL,
          api: THE_WELL_API_URL,
          benchmarks: THE_WELL_BENCHMARKS_URL,
        },
      },
      result_summary: resultSummary,
      status,
      metadata: {
        source: 'the_well',
        generated_by: 'inline_simulation_turn',
        simulation_preset: payload.preview.preset,
        fields: payload.preview.fields,
        parameters: payload.preview.parameters,
        initial_state: payload.preview.initial_state,
        color_mode: payload.preview.color_mode,
      },
    };

    const { data, error } = await insertResearchEvidenceCard(cardPayload);

    if (error || !data) {
      const message = error?.message || 'Failed to save simulation evidence card.';
      set({ saving: false, error: message });
      throw new Error(message);
    }

    const card = normalizeResearchCard(data);
    set((state) => ({
      saving: false,
      error: null,
      selectedCardId: card.id,
      cards: [card, ...state.cards.filter((item) => item.id !== card.id)],
    }));
    return card;
  },

  archiveCard: async (cardId) => {
    const { error } = await db
      .from('research_evidence_cards')
      .update({ archived: true, status: 'archived' })
      .eq('id', cardId);

    if (error) {
      set({ error: error.message || 'Failed to archive research evidence card.' });
      throw new Error(error.message || 'Failed to archive research evidence card.');
    }

    set((state) => ({
      cards: state.cards.filter((card) => card.id !== cardId),
      selectedCardId: state.selectedCardId === cardId ? null : state.selectedCardId,
    }));
  },

  setSelectedCardId: (selectedCardId) => set({ selectedCardId }),
  clearError: () => set({ error: null }),
}));

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isEvidenceLevel(value: unknown): value is EvidenceLevel {
  return value === 'simulation-direct' || value === 'simulation-proxy' || value === 'catalog-only';
}

function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return value === 'draft' || value === 'ready' || value === 'validated' || value === 'archived';
}

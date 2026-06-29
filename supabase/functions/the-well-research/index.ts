import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/serviceRoleGuard.ts";
import {
  THE_WELL_CATALOG,
  buildDownloadCommand,
  buildStreamingSnippet,
  buildWellDatasetUrl,
  createWellTruthCard,
  getWellCatalogStats,
  getDatasetById,
  getPrimaryAccessName,
  rankWellDatasets,
} from "../_shared/the-well-catalog.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);
  const unauthorized = requireServiceRole(req, corsHeaders);
  if (unauthorized) return unauthorized;

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, corsHeaders, 405);
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const datasetId = typeof body.dataset_id === "string" ? body.dataset_id.trim() : "";
    const limit = clampInteger(body.limit, 1, 8, 5);
    const selected = datasetId ? getDatasetById(datasetId) : null;
    const matches = selected ? [selected] : rankWellDatasets(query, limit);
    const primary = matches[0] || THE_WELL_CATALOG[0];
    const truthCard = createWellTruthCard(query || `What can ${primary.label} test?`, primary);

    return json({
      ok: true,
      source: "the_well",
      raw_ingest_default: false,
      ingest_boundary: "catalog_metadata_first_raw_tensors_on_demand",
      stats: getWellCatalogStats(),
      selected: serializeDataset(primary),
      matches: matches.map(serializeDataset),
      truth_card: truthCard,
      access: {
        dataset_name: getPrimaryAccessName(primary),
        streaming_snippet: buildStreamingSnippet(primary),
        download_command: buildDownloadCommand(primary),
        dataset_docs_url: buildWellDatasetUrl(primary),
      },
    }, corsHeaders);
  } catch (error) {
    console.error("[the-well-research] failed", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, corsHeaders, 500);
  }
});

function serializeDataset(dataset: typeof THE_WELL_CATALOG[number]) {
  return {
    id: dataset.id,
    label: dataset.label,
    domain: dataset.domain,
    coordinate_system: dataset.coordinateSystem,
    dimension: dataset.dimension,
    resolution: dataset.resolution,
    n_steps: dataset.nSteps,
    trajectories: dataset.trajectories,
    size_gb: dataset.sizeGb,
    software: dataset.software,
    variants: dataset.variants,
    fields: dataset.fields,
    phenomena: dataset.phenomena,
    evidence_questions: dataset.evidenceQuestions,
    access_notes: dataset.accessNotes,
    benchmark_id: dataset.benchmarkId ?? null,
    docs_url: buildWellDatasetUrl(dataset),
  };
}

function json(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

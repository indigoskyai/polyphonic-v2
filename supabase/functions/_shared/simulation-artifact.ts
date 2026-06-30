export const SIMULATION_PRESETS = [
  "wave-scattering",
  "reaction-diffusion",
  "fluid-field",
  "field-lines",
  "particle-shell",
] as const;

export type SimulationPreset = typeof SIMULATION_PRESETS[number];
export type SimulationEvidenceLevel = "simulation-direct" | "simulation-proxy" | "catalog-only";

export interface SimulationDatasetRef {
  family_id: string;
  label: string;
  access_name: string;
  docs_url: string;
}

export interface SimulationEvidence {
  claim_boundary: string;
  evidence_level: SimulationEvidenceLevel;
  measurements: string[];
  caveats: string[];
}

export interface SimulationPreview {
  preset: SimulationPreset;
  fields: string[];
  parameters: Record<string, number>;
  initial_state: Record<string, number>;
  color_mode: string;
}

export interface SimulationAccess {
  streaming_snippet: string;
  download_command: string;
  raw_ingest_default: false;
}

export interface SimulationArtifactPayload {
  version: 1;
  title: string;
  question: string;
  dataset: SimulationDatasetRef;
  evidence: SimulationEvidence;
  preview: SimulationPreview;
  access: SimulationAccess;
}

export type SimulationParseResult =
  | { ok: true; payload: SimulationArtifactPayload; error?: never; details?: never }
  | { ok: false; payload?: never; error: string; details?: string[] };

export function isSimulationPreset(value: unknown): value is SimulationPreset {
  return typeof value === "string" && (SIMULATION_PRESETS as readonly string[]).includes(value);
}

export function parseSimulationArtifactContent(content: string): SimulationParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse((content || "").trim());
  } catch (error) {
    return {
      ok: false,
      error: "Simulation JSON is invalid.",
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
  return validateSimulationArtifactPayload(parsed);
}

export function validateSimulationArtifactPayload(value: unknown): SimulationParseResult {
  const details: string[] = [];
  const root = record(value);
  if (!root) return invalid("Simulation payload must be a JSON object.");

  if (root.version !== 1) details.push("version must be 1");
  const title = requiredString(root.title, "title", details);
  const question = requiredString(root.question, "question", details);

  const datasetRoot = record(root.dataset);
  if (!datasetRoot) details.push("dataset must be an object");
  const dataset = {
    family_id: requiredString(datasetRoot?.family_id, "dataset.family_id", details),
    label: requiredString(datasetRoot?.label, "dataset.label", details),
    access_name: requiredString(datasetRoot?.access_name, "dataset.access_name", details),
    docs_url: requiredString(datasetRoot?.docs_url, "dataset.docs_url", details),
  };

  const evidenceRoot = record(root.evidence);
  if (!evidenceRoot) details.push("evidence must be an object");
  const evidenceLevel = evidenceRoot?.evidence_level;
  if (!isEvidenceLevel(evidenceLevel)) details.push("evidence.evidence_level must be simulation-direct, simulation-proxy, or catalog-only");
  const evidence = {
    claim_boundary: requiredString(evidenceRoot?.claim_boundary, "evidence.claim_boundary", details),
    evidence_level: isEvidenceLevel(evidenceLevel) ? evidenceLevel : "catalog-only",
    measurements: stringArray(evidenceRoot?.measurements, "evidence.measurements", details),
    caveats: stringArray(evidenceRoot?.caveats, "evidence.caveats", details),
  };

  const previewRoot = record(root.preview);
  if (!previewRoot) details.push("preview must be an object");
  const preset = previewRoot?.preset;
  if (!isSimulationPreset(preset)) details.push(`preview.preset must be one of ${SIMULATION_PRESETS.join(", ")}`);
  const preview = {
    preset: isSimulationPreset(preset) ? preset : "fluid-field",
    fields: stringArray(previewRoot?.fields, "preview.fields", details),
    parameters: numericRecord(previewRoot?.parameters, "preview.parameters", details),
    initial_state: numericRecord(previewRoot?.initial_state, "preview.initial_state", details),
    color_mode: requiredString(previewRoot?.color_mode, "preview.color_mode", details),
  };

  const accessRoot = record(root.access);
  if (!accessRoot) details.push("access must be an object");
  if (accessRoot?.raw_ingest_default !== false) details.push("access.raw_ingest_default must be false");
  const access = {
    streaming_snippet: requiredString(accessRoot?.streaming_snippet, "access.streaming_snippet", details),
    download_command: requiredString(accessRoot?.download_command, "access.download_command", details),
    raw_ingest_default: false as const,
  };

  if (details.length > 0) {
    return { ok: false, error: "Simulation payload does not match the v1 contract.", details };
  }

  return {
    ok: true,
    payload: {
      version: 1,
      title,
      question,
      dataset,
      evidence,
      preview,
      access,
    },
  };
}

export function simulationTitleFromContent(content: string): string {
  const parsed = parseSimulationArtifactContent(content);
  return parsed.ok ? parsed.payload.title : "Simulation preview";
}

function invalid(error: string): SimulationParseResult {
  return { ok: false, error, details: [error] };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown, label: string, details: string[]): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  details.push(`${label} is required`);
  return "";
}

function stringArray(value: unknown, label: string, details: string[]): string[] {
  if (!Array.isArray(value)) {
    details.push(`${label} must be an array`);
    return [];
  }
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  if (strings.length === 0) details.push(`${label} must include at least one string`);
  return strings;
}

function numericRecord(value: unknown, label: string, details: string[]): Record<string, number> {
  const source = record(value);
  if (!source) {
    details.push(`${label} must be an object`);
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(source)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function isEvidenceLevel(value: unknown): value is SimulationEvidenceLevel {
  return value === "simulation-direct" || value === "simulation-proxy" || value === "catalog-only";
}

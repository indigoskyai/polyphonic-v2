export const SIMULATION_TURN_DIRECTIVE = `Client simulation turn directive:
- This Luca conversation turn is asking for a physics simulation preview.
- Do not answer with html, svg, jsx, tsx, react, or mermaid artifact fences.
- Do not use any fenced code block except the one simulation JSON block.
- Keep the visible prose concise: 2-4 short paragraphs plus at most 4 bullets. Do not output a separate truth-card table; the card handles evidence, access, caveats, and saving.
- Answer naturally in prose, then include exactly one complete fenced block tagged simulation.
- The simulation fence must contain valid JSON only, with this v1 shape:
{
  "version": 1,
  "title": "short simulation title",
  "question": "the user's simulation question",
  "dataset": {
    "family_id": "the_well_family_id",
    "label": "human readable The Well dataset label",
    "access_name": "exact The Well access name",
    "docs_url": "https://polymathic-ai.org/the_well/"
  },
  "evidence": {
    "claim_boundary": "plain boundary between dataset grounding and deterministic preview",
    "evidence_level": "simulation-proxy",
    "measurements": ["measurement names"],
    "caveats": ["caveats"]
  },
  "preview": {
    "preset": "fluid-field",
    "fields": ["velocity", "temperature", "vorticity"],
    "parameters": { "cooling": 0.7, "viscosity": 0.25 },
    "initial_state": { "seed": 17, "timestep": 0.38 },
    "color_mode": "thermal"
  },
  "access": {
    "streaming_snippet": "short code snippet for metadata-first streaming access",
    "download_command": "metadata-first The Well download command",
    "raw_ingest_default": false
  }
}
- Allowed preview.preset values: wave-scattering, reaction-diffusion, fluid-field, field-lines, particle-shell.
- Use The Well metadata/evidence boundaries. Do not claim raw tensors were downloaded or analyzed in this V1 path.`;

const SIMULATION_INTENT_RE = /\b(show|build|make|create|run|model|compare|visuali[sz]e|simulate|preview|what happens)\b[\s\S]{0,220}\b(simulation|physics|turbulence|cooling|fluid|wave|reaction[-\s]?diffusion|field lines?|particle shell|mhd|magnetohydrodynamic|shock|radiative|vorticity|viscosity)\b/i;
const SIMULATION_OBJECT_RE = /\b(inline simulation|simulation preview|truth card|timestep|scrubber|slider|The Well|dataset evidence)\b/i;

export function looksLikeSimulationTurnRequest(text: string): boolean {
  const normalized = (text || '').trim();
  if (!normalized) return false;
  return SIMULATION_INTENT_RE.test(normalized) || (
    /\b(simulation|preview|model)\b/i.test(normalized)
    && SIMULATION_OBJECT_RE.test(normalized)
  );
}

export function withClientSimulationTurnDirective(text: string): string {
  return `${text.trim()}\n\n${SIMULATION_TURN_DIRECTIVE}`;
}

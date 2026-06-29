# Polyphonic Research UX Handoff Packet

## 1. Product Concept

Polyphonic's research feature is Luca's truth-seeking workspace: a research surface where Luca can ground claims in structured sources, preserve evidence boundaries, and turn research into durable truth cards.

The current research feature is centered on **The Well Registry**, a structured registry of physics simulation datasets from The Well. The intent is not to ingest or memorize all raw tensors. The intent is pointer-first research:

- catalog metadata first
- exact dataset and access names
- fields, phenomena, dimensions, resolutions, steps, and trajectories
- reproducible access snippets
- caveats and evidence boundaries
- raw tensor streaming or cache only when explicitly needed

Research with Luca should feel like moving from a natural question to a grounded, reproducible evidence object.

## 2. The Well Registry Purpose

The Well Registry is Luca's interface to a large physics simulation catalog. It helps a user ask:

- Which simulated world can test this physical claim?
- What dataset family best matches this phenomenon?
- What fields and measurements should Luca inspect?
- What access name or split should be used?
- What caveats must be preserved?
- What truth card should be saved?

The Registry treats The Well as simulated evidence, not direct observation. The default stance is: this is evidence under stated equations, solvers, grids, parameters, and generated trajectories.

Current principle shown in the UI:

`Default ingest: 0 GB raw tensors`

Meaning:

- catalog, metadata, provenance, and access paths are loaded first
- raw tensors are not stored in memory, artifacts, or evidence cards by default
- future compute can stream or cache specific raw tensors per task

## 3. Research Tab Surface

Route: `/research`

Primary component: `src/pages/ResearchView.tsx`

Sidebar component: `src/components/sidebar/SidebarResearch.tsx`

Data and catalog sources:

- `src/lib/theWellCatalog.ts`
- `supabase/functions/_shared/the-well-catalog.ts`

Runtime tool:

- `supabase/functions/the-well-research/index.ts`

The Research tab currently presents a dense research dashboard called **The Well Registry**.

Visible surfaces:

- Left app rail: main navigation with Research selected and a flask icon.
- Research sidebar: header `Research`, button `The Well Registry`, mapped size/families/access-name stats, query seeds, footer showing `Default raw ingest 0 GB` and `Mode Pointer`.
- Page header: eyebrow `Research Lab`, H1 `The Well Registry`, explanatory copy, and a boundary callout for `Default ingest: 0 GB raw tensors`.
- Metrics row: `Mapped data`, `Families`, `3D-capable sets`, `Evidence mode`.
- Evidence query panel: title `Find the right simulated world`, textarea, example question chips, and ranked dataset matches.
- Ranked dataset matches: each row shows rank, dataset label, domain/resolution/size, and active-row emphasis.
- Selected source panel: selected dataset family, external docs link, metadata grid, fields pills, phenomena pills, access names, stream probe code block, and local cache command.
- Truth card preview panel: title `What Luca would save`, actions `Save` and `Ask`, question, boundary, evidence loop, measurement pills, and caveats list.
- Luca research loop panel: pipeline from claim to dataset to sample to measurement to truth card.
- Saved evidence panel: `Truth cards`, count, empty state, saved cards, archive affordance, and click-to-reload behavior.
- Source docs panel: Dataset overview, HDF5 data format, WellDataset API, and benchmarks.

## 4. Truth Cards

Store:

- `src/stores/researchStore.ts`

Database:

- `research_evidence_cards`

Migrations:

- `supabase/migrations/20260628160000_research_evidence_cards.sql`
- `supabase/migrations/20260628173000_simulation_artifacts.sql`

A truth card is a persistent research/evidence object. It stores:

- user id
- Luca or agent id
- optional thread id
- optional source message id
- optional artifact id
- title
- question
- dataset id
- dataset label
- evidence level
- claim boundary
- access plan
- measurements
- caveats
- raw access metadata
- result summary
- status
- metadata
- archived state

Truth cards intentionally store pointers and reproducibility plans, not raw tensors.

Evidence levels:

- `simulation-direct`
- `simulation-proxy`
- `catalog-only`

## 5. Chat Research Surfaces

Chat routes:

- `/chat`
- `/chat/:threadId`

Main message renderer:

- `src/components/messages/MessageItem.tsx`

Research-related visual elements in chat:

- Normal Luca prose: conversational response text with evidence boundaries stated in prose.
- Search citations card: `src/components/messages/SearchCitationsCard.tsx`.
- Artifact chip/card: `src/components/canvas/ArtifactChip.tsx`.
- Inline simulation card: `src/components/simulations/SimulationCard.tsx`.

### Search Citations Card

The search citations card appears from citation metadata. It is used for web/search research and is not specific to The Well. It includes:

- `Sources` label
- optional query
- up to 8 citation chips
- citation number
- title
- host
- external-link affordance

### Artifact Chip

Non-simulation artifacts render as compact chips. Supported kinds include:

- HTML page
- React app
- SVG graphic
- diagram
- document
- simulation

Simulation artifacts are visually promoted into the richer inline simulation card rather than staying as a generic chip.

## 6. Inline Simulation Turns

Purpose: let a user ask Luca naturally for physics or simulation work inside chat and receive an inline, reproducible simulation object.

Example intent:

> Show me what radiative cooling does to turbulence.

Simulation artifacts are not arbitrary model-generated JavaScript. They use a declarative JSON contract stored in `artifacts.content`.

Artifact kind:

- `simulation`

Contract sources:

- `supabase/functions/_shared/simulation-artifact.ts`
- `src/lib/simulationArtifacts.ts`

Allowed renderer presets:

- `wave-scattering`
- `reaction-diffusion`
- `fluid-field`
- `field-lines`
- `particle-shell`

Simulation payload contains:

- version
- title
- question
- dataset reference
- evidence boundary
- evidence level
- measurements
- caveats
- preview preset
- fields
- parameters
- initial state
- color mode
- access snippet
- download command
- `raw_ingest_default: false`

## 7. Inline Simulation Card Visual Inventory

Component:

- `src/components/simulations/SimulationCard.tsx`

Visible card sections:

- Header: eyebrow `Inline simulation`, live dot if streaming, title, question, and dataset/access chip.
- Animated preview: deterministic client-side canvas animation, with overlay preset and timestep.
- Field controls: toggles for fields such as velocity, temperature, vorticity, density, and pressure. At least one field remains enabled.
- Timestep scrubber: range from 0 to 100.
- Parameter sliders: generated from payload parameters such as cooling, viscosity, shear, and forcing. Compact mode shows fewer controls.
- Evidence strip: boundary text and measurement chips. Compact mode may reduce or hide measurements.
- Action row: `Save truth card`, `Open canvas`, `Research Lab`, and `Copy config`.
- Toasts: save success, save failure, and sign-in-required states.
- Building state: `Building simulation`, live dot, animated grid placeholder, and status copy explaining that Luca is assembling a deterministic preview and evidence boundary.
- Error/fallback state: `Simulation could not render`, validation error/details, and no blank panel.

## 8. Canvas Workspace Surface

Simulation artifacts reuse the existing canvas pane.

Components:

- `src/components/canvas/ArtifactRenderer.tsx`
- `src/components/canvas/CanvasPane.tsx`
- `src/components/canvas/CanvasPanel.tsx`

Canvas modes:

- side pane inside chat
- fullscreen canvas
- standalone `/canvas/:artifactId`

Simulation behavior:

- `ArtifactRenderer` detects `artifact.kind === "simulation"`.
- It renders `SimulationCard` in fill/canvas mode.
- The toolbar provides preview/code toggle, download, copy, open-in-new-tab, fullscreen, and close actions.

Simulation canvas mode is effectively the expanded Simulation Workspace.

## 9. Runtime Flow

For The Well research:

- Luca detects requests about physics simulation, simulated evidence, truth cards, The Well, datasets, turbulence, cooling, MHD, waves, field lines, reaction diffusion, shocks, and adjacent topics.
- Luca routes relevant requests through `the_well_research`.
- The tool returns stats, selected dataset, ranked matches, truth card, access recipe, and raw-ingest boundary.

Tool definitions:

- `supabase/functions/anima-tool-execute/index.ts`
- `supabase/functions/_shared/agent-runtime/openrouter-agent.ts`

For inline simulation:

- Luca answers with prose plus a hidden fenced `simulation` JSON block.
- The UI suppresses the raw simulation fence.
- The streaming extractor shows a building card while JSON streams.
- The persisted artifact attaches to the assistant message.
- A local fallback preserves streamed simulation artifacts in the current thread if backend extraction has not caught up.

## 10. Current Visual Language

Current research visual style:

- dark, dense, and technical
- restrained borders
- small uppercase mono labels
- warm accent for The Well/science identity
- blue pills for measurement and evidence chips
- card surfaces with subtle gradient and faint borders
- dashboard-style layout rather than marketing layout

Current components use:

- lucide icons
- inline styles in `ResearchView` and `SimulationCard`
- app tokens such as `--text-primary`, `--text-secondary`, `--text-ghost`, `--accent-soft`, `--border-faint`, `--surface-*`, and `--font-mono`

## 11. User-Facing Research Journey

Research tab first:

1. User opens Research.
2. User edits or selects a question.
3. Registry ranks matching datasets.
4. User selects a dataset.
5. UI shows fields, phenomena, access names, stream recipes, and cache recipes.
6. UI previews a truth card.
7. User saves the card or asks Luca in chat.

Chat first:

1. User asks Luca naturally.
2. Luca uses The Well when relevant.
3. Luca replies with prose and an inline simulation card.
4. User scrubs timestep, toggles fields, and adjusts parameters.
5. User saves a truth card.
6. User opens Research Lab or the canvas workspace.

## 12. Important Boundaries

Preserve these boundaries visually:

- Dataset metadata is not raw tensor analysis.
- A deterministic preview is not an observation.
- Simulated evidence depends on equations, solver, grid, parameters, fields, and split.
- Raw tensors are not ingested by default.
- Truth cards preserve reproducibility context, not raw scientific certainty.
- The Well is a registry and grounding substrate, not an oracle.

## 13. Relevant Source Files

Research tab:

- `src/pages/ResearchView.tsx`
- `src/components/sidebar/SidebarResearch.tsx`
- `src/stores/researchStore.ts`
- `src/lib/theWellCatalog.ts`
- `supabase/functions/_shared/the-well-catalog.ts`
- `supabase/functions/the-well-research/index.ts`

Chat research display:

- `src/components/messages/MessageItem.tsx`
- `src/components/messages/SearchCitationsCard.tsx`
- `src/components/canvas/ArtifactChip.tsx`
- `src/components/canvas/ArtifactRenderer.tsx`
- `src/components/canvas/CanvasPane.tsx`

Simulation artifacts:

- `src/components/simulations/SimulationCard.tsx`
- `src/lib/simulationArtifacts.ts`
- `src/lib/simulationTurnIntent.ts`
- `src/lib/streamingArtifacts.ts`
- `supabase/functions/_shared/simulation-artifact.ts`
- `supabase/functions/_shared/artifacts/extract.ts`

Runtime, prompt, and tool routing:

- `supabase/functions/chat-multi/index.ts`
- `supabase/functions/anima-tool-execute/index.ts`
- `supabase/functions/_shared/agent-runtime/openrouter-agent.ts`

Persistence:

- `supabase/migrations/20260628160000_research_evidence_cards.sql`
- `supabase/migrations/20260628173000_simulation_artifacts.sql`

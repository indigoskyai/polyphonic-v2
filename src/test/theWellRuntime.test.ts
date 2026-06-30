import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('The Well runtime integration', () => {
  it('exposes a deployable Edge function backed by the shared catalog', () => {
    const source = readRepoFile('supabase/functions/the-well-research/index.ts');
    const sharedCatalog = readRepoFile('supabase/functions/_shared/the-well-catalog.ts');
    const appReexport = readRepoFile('src/lib/theWellCatalog.ts');

    expect(source).toContain('from "../_shared/the-well-catalog.ts"');
    expect(source).toContain('raw_ingest_default: false');
    expect(source).toContain('catalog_metadata_first_raw_deferred');
    expect(source).toContain('rankWellDatasets(query, limit)');
    expect(source).toContain('serializeDataset(primary)');
    expect(sharedCatalog).toContain('export const THE_WELL_CATALOG');
    expect(sharedCatalog).toContain('export function buildWellResearchPrompt');
    expect(appReexport).toContain("export * from '../../supabase/functions/_shared/the-well-catalog'");
  });

  it('wires The Well into Luca Agent SDK and legacy tool execution', () => {
    const sdk = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');
    const planner = readRepoFile('supabase/functions/anima-tool-execute/index.ts');
    const toolContext = readRepoFile('supabase/functions/_shared/agents/tool-context.ts');

    expect(sdk).toContain('name: "the_well_research"');
    expect(sdk).toContain('invokeEdgeJson(options, "the-well-research"');
    expect(sdk).toContain('does not download raw tensors');

    expect(planner).toContain('name: "the_well_research"');
    expect(planner).toContain('edgeFn = "the-well-research";');
    expect(planner).toContain('user_id: userId');
    expect(planner).toContain('query: args.query');
    expect(planner).toContain('dataset_id: args.dataset_id');
    expect(planner).toContain('limit: args.limit');
    expect(planner).toContain('The Well provides simulated evidence under stated equations/solvers');

    expect(toolContext).toContain('"the_well_research"');
  });

  it('lets ordinary chat route likely The Well questions to the tool path', () => {
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');

    expect(chatMulti).toContain('asksForWellResearch');
    expect(chatMulti).toContain('the_well_research (structured The Well physics-simulation registry');
    expect(chatMulti).toContain('returns catalog/access metadata, not raw tensor analysis');
    expect(chatMulti).toContain('the\\s+well|polymathic|physics\\s+simulation');
  });
});

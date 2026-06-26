import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('agent browse tool wiring', () => {
  it('returns rendered Browserbase inspection instead of model synthesis', () => {
    const browserFn = readRepoFile('supabase/functions/anima-browser/index.ts');

    expect(browserFn).toContain('BROWSERBASE_API_KEY');
    expect(browserFn).toContain('https://api.browserbase.com/v1/sessions');
    expect(browserFn).toContain('connectUrl');
    expect(browserFn).toContain('engine: "browserbase"');
    expect(browserFn).toContain('synthesis: false');
    expect(browserFn).toContain('capabilities: ["render_js", "inspect_dom_text", "extract_links", "extract_forms"]');
    expect(browserFn).toContain('headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))');
    expect(browserFn).toContain('links: Array.from(document.querySelectorAll("a[href]"))');
    expect(browserFn).toContain('forms: Array.from(document.querySelectorAll("form"))');
  });

  it('exposes browse to Agent SDK and subagent runtimes', () => {
    const sdk = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');
    const subagent = readRepoFile('supabase/functions/subagent-run/index.ts');

    expect(sdk).toContain('name: "browse"');
    expect(sdk).toContain('invokeEdgeJson(options, "anima-browser"');
    expect(sdk).toContain('wait_ms');

    expect(subagent).toContain('name: "browse"');
    expect(subagent).toContain('fn: "anima-browser"');
    expect(subagent).toContain('wait_ms: args?.wait_ms');
  });

  it('keeps chat capability copy honest about browser limitations', () => {
    const planner = readRepoFile('supabase/functions/anima-tool-execute/index.ts');
    const chatMulti = readRepoFile('supabase/functions/chat-multi/index.ts');

    expect(planner).toContain('Use this when read_url cannot see browser-rendered state.');
    expect(planner).toContain('If it needs multi-step clicking, logins, forms, or authenticated state');
    expect(chatMulti).toContain('browse (Browserbase rendered-page inspection for JavaScript/dynamic pages)');
  });
});

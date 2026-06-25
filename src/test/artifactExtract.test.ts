import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractArtifactsFromContent, persistArtifactsFromContent } from '../../supabase/functions/_shared/artifacts/extract.ts';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';

describe('extractArtifactsFromContent — model-authored artifacts', () => {
  it('promotes a complete fenced html block and pulls its <title>', () => {
    const html =
      '<!DOCTYPE html>\n<html>\n<head><title>My Page</title></head>\n<body><h1>Hi</h1></body>\n</html>';
    const content = `Sure, here's your page:\n\n${fence('html', html)}\n\nLet me know!`;
    const out = extractArtifactsFromContent(content);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('html');
    expect(out[0].title).toBe('My Page');
    expect(out[0].content).toContain('<h1>Hi</h1>');
    // The surrounding prose must not leak into the artifact body.
    expect(out[0].content).not.toContain('Let me know');
  });

  it('maps jsx/tsx -> react and svg -> svg', () => {
    expect(extractArtifactsFromContent(fence('jsx', 'export default () => <div/>;\n'.repeat(31)))[0].kind)
      .toBe('react');
    const svgBody = '<svg viewBox="0 0 10 10">\n' + '  <rect/>\n'.repeat(31) + '</svg>';
    expect(extractArtifactsFromContent(fence('svg', svgBody))[0].kind).toBe('svg');
  });

  it('keeps small non-markup snippets inline (not artifacts)', () => {
    expect(extractArtifactsFromContent(fence('js', 'console.log("hi");'))).toHaveLength(0);
    expect(extractArtifactsFromContent(fence('python', 'print(1)'))).toHaveLength(0);
  });

  it('does not promote an unterminated (still-streaming) fence', () => {
    expect(extractArtifactsFromContent('```html\n<html><body>partial...')).toHaveLength(0);
  });

  it('promotes a short html/svg block when it carries a closing tag', () => {
    const out = extractArtifactsFromContent(fence('html', '<html><body><p>tiny</p></body></html>'));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('html');
  });
});

describe('persistArtifactsFromContent (shared by classic + agent runtimes)', () => {
  const mockSb = () => {
    const calls: any[] = [];
    return { calls, from: () => ({ insert: async (rows: any) => { calls.push(rows); return { error: null }; } }) };
  };
  const htmlFence = '```html\n<html><body><h1>Hi</h1></body></html>\n```';

  it('inserts one row per promoted artifact, linked to the message', async () => {
    const sb = mockSb();
    await persistArtifactsFromContent(sb as any, { threadId: 't1', userId: 'u1', messageId: 'm1', content: htmlFence });
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0]).toHaveLength(1);
    expect(sb.calls[0][0]).toMatchObject({ user_id: 'u1', thread_id: 't1', source_message_id: 'm1', kind: 'html', version: 1 });
  });

  it('no-ops without a messageId or when there are no artifacts', async () => {
    const a = mockSb();
    await persistArtifactsFromContent(a as any, { threadId: 't1', userId: 'u1', messageId: null, content: htmlFence });
    expect(a.calls).toHaveLength(0);
    const b = mockSb();
    await persistArtifactsFromContent(b as any, { threadId: 't1', userId: 'u1', messageId: 'm1', content: 'just prose, no fence' });
    expect(b.calls).toHaveLength(0);
  });
});

describe('artifact authoring is wired to the model, not the planner', () => {
  it('chat-multi persists model-authored fenced blocks + advertises the instruction', () => {
    const src = readRepoFile('supabase/functions/chat-multi/index.ts');
    expect(src).toContain('persistArtifactsFromContent');
    expect(src).toContain('artifacts/extract.ts'); // shared helper
    expect(src).toContain('const artifactNote');
    expect(src).toContain('turnSystemPrompt + artifactNote + toolCapabilityNote');
    expect(src).toContain('options.maxTokens ?? 16000'); // room for real artifacts, not 4096
  });

  it('the agent (SDK) runtime persists artifacts and has budget for big builds', () => {
    const src = readRepoFile('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');
    expect(src).toContain('persistArtifactsFromContent');
    expect(src).toContain('DEFAULT_MAX_OUTPUT_TOKENS = 16000');
    expect(src).toContain('DEFAULT_MAX_AGENT_COST_USD = 1.0');
    expect(src).not.toContain('maxOutputTokens: 4096'); // the empty/truncated-reply cause
  });

  it('the gemini tool-planner no longer authors artifacts (timeout path removed)', () => {
    const src = readRepoFile('supabase/functions/anima-tool-execute/index.ts');
    expect(src).not.toContain('name: "create_artifact"');
    expect(src).not.toContain('executeCreateArtifact');
  });

  it('backend extractor stays in lockstep with the frontend streaming extractor', () => {
    const backend = readRepoFile('supabase/functions/_shared/artifacts/extract.ts');
    const frontend = readRepoFile('src/lib/streamingArtifacts.ts');
    const KEYS = ['html', 'svg', 'mermaid', 'jsx', 'tsx', 'markdown', 'md'];
    for (const src of [backend, frontend]) {
      expect(src).toMatch(/MIN_LINES = 30/);
      for (const k of KEYS) {
        expect(src).toMatch(new RegExp(`${k}:\\s*['"]`));
      }
    }
  });
});

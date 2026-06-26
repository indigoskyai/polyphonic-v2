import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractDirectContent,
  isSafePublicUrl,
} from '../../supabase/functions/_shared/direct-url-read.ts';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('direct URL reading', () => {
  it('keeps read_url on direct fetch, not Sonar synthesis', () => {
    const readFn = readRepoFile('supabase/functions/anima-web-read/index.ts');
    const searchFn = readRepoFile('supabase/functions/anima-web-search/index.ts');

    expect(readFn).toContain('directFetchAndExtract');
    expect(readFn).toContain('engine: "direct_fetch"');
    expect(readFn).toContain('synthesis: false');
    expect(readFn).not.toContain('perplexityRead');
    expect(readFn).not.toContain('loadUserOpenRouterKey');

    expect(searchFn).toContain('engine: "perplexity_sonar"');
    expect(searchFn).toContain('synthesis: true');
  });

  it('blocks obvious local/private fetch targets', () => {
    expect(isSafePublicUrl('https://example.com/data.json')).toBe(true);
    expect(isSafePublicUrl('http://localhost:54321')).toBe(false);
    expect(isSafePublicUrl('http://127.0.0.1:54321')).toBe(false);
    expect(isSafePublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafePublicUrl('http://192.168.0.1')).toBe(false);
    expect(isSafePublicUrl('file:///etc/passwd')).toBe(false);
  });

  it('extracts readable HTML while preserving raw mode for exact source', () => {
    const html = '<!doctype html><html><head><title>Source &amp; Truth</title><style>.x{}</style></head><body><h1>Hello</h1><script>bad()</script><p>World&nbsp;now</p></body></html>';

    const text = extractDirectContent(html, 'text/html; charset=utf-8', 'text', 1000);
    expect(text.detectedFormat).toBe('html');
    expect(text.title).toBe('Source & Truth');
    expect(text.content).toContain('Hello');
    expect(text.content).toContain('World now');
    expect(text.content).not.toContain('bad()');

    const raw = extractDirectContent(html, 'text/html; charset=utf-8', 'raw', 1000);
    expect(raw.content).toContain('<script>bad()</script>');
    expect(raw.content).toContain('<title>Source &amp; Truth</title>');
  });

  it('returns JSON as source content, not a summary', () => {
    const json = '{"project":"polyphonic","state":{"direct":true}}';
    const out = extractDirectContent(json, 'application/json', 'text', 1000);

    expect(out.detectedFormat).toBe('json');
    expect(out.content).toContain('"project": "polyphonic"');
    expect(out.content).toContain('"direct": true');
  });
});

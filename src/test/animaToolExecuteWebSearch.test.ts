import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

// Regression guards for the web-search/read-url outage and the later
// Sonar-vs-source confusion.
//
// anima-tool-execute dispatches every tool sub-call to its edge function with
// the SERVICE-ROLE key as auth. anima-web-search / anima-web-read resolve the
// user from `body.user_id` whenever the caller is service-role — there is no JWT
// to decode. If user_id is omitted the downstream function returns 401 and the
// agent silently loses web access.
//
// Both bodies MUST carry user_id, exactly like browse / forge / subagent do.
describe('anima-tool-execute web tools pass user_id', () => {
  const source = readRepoFile('supabase/functions/anima-tool-execute/index.ts');

  it('web_search dispatch includes user_id', () => {
    expect(source).toContain('edgeFn = "anima-web-search";');
    expect(source).toContain('body = { user_id: userId, query: args.query };');
    // The old, broken shape must never come back.
    expect(source).not.toContain('body = { query: args.query };');
  });

  it('read_url dispatch includes user_id', () => {
    expect(source).toContain('edgeFn = "anima-web-read";');
    expect(source).toContain('body = { user_id: userId, url: args.url, focus: args.focus, format: args.format, max_chars: args.max_chars };');
    expect(source).not.toContain('body = { url: args.url, focus: args.focus };');
  });

  it('describes web_search as synthesis and read_url as direct fetch', () => {
    expect(source).toContain('Perplexity Sonar — produces a synthesized answer with citations, not raw page content.');
    expect(source).toContain('Directly fetch a specific public URL and return source content/metadata without model synthesis.');
    expect(source).toContain('Trust read_url over web_search for what a specific page actually says.');
  });

  it('browse dispatch includes user_id and Browserbase render controls', () => {
    expect(source).toContain('name: "browse"');
    expect(source).toContain('edgeFn = "anima-browser";');
    expect(source).toContain('wait_ms: args.wait_ms');
    expect(source).toContain('Browserbase browser');
  });
});

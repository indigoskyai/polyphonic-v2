import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

// Regression guard for the web-search/read-url outage.
//
// anima-tool-execute dispatches every tool sub-call to its edge function with
// the SERVICE-ROLE key as auth. anima-web-search / anima-web-read resolve the
// user (and thus their OpenRouter/Sonar key) from `body.user_id` whenever the
// caller is service-role — there is no JWT to decode. If user_id is omitted the
// downstream function returns 401 and the agent silently loses web access.
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
    expect(source).toContain('body = { user_id: userId, url: args.url, focus: args.focus };');
    expect(source).not.toContain('body = { url: args.url, focus: args.focus };');
  });
});

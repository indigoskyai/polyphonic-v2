import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('import deletion safety', () => {
  it('does not wipe unrelated cognition when deleting an import', () => {
    const source = read('supabase/functions/delete-import/index.ts');

    expect(source).not.toContain('COGNITION_TABLES');
    expect(source).not.toContain('.gte("created_at"');
    expect(source).not.toContain('.lte("created_at"');
    expect(source).toContain('.filter("provenance->>import_id", "eq", import_id)');
    expect(source).toContain('.filter("source_context->>import_id", "eq", import_id)');
  });

  it('keeps clear-import scoped to explicit import provenance', () => {
    const source = read('supabase/functions/clear-import/index.ts');

    expect(source).not.toContain('.gte("created_at"');
    expect(source).not.toContain('.lte("created_at"');
    expect(source).toContain('.filter("provenance->>import_id", "eq", import_id)');
    expect(source).toContain('.filter("source_context->>import_id", "eq", import_id)');
  });
});

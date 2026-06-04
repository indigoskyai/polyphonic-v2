import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Journal sidebar filters', () => {
  it('drives the same URL-backed notebook filter as the header tabs', () => {
    const journal = readRepoFile('src/pages/JournalView.tsx');
    const sidebar = readRepoFile('src/components/sidebar/SidebarJournal.tsx');

    expect(journal).toContain("searchParams.get('view')");
    expect(journal).toContain("next.set('view', value)");
    expect(journal).toContain('setNotebookFilter(value as NotebookFilter)');

    expect(sidebar).toContain("new URLSearchParams(location.search).get('view')");
    expect(sidebar).toContain("params.set('view', id)");
    expect(sidebar).toContain('navigate(`${location.pathname}${search ? `?${search}` : \'\'}');
    expect(sidebar).toContain('onClick={() => selectFilter(id)}');
    expect(sidebar).toContain("selectedFilter === id ? ' active' : ''");
  });
});

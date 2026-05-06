import { describe, expect, it, vi } from 'vitest';
import {
  formatProjectContextPrompt,
  loadProjectContextForThread,
} from '../../supabase/functions/_shared/projects/context';

function fakeSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let selected: string[] | null = null;
      return {
        select(columns: string) {
          selected = columns.split(',').map((column) => column.trim()).filter(Boolean);
          return this;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return this;
        },
        async maybeSingle() {
          const rows = tables[table] || [];
          const row = rows.find((item) => filters.every(([column, value]) => item[column] === value)) || null;
          const data = row && selected
            ? Object.fromEntries(selected.map((column) => [column, row[column]]))
            : row;
          return { data, error: null };
        },
      };
    },
  };
}

describe('project runtime context', () => {
  it('formats active project context without owning Luca identity', () => {
    const block = formatProjectContextPrompt({
      id: 'p1',
      name: 'Launch Project',
      description: 'Get the MVP ready.',
      instructions: 'Keep scope tight and cite launch risks.',
    });

    expect(block).toContain('## Current project');
    expect(block).toContain('Project: Launch Project');
    expect(block).toContain('Description: Get the MVP ready.');
    expect(block).toContain('Instructions:\nKeep scope tight and cite launch risks.');
    expect(block).toContain('locked identity remain higher priority');
  });

  it('omits project context when no project is active', () => {
    expect(formatProjectContextPrompt(null)).toBe('');
  });

  it('loads project context from the owning thread when present', async () => {
    const supabase = fakeSupabase({
      threads: [{ id: 't1', user_id: 'u1', project_id: 'p1' }],
      projects: [{ id: 'p1', user_id: 'u1', archived: false, name: 'Research', description: null, instructions: 'Prefer primary sources.' }],
    });

    await expect(loadProjectContextForThread(supabase, 'u1', 't1')).resolves.toEqual({
      id: 'p1',
      name: 'Research',
      description: null,
      instructions: 'Prefer primary sources.',
    });
  });

  it('fails soft when project lookup errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            if (table === 'threads') return { data: { project_id: 'p1' }, error: null };
            return { data: null, error: { message: 'network unavailable' } };
          },
        };
      },
    };

    await expect(loadProjectContextForThread(supabase, 'u1', 't1')).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith('[projects] failed to load project context', { message: 'network unavailable' });
    warn.mockRestore();
  });
});

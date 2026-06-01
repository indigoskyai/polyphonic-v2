import { describe, expect, it } from 'vitest';
import { sortProjects, threadsForProject, type Project } from '@/stores/projectStore';
import type { Thread } from '@/stores/threadStore';

function project(id: string, updated_at: string, pinned = false): Project {
  return {
    id,
    user_id: 'u1',
    name: id,
    description: null,
    instructions: null,
    color: 'neutral',
    icon: 'folder',
    pinned,
    archived: false,
    metadata: {},
    created_at: updated_at,
    updated_at,
  };
}

function thread(id: string, project_id: string | null, updated_at: string): Thread {
  return {
    id,
    user_id: 'u1',
    title: id,
    pinned: false, starred: false, archived: false,
    heat: 'warm',
    agent_id: 'luca',
    primary_agent_id: 'luca',
    participating_agent_ids: ['luca'],
    project_id,
    created_at: updated_at,
    updated_at,
  };
}

describe('project store helpers', () => {
  it('sorts pinned projects first, then by recent activity', () => {
    expect(sortProjects([
      project('older', '2026-05-01T00:00:00.000Z'),
      project('pinned-old', '2026-05-01T00:00:00.000Z', true),
      project('newer', '2026-05-03T00:00:00.000Z'),
      project('pinned-new', '2026-05-04T00:00:00.000Z', true),
    ]).map((item) => item.id)).toEqual(['pinned-new', 'pinned-old', 'newer', 'older']);
  });

  it('filters and sorts project threads by recent activity', () => {
    expect(threadsForProject([
      thread('outside', null, '2026-05-05T00:00:00.000Z'),
      thread('older', 'p1', '2026-05-02T00:00:00.000Z'),
      thread('other-project', 'p2', '2026-05-06T00:00:00.000Z'),
      thread('newer', 'p1', '2026-05-04T00:00:00.000Z'),
    ], 'p1').map((item) => item.id)).toEqual(['newer', 'older']);
  });
});

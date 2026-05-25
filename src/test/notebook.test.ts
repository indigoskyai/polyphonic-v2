import { describe, expect, it } from 'vitest';
import {
  buildNotebookItems,
  filterNotebookItems,
  groupNotebookItemsByDay,
} from '@/lib/notebook';
import type { ActivityEntry, Belief, JournalEntry, MindEngram, Thought } from '@/stores/cognitiveStore';

const t0 = '2026-05-22T12:00:00.000Z';

function engram(id: string, content: string, tags: string[], created_at = t0): MindEngram {
  return {
    id,
    agent_id: 'jerry',
    content,
    engram_type: 'semantic',
    strength: 0.82,
    accessibility: 0.55,
    surprise_score: 0.2,
    tags,
    source_context: {},
    created_at,
  };
}

describe('notebook normalization', () => {
  it('merges journal, thought, engram, belief, and activity rows into a sorted feed', () => {
    const journalEntries: JournalEntry[] = [
      { id: 'j1', agent_id: 'jerry', content: 'a journal note', mood: 'quiet', trigger_type: 'periodic', created_at: '2026-05-22T10:00:00.000Z' },
    ];
    const thoughts: Thought[] = [
      { id: 't1', agent_id: 'jerry', type: 'question', content: 'what should i return to?', trigger: null, salience: 0.7, source: 'question', created_at: '2026-05-22T11:00:00.000Z' },
    ];
    const beliefs: Belief[] = [
      { id: 'b1', text: 'riley values continuity by behavior', strength: 0.91, domain: 'continuity', created_at: '2026-05-21T09:00:00.000Z' },
    ];
    const activityLog: ActivityEntry[] = [
      { id: 'a1', agent_id: 'jerry', activity_type: 'task_completed', title: 'Task completed', summary: 'finished a task', content: null, source: 'autonomous', created_at: '2026-05-22T13:00:00.000Z' },
    ];

    const items = buildNotebookItems({
      journalEntries,
      thoughts,
      dreams: [],
      insights: [engram('e1', 'a crystallized insight', ['insight'])],
      reflections: [],
      wanderings: [],
      beliefs,
      activityLog,
    });

    expect(items.map((i) => i.kind)).toEqual(['activity', 'insight', 'question', 'journal', 'belief']);
    expect(items[0].created_at).toBe('2026-05-22T13:00:00.000Z');
  });

  it('suppresses duplicate activity rows for first-class notebook content', () => {
    const items = buildNotebookItems({
      journalEntries: [
        { id: 'j1', agent_id: 'jerry', content: 'same journal content', mood: 'reflective', trigger_type: 'periodic', created_at: t0 },
      ],
      thoughts: [],
      dreams: [],
      insights: [],
      reflections: [],
      wanderings: [],
      beliefs: [],
      activityLog: [
        { id: 'a1', agent_id: 'jerry', activity_type: 'journal_written', title: 'Journal entry written', summary: 'same journal content', content: null, source: 'autonomous', created_at: t0 },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('journal');
  });

  it('filters by kind, today, salient, and search', () => {
    const items = buildNotebookItems({
      journalEntries: [],
      thoughts: [
        { id: 't1', agent_id: 'jerry', type: 'wandering', content: 'blue room noticing', trigger: null, salience: 0.3, source: 'background', created_at: t0 },
        { id: 't2', agent_id: 'jerry', type: 'reflection', content: 'high salience thread', trigger: null, salience: 0.9, source: 'reflection', created_at: t0 },
      ],
      dreams: [],
      insights: [],
      reflections: [],
      wanderings: [],
      beliefs: [],
      activityLog: [],
    });

    expect(filterNotebookItems(items, 'wandering', '')).toHaveLength(1);
    expect(filterNotebookItems(items, 'salient', '')).toHaveLength(1);
    expect(filterNotebookItems(items, 'all', 'blue room')).toHaveLength(1);
  });

  it('groups entries by readable day label', () => {
    const items = buildNotebookItems({
      journalEntries: [
        { id: 'j1', agent_id: 'jerry', content: 'today', mood: null, trigger_type: null, created_at: '2026-05-22T10:00:00.000Z' },
        { id: 'j2', agent_id: 'jerry', content: 'yesterday', mood: null, trigger_type: null, created_at: '2026-05-21T10:00:00.000Z' },
      ],
      thoughts: [],
      dreams: [],
      insights: [],
      reflections: [],
      wanderings: [],
      beliefs: [],
      activityLog: [],
    });

    expect([...groupNotebookItemsByDay(items).keys()]).toEqual([
      'Friday, May 22, 2026',
      'Thursday, May 21, 2026',
    ]);
  });

  it('keeps notebook ids unique when source rows carry repeated placeholder ids', () => {
    const items = buildNotebookItems({
      journalEntries: [],
      thoughts: [],
      dreams: [],
      insights: [
        engram('insight', 'first crystallized pattern', ['insight'], '2026-05-22T10:00:00.000Z'),
        engram('insight', 'second crystallized pattern', ['insight'], '2026-05-22T11:00:00.000Z'),
      ],
      reflections: [],
      wanderings: [],
      beliefs: [],
      activityLog: [],
    });

    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});

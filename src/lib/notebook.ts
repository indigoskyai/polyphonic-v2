import type {
  ActivityEntry,
  Belief,
  JournalEntry,
  MindEngram,
  Thought,
} from '@/stores/cognitiveStore';

export type NotebookKind =
  | 'journal'
  | 'thought'
  | 'question'
  | 'wandering'
  | 'dream'
  | 'insight'
  | 'reflection'
  | 'belief'
  | 'activity';

export type NotebookFilter = 'all' | NotebookKind | 'today' | 'salient';

export interface NotebookItem {
  id: string;
  kind: NotebookKind;
  label: string;
  title: string;
  body: string;
  created_at: string;
  source: 'journal_entries' | 'thought_stream' | 'engrams' | 'beliefs' | 'entity_activity_log';
  salience?: number;
  meta?: string;
  tags?: string[];
  integrityStatus?: 'valid' | 'suspect' | 'rejected';
  integrityReason?: string | null;
}

interface BuildNotebookInput {
  journalEntries: JournalEntry[];
  thoughts: Thought[];
  dreams: MindEngram[];
  insights: MindEngram[];
  reflections: MindEngram[];
  wanderings: Thought[];
  beliefs: Belief[];
  activityLog: ActivityEntry[];
}

export const NOTEBOOK_FILTERS: Array<{ id: NotebookFilter; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'journal', label: 'journal' },
  { id: 'thought', label: 'thoughts' },
  { id: 'wandering', label: 'wanderings' },
  { id: 'dream', label: 'dreams' },
  { id: 'insight', label: 'insights' },
  { id: 'reflection', label: 'reflections' },
  { id: 'belief', label: 'beliefs' },
  { id: 'activity', label: 'activity' },
  { id: 'today', label: 'today' },
  { id: 'salient', label: 'salient' },
];

const CONTENT_ACTIVITY_TYPES = new Set([
  'journal',
  'journal_written',
  'thought',
  'background_think',
  'dream',
  'wandering',
  'insight_crystallized',
  'reflection',
  'belief_change',
  'belief_challenged',
  'consolidation',
]);

const KIND_RANK: Record<NotebookKind, number> = {
  journal: 9,
  dream: 8,
  insight: 7,
  reflection: 6,
  belief: 5,
  question: 4,
  wandering: 3,
  thought: 2,
  activity: 1,
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactIdPart(value: unknown): string {
  return normalizeText(String(value ?? ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function notebookId(
  prefix: NotebookKind,
  rawId: unknown,
  createdAt: string | null | undefined,
  body: string,
  index: number,
): string {
  const id = compactIdPart(rawId);
  const fallback = compactIdPart(`${createdAt ?? 'undated'}-${body.slice(0, 96)}-${index}`);
  return id ? `${prefix}:${id}:${fallback}` : `${prefix}:${fallback || index}`;
}

function withinMinutes(a: string, b: string, minutes: number): boolean {
  const delta = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return delta <= minutes * 60_000;
}

function itemKey(item: NotebookItem): string {
  return normalizeText(item.body).slice(0, 180);
}

function addDeduped(items: NotebookItem[], next: NotebookItem) {
  const key = itemKey(next);
  if (!key) return;
  const existingIndex = items.findIndex((item) => itemKey(item) === key && withinMinutes(item.created_at, next.created_at, 10));
  if (existingIndex === -1) {
    items.push(next);
    return;
  }

  const existing = items[existingIndex];
  if (KIND_RANK[next.kind] > KIND_RANK[existing.kind]) {
    items[existingIndex] = next;
  }
}

function thoughtKind(thought: Thought): NotebookKind {
  const kind = (thought.type || thought.source || '').toLowerCase();
  if (kind.includes('question')) return 'question';
  if (kind.includes('wander') || kind.includes('musing') || kind.includes('observation')) return 'wandering';
  if (kind.includes('reflect')) return 'reflection';
  return 'thought';
}

function engramSalience(engram: MindEngram): number | undefined {
  return [engram.strength, engram.accessibility, engram.surprise_score]
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => b - a)[0];
}

function activityLabel(type: string): string {
  if (type.includes('task')) return 'activity';
  if (type.includes('search') || type.includes('read')) return 'activity';
  if (type.includes('connection')) return 'activity';
  if (type.includes('observe')) return 'activity';
  return 'activity';
}

export function buildNotebookItems(input: BuildNotebookInput): NotebookItem[] {
  const items: NotebookItem[] = [];
  const wanderingIds = new Set(input.wanderings.map((t) => t.id));

  for (const [index, entry] of input.journalEntries.entries()) {
    const isDream = (entry.mood || '').toLowerCase().includes('dream');
    addDeduped(items, {
      id: notebookId(isDream ? 'dream' : 'journal', entry.id, entry.created_at, entry.content, index),
      kind: isDream ? 'dream' : 'journal',
      label: isDream ? 'dream' : 'journal',
      title: entry.mood || (isDream ? 'Dream' : 'Journal entry'),
      body: entry.content,
      created_at: entry.created_at,
      source: 'journal_entries',
      meta: entry.trigger_type ? entry.trigger_type.replace(/_/g, ' ') : undefined,
      integrityStatus: entry.content_integrity_status,
      integrityReason: entry.content_integrity_reason,
    });
  }

  for (const [index, thought] of input.thoughts.entries()) {
    if (wanderingIds.has(thought.id)) continue;
    const kind = thoughtKind(thought);
    addDeduped(items, {
      id: notebookId(kind, thought.id, thought.created_at, thought.content, index),
      kind,
      label: kind === 'question' ? 'question' : kind === 'reflection' ? 'reflection' : 'thought',
      title: kind === 'question' ? 'Question surfaced' : kind === 'reflection' ? 'Reflection' : 'Thought',
      body: thought.content,
      created_at: thought.created_at,
      source: 'thought_stream',
      salience: thought.salience,
      meta: thought.trigger || thought.source,
      integrityStatus: thought.content_integrity_status,
      integrityReason: thought.content_integrity_reason,
    });
  }

  for (const [index, thought] of input.wanderings.entries()) {
    addDeduped(items, {
      id: notebookId('wandering', thought.id, thought.created_at, thought.content, index),
      kind: 'wandering',
      label: 'wandering',
      title: 'Wandering thought',
      body: thought.content,
      created_at: thought.created_at,
      source: 'thought_stream',
      salience: thought.salience,
      meta: thought.source,
      integrityStatus: thought.content_integrity_status,
      integrityReason: thought.content_integrity_reason,
    });
  }

  for (const [index, dream] of input.dreams.entries()) {
    addDeduped(items, {
      id: notebookId('dream', dream.id, dream.created_at, dream.content, index),
      kind: 'dream',
      label: 'dream',
      title: 'Dream consolidation',
      body: dream.content,
      created_at: dream.created_at,
      source: 'engrams',
      salience: engramSalience(dream),
      tags: dream.tags,
      integrityStatus: dream.content_integrity_status,
      integrityReason: dream.content_integrity_reason,
    });
  }

  for (const [index, insight] of input.insights.entries()) {
    addDeduped(items, {
      id: notebookId('insight', insight.id, insight.created_at, insight.content, index),
      kind: 'insight',
      label: 'insight',
      title: 'Insight',
      body: insight.content,
      created_at: insight.created_at,
      source: 'engrams',
      salience: engramSalience(insight),
      tags: insight.tags,
      integrityStatus: insight.content_integrity_status,
      integrityReason: insight.content_integrity_reason,
    });
  }

  for (const [index, reflection] of input.reflections.entries()) {
    addDeduped(items, {
      id: notebookId('reflection', reflection.id, reflection.created_at, reflection.content, index),
      kind: 'reflection',
      label: 'reflection',
      title: 'Reflection',
      body: reflection.content,
      created_at: reflection.created_at,
      source: 'engrams',
      salience: engramSalience(reflection),
      tags: reflection.tags,
      integrityStatus: reflection.content_integrity_status,
      integrityReason: reflection.content_integrity_reason,
    });
  }

  for (const [index, belief] of input.beliefs.entries()) {
    const date = belief.updated_at || belief.created_at;
    if (!date) continue;
    addDeduped(items, {
      id: notebookId('belief', belief.id, date, belief.text, index),
      kind: 'belief',
      label: 'belief',
      title: belief.domain || belief.confidence_tier || 'Belief',
      body: belief.text,
      created_at: date,
      source: 'beliefs',
      salience: belief.strength,
      meta: belief.confidence_tier || undefined,
      integrityStatus: belief.content_integrity_status,
      integrityReason: belief.content_integrity_reason,
    });
  }

  for (const [index, activity] of input.activityLog.entries()) {
    if (CONTENT_ACTIVITY_TYPES.has(activity.activity_type)) continue;
    const text = activity.summary || activity.title || activity.activity_type.replace(/_/g, ' ');
    addDeduped(items, {
      id: notebookId('activity', activity.id, activity.created_at, text, index),
      kind: 'activity',
      label: activityLabel(activity.activity_type),
      title: activity.title || activity.activity_type.replace(/_/g, ' '),
      body: text,
      created_at: activity.created_at,
      source: 'entity_activity_log',
      meta: activity.source || undefined,
      integrityStatus: activity.content_integrity_status,
      integrityReason: activity.content_integrity_reason,
    });
  }

  return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function filterNotebookItems(items: NotebookItem[], filter: NotebookFilter, query: string): NotebookItem[] {
  let out = items;
  if (filter === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    out = out.filter((item) => new Date(item.created_at) >= start);
  } else if (filter === 'salient') {
    out = out.filter((item) => (item.salience ?? 0) >= 0.6 || ['journal', 'belief'].includes(item.kind));
  } else if (filter === 'thought') {
    out = out.filter((item) => item.kind === 'thought' || item.kind === 'question');
  } else if (filter !== 'all') {
    out = out.filter((item) => item.kind === filter);
  }

  const q = query.trim().toLowerCase();
  if (!q) return out;
  return out.filter((item) => [
    item.title,
    item.body,
    item.label,
    item.meta || '',
    ...(item.tags || []),
  ].join(' ').toLowerCase().includes(q));
}

export function groupNotebookItemsByDay(items: NotebookItem[]): Map<string, NotebookItem[]> {
  const grouped = new Map<string, NotebookItem[]>();
  for (const item of items) {
    const dateKey = new Date(item.created_at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const group = grouped.get(dateKey) ?? [];
    group.push(item);
    grouped.set(dateKey, group);
  }
  return grouped;
}

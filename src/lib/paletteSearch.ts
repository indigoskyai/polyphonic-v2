import type { PaletteResult, Scope } from '@/stores/paletteStore';
import { useThreadStore } from '@/stores/threadStore';
import { useMemoryStore } from '@/stores/memoryStore';

type MatchRange = [number, number];

function computeMatches(title: string, query: string): MatchRange[] {
  if (!query) return [];
  const lower = title.toLowerCase();
  const q = query.toLowerCase();
  const out: MatchRange[] = [];
  let i = 0;
  while (i < lower.length) {
    const idx = lower.indexOf(q, i);
    if (idx < 0) break;
    out.push([idx, idx + q.length]);
    i = idx + q.length;
  }
  return out;
}

function scoreResult(title: string, query: string, recencyScore: number): number {
  if (!query) return recencyScore;
  const lower = title.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 1000 + recencyScore;
  if (lower.startsWith(q)) return 500 + recencyScore;
  if (lower.includes(q)) return 200 + recencyScore;
  // token overlap
  const tokens = q.split(/\s+/).filter(Boolean);
  let hits = 0;
  tokens.forEach((t) => {
    if (lower.includes(t)) hits++;
  });
  if (hits > 0) return 50 * hits + recencyScore;
  return -1;
}

interface NavigationHandlers {
  navigate: (path: string) => void;
  openSettings: () => void;
  openDrawer: (key: 'notifications' | 'activity-timeline' | 'thread-detail' | 'memory-detail' | 'agent-inspector') => void;
  createThread: () => Promise<void> | void;
}

const SETTINGS_STATIC: { id: string; title: string; subtitle: string; path: string }[] = [
  { id: 'settings-agents', title: 'Agents', subtitle: 'Per-agent configuration', path: '/settings/agents' },
  { id: 'settings-memory', title: 'Memory', subtitle: 'Memory browse and digest', path: '/memory' },
  { id: 'settings-import', title: 'Import', subtitle: 'Import conversation data', path: '/import' },
  { id: 'settings-projects', title: 'Projects', subtitle: 'Thread workspaces and instructions', path: '/projects' },
  { id: 'settings-profile', title: 'Profile', subtitle: 'Your account', path: '/profile' },
];

export function buildResults(
  query: string,
  scope: Scope,
  handlers: NavigationHandlers,
): PaletteResult[] {
  const threads = useThreadStore.getState().threads;
  const memories = useMemoryStore.getState().memories;

  const out: PaletteResult[] = [];

  // Threads
  if (scope === 'all' || scope === 'threads') {
    threads.forEach((t, idx) => {
      const title = t.title || 'Untitled thread';
      const score = scoreResult(title, query, Math.max(0, 40 - idx));
      if (score < 0 && query) return;
      out.push({
        id: `thread-${t.id}`,
        scope: 'threads',
        title,
        subtitle: t.heat,
        glyph: 'thread',
        hint: '↵ open',
        matches: computeMatches(title, query),
        onActivate: () => handlers.navigate(`/chat/${t.id}`),
      });
    });
  }

  // Memory
  if (scope === 'all' || scope === 'memory') {
    memories.forEach((m, idx) => {
      const title = m.content.slice(0, 80);
      const score = scoreResult(title, query, Math.max(0, 40 - idx));
      if (score < 0 && query) return;
      out.push({
        id: `memory-${m.id}`,
        scope: 'memory',
        title,
        subtitle: m.memory_type,
        glyph: 'memory',
        hint: '↵ open',
        matches: computeMatches(title, query),
        onActivate: () => handlers.navigate('/memory'),
      });
    });
  }

  // Settings
  if (scope === 'all' || scope === 'settings') {
    SETTINGS_STATIC.forEach((s, idx) => {
      const score = scoreResult(s.title, query, Math.max(0, 20 - idx));
      if (score < 0 && query) return;
      out.push({
        id: s.id,
        scope: 'settings',
        title: s.title,
        subtitle: s.subtitle,
        glyph: 'setting',
        hint: '↵ open',
        matches: computeMatches(s.title, query),
        onActivate: () => handlers.navigate(s.path),
      });
    });
  }

  // Re-sort by score when query non-empty
  if (query) {
    out.sort((a, b) => {
      const sa = scoreResult(a.title, query, 0);
      const sb = scoreResult(b.title, query, 0);
      return sb - sa;
    });
  }

  // Cap results
  return out.slice(0, 30);
}

export function buildQuickActions(handlers: NavigationHandlers): PaletteResult[] {
  return [
    {
      id: 'qa-new-thread',
      scope: 'threads',
      title: 'New thread',
      subtitle: 'Start a new conversation',
      glyph: 'agent-luca',
      hint: 'ACTION ↵',
      onActivate: () => { void handlers.createThread(); },
    },
    {
      id: 'qa-group',
      scope: 'settings',
      title: 'Open group session',
      subtitle: 'Multi-agent voice room',
      glyph: 'agent-vektor',
      hint: 'ACTION ↵',
      onActivate: () => handlers.navigate('/group'),
    },
    {
      id: 'qa-settings',
      scope: 'settings',
      title: 'Open settings',
      glyph: 'setting',
      hint: 'ACTION ↵',
      onActivate: () => handlers.openSettings(),
    },
    {
      id: 'qa-observer',
      scope: 'settings',
      title: 'Summon Guardian',
      subtitle: 'Notifications',
      glyph: 'agent-anima',
      hint: 'ACTION ↵',
      onActivate: () => handlers.openDrawer('notifications'),
    },
    {
      id: 'qa-activity-timeline',
      scope: 'settings',
      title: 'Activity timeline',
      subtitle: 'Everything Luca has done autonomously',
      glyph: 'agent-luca',
      hint: 'ACTION ↵',
      onActivate: () => handlers.openDrawer('activity-timeline'),
    },
  ];
}

export function getScopeCounts(handlers: NavigationHandlers): Record<Scope, number> {
  const all = buildResults('', 'all', handlers);
  return {
    all: all.length,
    threads: all.filter((r) => r.scope === 'threads').length,
    memory: all.filter((r) => r.scope === 'memory').length,
    files: 0,
    settings: all.filter((r) => r.scope === 'settings').length,
  };
}

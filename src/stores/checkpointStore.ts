import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  oldNum?: number;
  newNum?: number;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface CheckpointFile {
  path: string;
  added: number;
  removed: number;
  diff?: DiffHunk[];
  diffLoading?: boolean;
}

export interface Checkpoint {
  id: string;
  createdAt: string;
  agent: 'luca' | 'vektor' | 'anima' | 'observer';
  summary: string;
  annotation?: string | null;
  milestone: boolean;
  filesAdded: number;
  filesRemoved: number;
  files: CheckpointFile[];
  filesLoaded?: boolean;
}

interface CompareFile {
  path: string;
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

interface CompareResult {
  id_a: string;
  id_b: string;
  files: CompareFile[];
}

interface CheckpointState {
  checkpoints: Checkpoint[];
  loading: boolean;
  expandedIds: Set<string>;
  openFiles: Record<string, Set<string>>;
  selectedForCompare: [string | null, string | null];
  compareResult: CompareResult | null;
  compareLoading: boolean;
  load: (userId: string) => Promise<void>;
  subscribe: (userId: string) => () => void;
  toggleExpand: (id: string) => Promise<void>;
  loadFiles: (checkpointId: string) => Promise<void>;
  loadDiff: (checkpointId: string, filePath: string) => Promise<void>;
  toggleFileOpen: (checkpointId: string, filePath: string) => Promise<void>;
  selectForCompare: (id: string) => void;
  clearCompare: () => void;
  runCompare: () => Promise<void>;
  restore: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

function parseUnifiedDiff(blob: string): DiffHunk[] {
  if (!blob) return [];
  const lines = blob.split('\n');
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNum = 0;
  let newNum = 0;
  const header = /^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/;
  for (const line of lines) {
    const m = line.match(header);
    if (m) {
      if (current) hunks.push(current);
      oldNum = parseInt(m[1], 10);
      newNum = parseInt(m[2], 10);
      current = { oldStart: oldNum, newStart: newNum, lines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.lines.push({ type: 'add', newNum, text: line.slice(1) });
      newNum++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.lines.push({ type: 'del', oldNum, text: line.slice(1) });
      oldNum++;
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    } else {
      const text = line.startsWith(' ') ? line.slice(1) : line;
      current.lines.push({ type: 'context', oldNum, newNum, text });
      oldNum++;
      newNum++;
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  loading: false,
  expandedIds: new Set<string>(),
  openFiles: {},
  selectedForCompare: [null, null],
  compareResult: null,
  compareLoading: false,

  load: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('checkpoints')
      .select('id, created_at, agent, summary, annotation, milestone, files_added, files_removed')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[checkpointStore] load failed', error);
      set({ loading: false });
      return;
    }
    const list: Checkpoint[] = (data ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      agent: (r.agent as Checkpoint['agent']) ?? 'luca',
      summary: r.summary,
      annotation: r.annotation,
      milestone: r.milestone,
      filesAdded: r.files_added,
      filesRemoved: r.files_removed,
      files: [],
    }));
    set({ checkpoints: list, loading: false });
  },

  subscribe: (userId) => {
    const channel = supabase
      .channel(`checkpoints:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'checkpoints', filter: `user_id=eq.${userId}` },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          const cp: Checkpoint = {
            id: r.id as string,
            createdAt: r.created_at as string,
            agent: (r.agent as Checkpoint['agent']) ?? 'luca',
            summary: r.summary as string,
            annotation: (r.annotation as string | null) ?? null,
            milestone: Boolean(r.milestone),
            filesAdded: Number(r.files_added ?? 0),
            filesRemoved: Number(r.files_removed ?? 0),
            files: [],
          };
          set((s) => ({ checkpoints: [cp, ...s.checkpoints] }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  loadFiles: async (checkpointId) => {
    const cp = get().checkpoints.find((c) => c.id === checkpointId);
    if (!cp || cp.filesLoaded) return;
    const { data } = await supabase
      .from('checkpoint_files')
      .select('id, path, added, removed, diff_blob')
      .eq('checkpoint_id', checkpointId)
      .order('path', { ascending: true });
    const files: CheckpointFile[] = (data ?? []).map((r) => ({
      path: r.path as string,
      added: Number(r.added ?? 0),
      removed: Number(r.removed ?? 0),
    }));
    set((s) => ({
      checkpoints: s.checkpoints.map((c) =>
        c.id === checkpointId ? { ...c, files, filesLoaded: true } : c,
      ),
    }));
  },

  loadDiff: async (checkpointId, filePath) => {
    const cp = get().checkpoints.find((c) => c.id === checkpointId);
    const file = cp?.files.find((f) => f.path === filePath);
    if (!cp || !file || file.diff) return;
    set((s) => ({
      checkpoints: s.checkpoints.map((c) => c.id !== checkpointId ? c : ({
        ...c,
        files: c.files.map((f) => f.path === filePath ? { ...f, diffLoading: true } : f),
      })),
    }));
    const { data } = await supabase
      .from('checkpoint_files')
      .select('diff_blob')
      .eq('checkpoint_id', checkpointId)
      .eq('path', filePath)
      .maybeSingle();
    const blob = (data as { diff_blob?: string | null } | null)?.diff_blob ?? '';
    const hunks = parseUnifiedDiff(blob);
    set((s) => ({
      checkpoints: s.checkpoints.map((c) => c.id !== checkpointId ? c : ({
        ...c,
        files: c.files.map((f) => f.path === filePath ? { ...f, diff: hunks, diffLoading: false } : f),
      })),
    }));
  },

  toggleExpand: async (id) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
      set({ expandedIds: next });
      return;
    }
    next.add(id);
    set({ expandedIds: next });
    await get().loadFiles(id);
  },

  toggleFileOpen: async (checkpointId, filePath) => {
    const open = get().openFiles[checkpointId] ?? new Set<string>();
    const next = new Set(open);
    if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
      await get().loadDiff(checkpointId, filePath);
    }
    set((s) => ({ openFiles: { ...s.openFiles, [checkpointId]: next } }));
  },

  selectForCompare: (id) => set((s) => {
    const [a, b] = s.selectedForCompare;
    if (a === id) return { selectedForCompare: [null, b] };
    if (b === id) return { selectedForCompare: [a, null] };
    if (!a) return { selectedForCompare: [id, b] };
    if (!b) return { selectedForCompare: [a, id] };
    return { selectedForCompare: [b, id] };
  }),

  clearCompare: () => set({ selectedForCompare: [null, null], compareResult: null }),

  runCompare: async () => {
    const [a, b] = get().selectedForCompare;
    if (!a || !b) return;
    set({ compareLoading: true, compareResult: null });
    const { data, error } = await supabase.functions.invoke('checkpoint-diff', {
      body: { id_a: a, id_b: b },
    });
    if (error) {
      console.error('[checkpointStore] compare failed', error);
      set({ compareLoading: false });
      return;
    }
    const payload = data as CompareResult | null;
    set({ compareResult: payload ?? { id_a: a, id_b: b, files: [] }, compareLoading: false });
  },

  restore: async (id) => {
    const { error } = await supabase.functions.invoke('checkpoint-restore', {
      body: { checkpoint_id: id },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
}));

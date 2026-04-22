import { create } from 'zustand';

export type WidgetKind =
  | 'metric'
  | 'timeline'
  | 'heatmap'
  | 'list'
  | 'scatter'
  | 'narrative'
  | 'comparison'
  | 'radial'
  | 'quote_stream';

export interface WidgetSpec {
  kind: WidgetKind;
  title: string;
  subtitle?: string;
  query: {
    table: string;
    select?: string[];
    time_column?: string;
    time_range_days?: number;
    order_by?: string;
    limit?: number;
    group_by?: string;
    aggregate?: 'count' | 'avg' | 'sum' | 'min' | 'max' | 'none';
    aggregate_column?: string;
    tag_filter?: string[];
  };
  render_hints?: {
    palette?: 'neutral' | 'warm' | 'cool' | 'luca';
    density?: 'quiet' | 'normal' | 'dense';
    sparkline?: boolean;
    unit?: string;
    text?: string;
  };
}

export interface DashboardWidget {
  id: string;
  prompt: string;
  spec: WidgetSpec;
  position: number;
  pinned: boolean;
  archived: boolean;
  model: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DashboardState {
  widgets: DashboardWidget[];
  setWidgets: (w: DashboardWidget[]) => void;
  upsertWidget: (w: DashboardWidget) => void;
  removeWidget: (id: string) => void;
  reorder: (ids: string[]) => void;

  // Model preference (persisted to localStorage)
  preferredModel: string;
  useOpenRouter: boolean;
  setPreferredModel: (m: string) => void;
  setUseOpenRouter: (b: boolean) => void;
}

const MODEL_KEY = 'dashboard:preferred-model';
const OR_KEY = 'dashboard:use-openrouter';

function loadModel(): string {
  if (typeof window === 'undefined') return 'openai/gpt-5';
  return localStorage.getItem(MODEL_KEY) || 'openai/gpt-5';
}
function loadOR(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(OR_KEY) === '1';
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  setWidgets: (w) => set({ widgets: w }),
  upsertWidget: (w) => {
    const cur = get().widgets;
    const i = cur.findIndex((x) => x.id === w.id);
    if (i === -1) set({ widgets: [...cur, w].sort((a, b) => a.position - b.position) });
    else {
      const next = cur.slice();
      next[i] = w;
      set({ widgets: next });
    }
  },
  removeWidget: (id) => set({ widgets: get().widgets.filter((w) => w.id !== id) }),
  reorder: (ids) => {
    const map = new Map(get().widgets.map((w) => [w.id, w] as const));
    const next: DashboardWidget[] = [];
    ids.forEach((id, idx) => {
      const w = map.get(id);
      if (w) next.push({ ...w, position: idx });
    });
    set({ widgets: next });
  },

  preferredModel: loadModel(),
  useOpenRouter: loadOR(),
  setPreferredModel: (m) => {
    try { localStorage.setItem(MODEL_KEY, m); } catch {}
    set({ preferredModel: m });
  },
  setUseOpenRouter: (b) => {
    try { localStorage.setItem(OR_KEY, b ? '1' : '0'); } catch {}
    set({ useOpenRouter: b });
  },
}));

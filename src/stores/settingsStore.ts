import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface Settings {
  default_model: string;
  synthesis_style: string;
  stream_responses: boolean;
  show_thinking: boolean;
  auto_title: boolean;
  interface_density: string;
  font_size: number;
  show_timestamps: boolean;
  show_agent_colors: boolean;
  clockbar_visible: boolean;
  // Multi-model ensemble settings
  multi_model_enabled: boolean;
  ensemble_models: string[];
  synthesis_model: string;
  reasoning_effort: 'low' | 'medium' | 'high';
}

interface SettingsState extends Settings {
  loaded: boolean;
  loadSettings: (userId: string) => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
}

const defaults: Settings = {
  default_model: 'anthropic/claude-opus-4-7',
  synthesis_style: 'conversational',
  stream_responses: true,
  show_thinking: true,
  auto_title: true,
  interface_density: 'default',
  font_size: 14,
  show_timestamps: true,
  show_agent_colors: true,
  clockbar_visible: false,
  // Multi-model defaults — ensemble is opt-in per Riley's preference; the
  // single-Luca path with the L7 tool planner gives a coherent voice while
  // the ensemble's three-voice synthesis adds latency and an editorialization
  // risk on tool-heavy turns. Users can flip it back on in Settings.
  multi_model_enabled: false,
  ensemble_models: [
    'anthropic/claude-opus-4-7',
    'openai/gpt-5.4',
    'google/gemini-3.1-pro-preview',
  ],
  synthesis_model: 'anthropic/claude-opus-4-7',
  reasoning_effort: 'medium',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loaded: false,

  loadSettings: async (userId) => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (data) {
      set({ ...defaults, ...data, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  updateSetting: async (key, value) => {
    set({ [key]: value } as any);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .update({ [key]: value })
        .eq('user_id', user.id);
    }
  },
}));
